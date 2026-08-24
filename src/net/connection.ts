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
  MarketNote,
  MarketSnapshot,
  PledgeRefusal,
  PresentActor,
  ServerMessage,
} from '../core/types'
// The one place '@' means "this id was issued by the server". Imported rather
// than tested here, because a second copy of that character is a rule that
// agrees with the first until one of them is edited.
import { isClaimedMember } from '../market/rules'

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

/**
 * What came back when somebody presented a code they had been given.
 *
 * 'refused' is the far end saying it does not open anything here. 'unanswered'
 * is nothing having come back at all, which is a different thing to tell
 * somebody: one means check the code, the other means try again.
 */
export interface CodeAnswer {
  verdict: 'accepted' | 'refused' | 'unanswered'
  /**
   * The id the far end seated this browser under, when this side could work out
   * which of the people in the room it had become, and null when it could not.
   *
   * Null is NOT a failure and must not be read as one. The far end never says
   * who a code resolved to, so this is worked out from the room changing, and
   * there are rooms it cannot be worked out in. See judgeCode().
   */
  actorId: string | null
}

export interface Connection {
  subscribe(fn: (snapshot: GroupSnapshot, present: PresentActor[]) => void): () => void
  act(variantId: string, methodId?: string): void
  rename(name: string): void
  /** How fast the group wants the creature to live. Clamped by the server. */
  setPace(pace: number): void
  /** Ask for a code that says which member of this group this is. Answered once
   *  and never again, so the caller has to do something with it. */
  claim(): void
  /** Fires the one time a code is minted, and never after. */
  onClaimed(fn: (claimed: { actorId: string; code: string }) => void): () => void
  /**
   * Present a code somebody typed, as the member it belongs to.
   *
   * The twin of claim() and its opposite: claim() asks for a place and is
   * answered with a code, this hands a code back and asks for the place. It
   * exists because until it did, a code only ever worked on the browser it was
   * minted in: `hello` has carried one for as long as the server has understood
   * them, but nothing anywhere put one there except the claim that made it.
   *
   * IT GOES UP ON A SOCKET OF ITS OWN, which is not an implementation detail.
   * A connection says hello once; a second hello on the same one, carrying a
   * code that resolves to somebody other than the guest already sitting in that
   * seat, is answered with "this connection already belongs to somebody", which
   * is true and useless. So this closes the socket it is holding and opens
   * another with the code on the first hello, which is exactly the shape every
   * later visit from this browser will have.
   *
   * Answered once, and a refusal puts back whatever this browser held before, so
   * a mistyped code cannot cost somebody the place they already had.
   */
  enterCode(code: string): Promise<CodeAnswer>
  /** Fires every time the server turns an action away because the creature is
   *  asleep. Not an error and not a status change: the socket is fine, the
   *  animal is not available, and the two want different words on screen. */
  onAsleep(fn: (refused: { since: number; until: number; now: number }) => void): () => void
  /** Put coins behind one of the three eggs. Which person this is comes off the
   *  seat at the far end, never off this message, exactly as it does for act():
   *  coins spent against a self-asserted actorId would be coins anybody can mint
   *  by clearing their local storage. */
  pledge(egg: number, coins: number): void
  /** Take back everything this person has on one egg. Nothing optimistic here
   *  either: the market that comes back is what is actually on the table. */
  withdraw(egg: number): void
  /** The market, whole, every time it moves. The twin of subscribe() for a group
   *  that has not bought an egg yet, and separate from it because the two carry
   *  different shapes: a market has no genome, no log and nothing to derive, and
   *  folding it into the snapshot channel would put a null check into every
   *  screen that draws a creature. */
  onMarket(fn: MarketListener): () => void
  /** Fires the one time this group's egg is bought. The snapshot that came with
   *  it has already gone out through subscribe() by then, so a listener here is
   *  free to spend a moment on the moment rather than racing to fetch anything. */
  onBought(fn: (bought: { egg: number; spent: number }) => void): () => void
  /** Fires when the server turns a pledge away, with the reason and no English.
   *  Sibling of onAsleep for the same reason: most of these are a race rather
   *  than a mistake, and none of them is a broken socket. */
  onRefused(fn: (reason: PledgeRefusal) => void): () => void
  close(): void
  onStatus(fn: (status: ConnectionStatus) => void): () => void
}

type SnapshotListener = (snapshot: GroupSnapshot, present: PresentActor[]) => void
type MarketListener = (
  snapshot: MarketSnapshot,
  present: PresentActor[],
  note: MarketNote | null,
) => void
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

