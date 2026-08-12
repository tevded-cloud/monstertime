// connection.ts: the one WebSocket a client holds for a group, and the one
// place that decides what "connected" means for the rest of the app.
//
// The server is the sole author of ActionRecord.id and ActionRecord.at,
// because those two fields decide the order pressure gets applied in, and
// pressure order decides which alleles express. A client that invented its
// own id for an optimistic update would be gambling with the creature's
// actual shape just to make a button feel half a second snappier. That
// trade is not worth it, so act() only ever asks; the UI learns what
// happened from the server's own echo, same as every other viewer does.

import type {
  ActionRecord,
  ClientMessage,
  GroupSnapshot,
  PresentActor,
  ServerMessage,
} from '../core/types'

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface Connection {
  subscribe(fn: (snapshot: GroupSnapshot, present: PresentActor[]) => void): () => void
  act(variantId: string): void
  rename(name: string): void
  /** How fast the group wants the creature to live. Clamped by the server. */
  setPace(pace: number): void
  /** Ask for a code that says which member of this group this is. Answered once
   *  and never again, so the caller has to do something with it. */
  claim(): void
  /** Fires the one time a code is minted, and never after. */
  onClaimed(fn: (claimed: { actorId: string; code: string }) => void): () => void
  close(): void
  onStatus(fn: (status: ConnectionStatus) => void): () => void
}

type SnapshotListener = (snapshot: GroupSnapshot, present: PresentActor[]) => void
type StatusListener = (status: ConnectionStatus) => void

// Backoff shape: start quick (a dropped wifi packet should recover almost
// unnoticed), double each further failure, and cap so a long outage still
// retries every fifteen seconds rather than trailing off into minutes.
// Jitter keeps every tab in a group from hammering the Durable Object on
// the same tick if a whole household's connection blinks at once.
const INITIAL_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 15_000
const RETRY_MULTIPLIER = 2
const JITTER_FRACTION = 0.3

