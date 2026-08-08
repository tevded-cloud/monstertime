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
import { setLocalName } from './identity'

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface Connection {
  subscribe(fn: (snapshot: GroupSnapshot, present: PresentActor[]) => void): () => void
  act(variantId: string): void
  rename(name: string): void
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

  constructor(groupId: string, actor: { id: string; name: string }) {
    this.groupId = groupId
    this.actor = actor
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
        // The server is the authority on what name it actually recorded
        // for this connection (it may sanitise or cap differently than the
        // client does), so its answer is folded back into local identity
        // rather than trusting whatever was last typed into a field.
        setLocalName(message.name)
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

  rename(name: string): void {
    if (this.closed) return
    // Renaming carries none of the ordering hazard act() does (a name is
    // not folded into pressure, and never decides which allele expresses),
    // so an immediate local update is safe and gives instant feedback in
    // any "your name" field. The server's later 'named' message reconciles
    // this if it sanitises or caps the value differently.
    setLocalName(name)
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

export function connect(groupId: string, actor: { id: string; name: string }): Connection {
  return new SocketConnection(groupId, actor)
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