// How long a typed code is given to be answered, counted from the moment the
// hello carrying it goes out rather than from the tap.
//
// This is not a patience budget, it is the length of the silence that has to
// mean yes. The far end says nothing at all to somebody it seats and speaks up
// only to refuse, so there is no message this can wait for; a hello is one round
// trip, and four seconds is far past a slow one.
const CODE_ANSWER_MS = 4000

// And how long the socket carrying it gets to open in the first place. A code
// typed on a train can wait a while for a connection, and telling somebody whose
// code is perfectly good that it did not work is the worst answer available
// here: they have one copy of it and will believe the app rather than the photo.
const CODE_OPEN_MS = 8000

/**
 * A code somebody has typed, while the far end is deciding about it.
 *
 * ONE AT A TIME AND NEVER TWO. Everything here is about a single question that
 * has been asked and not answered, and on the other end of it is a person
 * watching a button that says "Checking".
 */
interface Asking {
  /** What this browser held before, put back if the typed one is refused. */
  was: string | null
  /** Who was already seated as a member before the code went up. This is the
   *  whole of what makes a newly seated one identifiable at all. */
  before: Set<string>
  /** Whether the hello carrying it has actually gone out. Before that, silence
   *  is the network's and answering 'accepted' on it would be answering a
   *  question the server has not been asked. */
  sent: boolean
  /**
   * Whether that hello is still the ONLY thing this connection has said.
   *
   * An error is an answer to a question, and this is what says how many
   * questions are outstanding. While it holds there is exactly one, so an error
   * can be read as the answer to it without reading a word of it. Cleared by
   * send(), which is every other word this browser speaks. See the 'error' case.
   */
  alone: boolean
  settle: (answer: CodeAnswer) => void
  timer: ReturnType<typeof setTimeout> | null
}