function socketUrl(groupId: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${location.host}/api/monstertime/groups/${encodeURIComponent(groupId)}/socket`
}

class SocketConnection implements Connection {
  private readonly groupId: string
  private readonly actor: { id: string; name: string }
  /** Sent on every connect once there is one, which is what makes a reconnect
   *  come back as the same person rather than as a fresh guest. */
  private code: string | null
  private readonly claimListeners = new Set<(c: { actorId: string; code: string }) => void>()
  private socket: WebSocket | null = null
  private snapshot: GroupSnapshot | null = null
  private present: PresentActor[] = []
  // Tracks every action id folded into `snapshot`, both from the initial
  // snapshot and from every 'action' message since. This is what stands
  // between a duplicate broadcast (retried by the server, replayed across
  // a reconnect race) and a creature that silently double-counts pressure.
  private readonly seenActionIds = new Set<string>()
  private readonly snapshotListeners = new Set<SnapshotListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private status: ConnectionStatus = 'connecting'
  private retryDelay = INITIAL_RETRY_DELAY_MS
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  // Once true, nothing in this instance is allowed to open a socket again.
  // Every handler and every scheduled retry checks this first, because
  // React strict mode mounts effects twice and a connection that can
  // resurrect itself after close() turns into two live sockets fighting
  // over the same group.
  private closed = false

  constructor(groupId: string, actor: { id: string; name: string }, code: string | null = null) {
    this.groupId = groupId
    this.actor = actor
    this.code = code
    this.open()
  }

  private open(): void {
    if (this.closed) return
    this.setStatus('connecting')
    const socket = new WebSocket(socketUrl(this.groupId))
    this.socket = socket

    socket.onopen = () => {
      if (this.closed) return
      this.retryDelay = INITIAL_RETRY_DELAY_MS
      const hello: ClientMessage = {
        type: 'hello',
        actorId: this.actor.id,
        actorName: this.actor.name,
        ...(this.code !== null ? { code: this.code } : {}),
      }
      socket.send(JSON.stringify(hello))
      this.setStatus('open')
    }

    socket.onmessage = (event: MessageEvent) => {
      if (this.closed) return
      this.handleMessage(event.data)
    }

    socket.onclose = () => {
      if (this.closed) return
      this.setStatus('closed')
      this.scheduleReconnect()
    }

    socket.onerror = () => {
      if (this.closed) return
      // A 'close' event always follows an 'error' event for a WebSocket
      // (the spec closes the connection before dispatching error), so the
      // reconnect timer is scheduled once, from onclose, not from here.
      this.setStatus('error')
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return
    let message: ServerMessage
    try {
      message = JSON.parse(data) as ServerMessage
    } catch {
      // A malformed frame is dropped, not fatal: whatever produced it, the
      // next well-formed message from the server still matters.
      return
    }

    switch (message.type) {
      case 'snapshot': {
        // The fresh snapshot is truth, unconditionally. Any locally
        // accumulated state, including which action ids we thought we had
        // already seen, is discarded and rebuilt from exactly what the
        // server just sent. This is what "discard local optimistic state
        // on reconnect" means in practice: there is no separate optimistic
        // buffer to clear because none was ever kept, only this.
        this.snapshot = message.snapshot
        this.present = message.present
        this.seenActionIds.clear()
        for (const action of message.snapshot.actions) {
          this.seenActionIds.add(action.id)
        }
        this.emitSnapshot()
        break
      }
      case 'action': {
        this.applyAction(message.action)
        break
      }
      case 'named': {
        // 'named' carries the CREATURE's name, not the person's. The worker
        // writes it into the group's meta row (rename() there, not this
        // one) and broadcasts it to every connected client so the nameplate
        // updates for everyone, the same as any other shared piece of the
        // snapshot. It must never reach local identity: doing so once
        // overwrote every member's own stored name with whatever the
        // creature was last called, and that corruption is durable because
        // it gets sent back in the next hello and stamped onto every
        // action after it.
        if (!this.snapshot) break
        this.snapshot = { ...this.snapshot, name: message.name }
        this.emitSnapshot()
        break
      }
      case 'claimed': {
        // The only moment this code exists outside the server's hash of it.
        // Held so a reconnect presents it, and handed straight up so the UI can
        // put it in front of somebody while it still can.
        this.code = message.code
        for (const fn of this.claimListeners) fn({ actorId: message.actorId, code: message.code })
        break
      }
      case 'present': {
        this.present = message.present
        this.emitSnapshot()
        break
      }
      case 'error': {
        // A server-level error (an unknown variant id, a rejected name) is
        // not a connection failure: the socket stays open. This is
        // surfaced for debugging only; there is no status transition for
        // it because ConnectionStatus describes the transport, not the
        // last message's outcome.
        console.error('monstertime connection: server reported an error:', message.message)
        break
      }
      default:
        break
    }
  }

  private applyAction(action: ActionRecord): void {
    // An action arriving before any snapshot would mean the server sent it
    // ahead of the snapshot that is supposed to precede it on a fresh
    // connection, which should not happen; dropping it here is safer than
    // fabricating a partial snapshot to hold it in.
    if (!this.snapshot) return
    if (this.seenActionIds.has(action.id)) return
    this.seenActionIds.add(action.id)
    this.snapshot = {
      ...this.snapshot,
      actions: [...this.snapshot.actions, action],
    }
    this.emitSnapshot()
  }

  private emitSnapshot(): void {
    if (!this.snapshot) return
    for (const listener of this.snapshotListeners) {
      listener(this.snapshot, this.present)
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return
    if (this.retryTimer) return
    const jitter = this.retryDelay * JITTER_FRACTION * Math.random()
    const delay = Math.min(this.retryDelay + jitter, MAX_RETRY_DELAY_MS)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.retryDelay = Math.min(this.retryDelay * RETRY_MULTIPLIER, MAX_RETRY_DELAY_MS)
      this.open()
    }, delay)
  }

  subscribe(fn: SnapshotListener): () => void {
    this.snapshotListeners.add(fn)
    // A subscriber that joins after a snapshot already arrived should not
    // have to wait for the next server message to see the creature; hand
    // it the current state immediately.
    if (this.snapshot) {
      fn(this.snapshot, this.present)
    }
    return () => {
      this.snapshotListeners.delete(fn)
    }
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn)
    fn(this.status)
    return () => {
      this.statusListeners.delete(fn)
    }
  }

  act(variantId: string): void {
    if (this.closed) return
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const message: ClientMessage = { type: 'act', variantId }
    this.socket.send(JSON.stringify(message))
  }

  claim(): void {
    if (this.closed) return
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const message: ClientMessage = { type: 'claim' }
    this.socket.send(JSON.stringify(message))
  }

  onClaimed(fn: (c: { actorId: string; code: string }) => void): () => void {
    this.claimListeners.add(fn)
    return () => {
      this.claimListeners.delete(fn)
    }
  }

  setPace(pace: number): void {
    if (this.closed) return
    // Nothing optimistic: the server settles the growth accrued so far before
    // it changes the rate, then broadcasts a fresh snapshot. Guessing locally
    // would mean this screen briefly disagreed with everybody else about how
    // old the creature is.
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const message: ClientMessage = { type: 'pace', pace }
    this.socket.send(JSON.stringify(message))
  }

  rename(name: string): void {
    if (this.closed) return
    // This is the CREATURE's name, not the person's: it is the nameplate
    // path, wired from Stage.tsx's NamePlate through group.rename, and has
    // nothing to do with local identity (that is commitLocalName, a
    // separate flow in useGroup.ts backed by identity.ts). There is no
    // optimistic local update here because there is nothing local to
    // update; this only asks. The server records it and broadcasts 'named'
    // back to every socket in the group, including this one, and that
    // handler folds the confirmed name into the snapshot and emits, which
    // is what actually moves the nameplate.
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const message: ClientMessage = { type: 'name', name }
    this.socket.send(JSON.stringify(message))
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.snapshotListeners.clear()
    this.statusListeners.clear()
    const socket = this.socket
    this.socket = null
    if (socket) {
      // Detach every handler before closing, so a close/error event fired
      // by the browser during teardown cannot reach a callback that
      // assumes this connection is still live.
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      socket.close()
    }
  }
}

export function connect(
  groupId: string,
  actor: { id: string; name: string },
  code: string | null = null,
): Connection {
  return new SocketConnection(groupId, actor, code)
}

interface CreateGroupResponse {
  groupId: string
}

export async function createGroup(): Promise<string> {
  const response = await fetch('/api/monstertime/groups', { method: 'POST' })
  if (!response.ok) {
    throw new Error(`monstertime: createGroup failed with status ${response.status}`)
  }
  const body = (await response.json()) as CreateGroupResponse
  return body.groupId
}

/**
 * The group that goes by this name, or null if nobody does.
 *
 * A name the server will not even consider (too short, punctuation in it) comes
 * back as null rather than as an error, because from where the caller stands
 * those are the same answer: nobody goes by that. Only a server that failed to
 * answer at all is worth telling somebody about.
 */
export async function resolveHandle(handle: string): Promise<string | null> {
  const response = await fetch(`/api/monstertime/handles/${encodeURIComponent(handle)}`)
  if (response.status === 404 || response.status === 400) return null
  if (!response.ok) {
    throw new Error(`monstertime: resolveHandle failed with status ${response.status}`)
  }
  return ((await response.json()) as { groupId: string }).groupId
}

export type ClaimResult = 'claimed' | 'taken' | 'unusable'

/** Claim a name for a group. Whoever asks first gets it. */
export async function claimHandle(groupId: string, handle: string): Promise<ClaimResult> {
  const response = await fetch(`/api/monstertime/handles/${encodeURIComponent(handle)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ groupId }),
  })
  if (response.ok) return 'claimed'
  if (response.status === 409) return 'taken'
  if (response.status === 400) return 'unusable'
  throw new Error(`monstertime: claimHandle failed with status ${response.status}`)
}