function socketUrl(groupId: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${location.host}/api/monstertime/groups/${encodeURIComponent(groupId)}/socket`
}

// ---------------------------------------------------------------------------
// What the object said, in words
// ---------------------------------------------------------------------------
//
// EVERY WRITTEN SENTENCE THE OBJECT REFUSES IN, BAR THE ONE ANSWERING A TYPED
// PASSCODE, WENT TO console.error AND NOWHERE ELSE. The per person hourly cap,
// the group's hourly cap, the three burst limits, the stage gate, waking an
// animal that is already up, a group with no room left in it, the rename it
// will not take yet: all composed in the app's own voice, all logged for a
// developer and hidden from the group they were written for. A tap that is
// turned away with nothing on screen is indistinguishable from an app that has
// broken, which is the failure ActionBar exists to prevent for sleep and the
// cooldown and did not prevent for any of these.
//
// ONE OF THEM IS NOT A REFUSAL AT ALL. At CAP_WARNING actions short of the
// lifetime cap the object BROADCASTS to the whole group that the creature is
// nearly done, with a comment beside it saying the one thing that must not
// happen is a group finding that out by being told no one day. It went to the
// console with the rest, the creature reached the end of its life, and the app
// simply stopped answering taps. It gets the same path as a refusal here and
// deliberately so: on the wire the two are the same message, so the only way to
// tell them apart is by their words, and matching on words is exactly what the
// error case below refuses to do.
//
// A module store rather than another listener on Connection, for the reason the
// sleep clock in useGroup.ts is one: the line that says why nothing happened
// sits several levels under the screen holding the connection, and threading a
// subscription down to it would put the app's only answer in the hands of
// whichever screen forgot to pass it on.

/** Something the far end said in words, and when it said it. */
export interface ServerSentence {
  text: string
  at: number
}

/**
 * How long one of these stays on screen.
 *
 * Set by the longest of them rather than by what feels brief. 'This creature
 * has a full life behind it...' is thirty-two words, which is about thirteen
 * seconds of unhurried reading, and the clock starts late because somebody who
 * has just been refused is looking at the button they pressed and not at the
 * line under it. It costs nothing to be generous: this line is a fixed region
 * that covers nothing and interrupts nobody.
 */
export const SENTENCE_MS = 20_000

let sentence: ServerSentence | null = null
let sentenceTimer: ReturnType<typeof setTimeout> | null = null
const sentenceListeners = new Set<() => void>()

function setSentence(next: ServerSentence | null): void {
  if (sentenceTimer !== null) {
    clearTimeout(sentenceTimer)
    sentenceTimer = null
  }
  sentence = next
  if (next !== null) sentenceTimer = setTimeout(() => setSentence(null), SENTENCE_MS)
  for (const fn of [...sentenceListeners]) fn()
}

export function subscribeSentence(fn: () => void): () => void {
  sentenceListeners.add(fn)
  return () => {
    sentenceListeners.delete(fn)
  }
}

/** The same object until it actually changes, because a store read on every
 *  render that handed back a fresh one each time would re-render forever. */
export function readSentence(): ServerSentence | null {
  return sentence
}

/** Drop whatever is held. Called when a fresh tap supersedes the answer to the
 *  last one, and when a connection goes: a sentence is about the creature that
 *  said it, the same reason the sleep store drops its refusal on a new source. */
export function forgetSentence(): void {
  setSentence(null)
}

class SocketConnection implements Connection {
  private readonly groupId: string
  private readonly actor: { id: string; name: string }
  /** Sent on every connect once there is one, which is what makes a reconnect
   *  come back as the same person rather than as a fresh guest. */
  private code: string | null
  private readonly claimListeners = new Set<(c: { actorId: string; code: string }) => void>()
  private readonly asleepListeners = new Set<
    (r: { since: number; until: number; now: number }) => void
  >()
  private socket: WebSocket | null = null
  private snapshot: GroupSnapshot | null = null
  // The market, when this group is still at one. Held for the same reason the
  // snapshot is: a listener that subscribes after the first message still has to
  // be handed what is on the table rather than waiting for somebody to move.
  private market: MarketSnapshot | null = null
  // The last thing that happened in the market, so a screen can say it out loud.
  // Kept beside the market rather than inside it because it is not part of the
  // state: it is what changed on the way to this state.
  private marketNote: MarketNote | null = null
  private present: PresentActor[] = []
  // Tracks every action id folded into `snapshot`, both from the initial
  // snapshot and from every 'action' message since. This is what stands
  // between a duplicate broadcast (retried by the server, replayed across
  // a reconnect race) and a creature that silently double-counts pressure.
  private readonly seenActionIds = new Set<string>()
  private readonly snapshotListeners = new Set<SnapshotListener>()
  private readonly marketListeners = new Set<MarketListener>()
  private readonly boughtListeners = new Set<(bought: { egg: number; spent: number }) => void>()
  private readonly refusalListeners = new Set<(reason: PledgeRefusal) => void>()
  private readonly statusListeners = new Set<StatusListener>()
  private status: ConnectionStatus = 'connecting'
  private retryDelay = INITIAL_RETRY_DELAY_MS
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  // The code somebody typed a moment ago, and nothing at all the rest of the
  // time. See enterCode().
  private asking: Asking | null = null
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
      // The clock on a typed code starts HERE and not when it was typed. Until
      // this line has run the question has not been asked, and a silence that
      // was really a socket failing to open would otherwise be read as the far
      // end quietly accepting a code it never saw.
      if (this.asking !== null) {
        this.asking.sent = true
        this.waitForCode(CODE_ANSWER_MS)
      }
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
        this.widenCode()
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
        // The one message a hello produces, so it is the only one a typed code
        // can be recognised in. Read before either channel emits, so that a
        // screen redrawing on this message already knows who it is looking at.
        this.judgeCode()
        // Both channels, because only one of them has anything to send on and
        // this file is not the thing that decides which. Emitting only the
        // snapshot left a group at the market with a present list frozen at
        // whoever was there when the socket opened.
        this.emitSnapshot()
        this.emitMarket()
        break
      }
      case 'market': {
        // The whole state, replacing whatever was here. There is no
        // accumulation to get wrong and deliberately none to build: a market is
        // three seeds and a short list of pledges, and a client that had to
        // replay a stream of increments to know what is on the table is a client
        // that can be quietly wrong about what a group is buying.
        this.market = message.snapshot
        this.present = message.present
        this.marketNote = message.note
        this.widenCode()
        this.emitMarket()
        break
      }
      case 'bought': {
        // The group has a creature and it arrives whole. Folded in exactly the
        // way a 'snapshot' is, so nothing downstream has to know this one is the
        // first, and the market is deliberately left standing: the screen that
        // was on the eggs needs it for a moment longer to say which one won.
        this.snapshot = message.snapshot
        this.seenActionIds.clear()
        for (const action of message.snapshot.actions) {
          this.seenActionIds.add(action.id)
        }
        // Snapshot first, then the news. A listener told about the purchase
        // before the creature existed anywhere would have to go and ask for it.
        this.emitSnapshot()
        for (const fn of this.boughtListeners) fn({ egg: message.egg, spent: message.spent })
        break
      }
      case 'refused': {
        // Not console.error'd, for the reason 'asleep' is not: being told
        // somebody else got there first is a normal minute at a market, not a
        // fault, and it is the app's job to put words to it rather than a log's.
        for (const fn of this.refusalListeners) fn(message.reason)
        break
      }
      case 'asleep': {
        // Passed straight up without being folded into the snapshot, because it
        // is not part of the creature: the creature is a pure function of the
        // log and this is a fact about the minute somebody tapped. It is also
        // deliberately not console.error'd the way a real server error is. Being
        // told the animal is asleep is a normal evening, not a fault.
        for (const fn of this.asleepListeners) {
          fn({ since: message.since, until: message.until, now: message.now })
        }
        break
      }
      case 'error': {
        // A code somebody typed can be turned away, and while the hello carrying
        // it is the only thing this connection has said, that refusal is the
        // ONLY error the hello can have earned: nothing here ever sends a token,
        // and a seat cannot already belong to somebody on a connection that has
        // said nothing else. So an error arriving then IS the answer to it.
        //
        // Recognised by that rather than by the sentence, deliberately. The
        // words are the far end's to reword, and a client matching on them would
        // go silently back to swallowing refusals the day somebody improved the
        // English, which is the failure this whole unit exists to delete.
        //
        // `alone` IS THE WHOLE OF THE NARROWING AND IT WAS MISSING. This read
        // "an error while a code is outstanding", and outstanding is four
        // seconds during which the person is looking at the app: the panel
        // holding the code field also holds Claim my place, the action bar is
        // behind it and the market is behind that, and every one of those goes
        // up this same socket and has refusals of its own. 'Give it a moment.'
        // costs one extra tap. 'Say who you are before claiming a place.' costs
        // one impatient press. Each was read as the answer to the code, so a
        // code typed correctly off a photograph was called refused and thrown
        // away because of something else the same person did a second earlier.
        // Nothing this browser says after the hello can be mistaken for the
        // hello's answer now, because saying anything clears this.
        //
        // ONE ERROR IS STILL NOT ABOUT THE HELLO, and from here it cannot be:
        // the object BROADCASTS an `error` to the whole group on the single
        // action that leaves a creature CAP_WARNING short of its lifetime cap.
        // A broadcast is not an answer to anything this connection asked, and it
        // arrives in the identical shape as one that is, so landing inside
        // somebody's four second window it still calls a good code refused. It
        // costs a retype and nothing else, because a refusal keeps no code and
        // puts back the one this browser held, and it is the right way round:
        // the other reading, believing an error is somebody else's and accepting
        // anyway, would keep a code that does not work and tell the person they
        // were back.
        if (this.asking !== null && this.asking.sent && this.asking.alone) {
          this.refuseCode('refused')
          break
        }
        // Everything else the object says goes to the people it was written
        // for. Not a connection failure and no status transition: the socket
        // stays open and ConnectionStatus describes the transport, not the last
        // message's outcome. It replaces a console.error rather than joining
        // one, because a line only a developer can read is what this was.
        setSentence({ text: message.message, at: Date.now() })
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

  private emitMarket(): void {
    if (!this.market) return
    for (const listener of this.marketListeners) {
      listener(this.market, this.present, this.marketNote)
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

  onMarket(fn: MarketListener): () => void {
    this.marketListeners.add(fn)
    // Handed the current market straight away, for the reason subscribe() hands
    // over the current snapshot: a listener that joined a beat late should not
    // have to wait for somebody in the group to move before it can draw.
    if (this.market) {
      fn(this.market, this.present, this.marketNote)
    }
    return () => {
      this.marketListeners.delete(fn)
    }
  }

  onBought(fn: (bought: { egg: number; spent: number }) => void): () => void {
    this.boughtListeners.add(fn)
    return () => {
      this.boughtListeners.delete(fn)
    }
  }

  onRefused(fn: (reason: PledgeRefusal) => void): () => void {
    this.refusalListeners.add(fn)
    return () => {
      this.refusalListeners.delete(fn)
    }
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn)
    fn(this.status)
    return () => {
      this.statusListeners.delete(fn)
    }
  }

  /**
   * Everything this browser says, through one door.
   *
   * ONE DOOR BECAUSE OF THE LAST LINE IN IT. A typed code is answered by silence
   * and refused by an `error`, and the only thing that separates the hello's own
   * refusal from every other refusal on this socket is whether this side has
   * said anything since. Six methods each remembering to record that is six
   * chances to forget, and the one that forgot would be somebody's correctly
   * typed code thrown away with nothing on screen to say why: exactly the defect
   * the 'error' case above was just narrowed to fix. So the two guards, the
   * encoding and the record live here once, and a seventh thing to say inherits
   * all four by having nowhere else to go.
   *
   * NOT THE HELLO, which is sent by hand from onopen and has to stay that way.
   * The hello IS the outstanding question; routed through here it would clear
   * the flag that says it is still the only one, which is the whole rule.
   */
  private send(message: ClientMessage): void {
    if (this.closed) return
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(message))
    if (this.asking !== null) this.asking.alone = false
  }

  act(variantId: string, methodId?: string): void {
    // Omitted rather than sent as undefined: the server treats an absent
    // manner and a null one the same, but a key that is present and empty is
    // the shape most likely to grow a default under it later.
    const message: ClientMessage =
      methodId === undefined ? { type: 'act', variantId } : { type: 'act', variantId, methodId }
    this.send(message)
  }

  claim(): void {
    const message: ClientMessage = { type: 'claim' }
    this.send(message)
  }

  onClaimed(fn: (c: { actorId: string; code: string }) => void): () => void {
    this.claimListeners.add(fn)
    return () => {
      this.claimListeners.delete(fn)
    }
  }

  enterCode(code: string): Promise<CodeAnswer> {
    // Nothing to ask on, or one already outstanding. Both are the same answer:
    // nothing came back. Refusing the second is what keeps every field in
    // `asking` about exactly one question.
    if (this.closed || this.asking !== null) {
      return Promise.resolve({ verdict: 'unanswered', actorId: null })
    }
    const was = this.code
    this.code = code
    return new Promise<CodeAnswer>((settle) => {
      this.asking = {
        was,
        // Read before the socket goes, so it is who the room held while this
        // browser was still whoever it was a second ago.
        before: new Set(this.present.map((p) => p.actorId)),
        sent: false,
        // True until this browser says a second thing, and it says nothing at
        // all until the hello goes out: send() refuses while the socket it is
        // about to open is still connecting, so nothing can clear this before
        // there is a question for it to be about.
        alone: true,
        settle,
        timer: null,
      }
      this.waitForCode(CODE_OPEN_MS)
      this.reopen()
    })
  }

  /**
   * Start again on a fresh socket, deliberately rather than because one broke.
   *
   * The backoff is reset because this is not a failure and must not be billed as
   * one: somebody typing a code after an outage would otherwise wait out
   * whatever delay the last dropped connection had climbed to.
   */
  private reopen(): void {
    if (this.closed) return
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.retryDelay = INITIAL_RETRY_DELAY_MS
    const socket = this.socket
    this.socket = null
    if (socket !== null) {
      // Detached before closing, for the reason close() detaches: the onclose
      // this is about to cause would otherwise schedule a reconnect of its own
      // and this connection would end up holding two live sockets.
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      socket.close()
    }
    this.open()
  }

  private waitForCode(ms: number): void {
    const asking = this.asking
    if (asking === null) return
    if (asking.timer !== null) clearTimeout(asking.timer)
    asking.timer = setTimeout(() => {
      if (this.asking === null) return
      // A hello that never went out is not a code that was refused. The two
      // want different words on screen and this is the only place that can tell
      // them apart.
      if (!this.asking.sent) {
        this.refuseCode('unanswered')
        return
      }
      // Silence is the yes, and it is the only yes on offer: the far end tells
      // the room who is in it and tells the person who just arrived nothing at
      // all. The seat is null here because the room did not change in a way this
      // side could read, which is a smaller thing to be missing than a place.
      this.answerCode({ verdict: 'accepted', actorId: null })
    }, ms)
  }

  /** The answer, once, and the last thing that happens to an ask. */
  private answerCode(answer: CodeAnswer): void {
    const asking = this.asking
    if (asking === null) return
    if (asking.timer !== null) clearTimeout(asking.timer)
    this.asking = null
    asking.settle(answer)
  }

  /**
   * A code the far end would not take, or one it never got.
   *
   * Whoever this browser was before goes back on and the socket comes back up
   * under it, because a hello carrying a bad code seats nobody: without this,
   * one wrong guess would leave somebody unable to do anything to the creature,
   * invisible to the rest of the group, and holding no clue that the two facts
   * were related.
   */
  private refuseCode(verdict: 'refused' | 'unanswered'): void {
    const asking = this.asking
    if (asking === null) return
    this.code = asking.was
    this.answerCode({ verdict, actorId: null })
    this.reopen()
  }

  /**
   * Which of the people in the room this browser has just become.
   *
   * THE FAR END NEVER SAYS, and that is the whole difficulty. A claim is
   * answered with the id it minted; a code presented on a hello is answered with
   * nothing: the seat moves, the room is told who is in it, and whoever typed
   * the code is left to work out which of those is now them. This is that.
   *
   * It is deliberately unwilling. An id adopted wrongly here is a market screen
   * showing somebody else's coins, so it takes exactly one unmistakable answer
   * and adopts nothing otherwise, and adopting nothing still counts as accepted.
   * The cost of declining is a screen that goes on calling somebody a visitor
   * until they open the app again; the cost of guessing is a purse that is not
   * theirs. The name has to match as well as the id being new, because a member
   * who was already in the room reads as no change at all and somebody else
   * arriving in the same instant reads as a change: without the name those two
   * cases are the same shape.
   *
   * ONE LINE IN THE WORKER WOULD DELETE THIS FUNCTION. `claimed` already carries
   * an actorId, and hello could send it back when a code resolves.
   */
  private judgeCode(): void {
    const asking = this.asking
    if (asking === null || !asking.sent) return
    const fresh = this.present.filter(
      (p) =>
        isClaimedMember(p.actorId) &&
        !asking.before.has(p.actorId) &&
        p.actorName === this.actor.name,
    )
    if (fresh.length !== 1) return
    this.answerCode({ verdict: 'accepted', actorId: fresh[0].actorId })
  }

  /**
   * Everybody that a message which cannot be about the code says is here.
   *
   * The first thing a fresh socket is sent is the whole group, and the far end
   * wrote it before it had read this connection's hello, so it is another
   * reading of who was already in the room rather than an answer to anything.
   * Folding it in rather than diffing against it is what stops a member who was
   * there the whole time being read as the one that just arrived.
   */
  private widenCode(): void {
    const asking = this.asking
    if (asking === null) return
    for (const who of this.present) asking.before.add(who.actorId)
  }

  onAsleep(fn: (r: { since: number; until: number; now: number }) => void): () => void {
    this.asleepListeners.add(fn)
    return () => {
      this.asleepListeners.delete(fn)
    }
  }

  pledge(egg: number, coins: number): void {
    // Nothing optimistic, for the reason act() invents nothing: the pledge list
    // is ordered and the order is the record of how the group got to its animal,
    // so the server writes the row and this only ever asks for one.
    const message: ClientMessage = { type: 'pledge', egg, coins }
    this.send(message)
  }

  withdraw(egg: number): void {
    const message: ClientMessage = { type: 'withdraw', egg }
    this.send(message)
  }

  setPace(pace: number): void {
    // Nothing optimistic: the server settles the growth accrued so far before
    // it changes the rate, then broadcasts a fresh snapshot. Guessing locally
    // would mean this screen briefly disagreed with everybody else about how
    // old the creature is.
    const message: ClientMessage = { type: 'pace', pace }
    this.send(message)
  }

  rename(name: string): void {
    // This is the CREATURE's name, not the person's: it is the nameplate
    // path, wired from Stage.tsx's NamePlate through group.rename, and has
    // nothing to do with local identity (that is commitLocalName, a
    // separate flow in useGroup.ts backed by identity.ts). There is no
    // optimistic local update here because there is nothing local to
    // update; this only asks. The server records it and broadcasts 'named'
    // back to every socket in the group, including this one, and that
    // handler folds the confirmed name into the snapshot and emits, which
    // is what actually moves the nameplate.
    const message: ClientMessage = { type: 'name', name }
    this.send(message)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    // A code still in the air when the screen goes has to be answered anyway.
    // The person is gone, but whoever called enterCode is holding a promise, and
    // a promise that never settles is a button that says "Checking" forever.
    this.answerCode({ verdict: 'unanswered', actorId: null })
    // Whatever the object last said goes with the connection that carried it.
    // Left standing, a refusal earned in one group would be the first sentence
    // under the next group's action bar, about an animal that never said it.
    forgetSentence()
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
