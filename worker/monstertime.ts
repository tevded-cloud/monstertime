// The MonsterTime server: a seed, an ordered list of what people did, and
// nothing else.
//
// The creature is never stored. It is a pure function of the seed and the
// order of the actions, computed on every screen from the same two things, so
// there is no creature state here to get out of step with anybody. That is not
// a saving in bytes, it is the reason two people can never be looking at
// different animals: there is only one input and everybody has all of it.
//
// What this file is therefore responsible for is the part a client cannot be
// trusted with, which is exactly two things. The first is the seed, generated
// here from crypto randomness and never accepted from outside, because a seed a
// client could choose is a creature two groups could both have. The second is
// the ORDER, which is why the id and the timestamp on every action are written
// here and any values the client sent along are dropped on the floor. Ordering
// decides the animal. Ordering is the server's alone.
//
// Sockets are accepted through the Hibernation API rather than held open in a
// fetch handler. A friend group leaves this open for days, and the difference
// between the two is whether a group nobody is currently looking at costs
// money. Because the object is evicted from memory with the sockets still
// connected, NOTHING that matters may live in an instance variable: the seed,
// the name and the log live in SQLite, and the one per connection thing that is
// needed (who is on the other end) lives in the socket's own attachment, which
// survives eviction. The two in-memory things below are both throttles, and
// both are correct precisely because eviction only happens when the object has
// been idle, which is the one moment a throttle has nothing to remember.
//
// This module is imported by the tevded.com site Worker. It answers under
// /api/monstertime/ and returns null for everything else, so the rest of the
// domain keeps being answered by the asset server exactly as it was before
// this existed. See worker/README.md for what the site has to add.
import { DurableObject } from 'cloudflare:workers'
import { rollGenome, variantById } from '../src/dna/index'
import type {
  ActionRecord,
  ClientMessage,
  GroupSnapshot,
  PresentActor,
  ServerMessage,
} from '../src/core/types'

/** Everything this module answers sits under here. Nothing else on the domain does. */
const PREFIX = '/api/monstertime/'

/**
 * Bytes of randomness in a group id. The link IS the access control: there are
 * no accounts, and anybody holding the link is in the group, so the id has to
 * be unguessable rather than merely unique. Sixteen bytes is 128 bits, written
 * as 22 characters of base64url, which is short enough to sit in a URL somebody
 * pastes into a group chat.
 */
const ID_BYTES = 16

/** Bytes of randomness in a seed. This is the thing that makes two groups'
 *  creatures incomparable, so it is generous. */
const SEED_BYTES = 32

/**
 * What a group id may look like coming back off the open internet. Everything
 * minted here is 22 characters; the range is wider so that a change to
 * ID_BYTES cannot silently orphan every link already sent. It is a bound, not a
 * fit: its job is to keep anything strange away from getByName.
 */
const GROUP_ID = /^[A-Za-z0-9_-]{16,64}$/

/** What an actor id may look like. The client makes these up and keeps them in
 *  local storage, so this is a shape check, never an identity claim. */
const ACTOR_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Longest a variant id may be before it is not worth looking up. */
const VARIANT_ID_MAX = 64

/** Longest a person's display name may be, counted in code points. */
const ACTOR_NAME_MAX = 24

/** Longest the creature's name may be, counted in code points. */
const GROUP_NAME_MAX = 32

/** Shown for somebody who joined without giving a name, so the list of who is
 *  here never has a blank row in it. */
const NAMELESS = 'Someone'

/**
 * The lifetime cap on the action log. A group going for a year is a few
 * thousand short records, so this is far beyond any real use, and it is here
 * because a log with no bound is a bill with no bound.
 */
const MAX_ACTIONS = 5000

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/**
 * How the per person brake is shaped. The point is not to stop spam, it is that
 * a creature grown by one person doing everything is not the thing this app is
 * for: what the group did together has to be visible in the animal, and that
 * requires no single person being able to supply all of it.
 *
 * The cooldown makes acting a thing you come back to. The per minute cap stops
 * a burst. The per hour cap is the one that actually matters, because it is
 * what makes reaching MAX_ACTIONS alone take the better part of a week.
 */
const ACT_COOLDOWN_MS = 10_000
const ACTS_PER_MINUTE = 4
const ACTS_PER_HOUR = 40

/** How long the creature's name is left alone after somebody changes it. Held
 *  in memory on purpose: renaming in a loop needs an open socket, and an open
 *  socket is the one state in which this object is certainly not hibernating. */
const RENAME_COOLDOWN_MS = 5_000

/**
 * The flood guard, in messages per window per connection. This exists to keep a
 * broken or hostile client from reaching the SQL underneath: the per actor
 * limits above are the real rule, but they cost a query to evaluate, and a
 * client sending a thousand messages a second would spend the whole day's read
 * allowance being told no. Counted per connection rather than per actor because
 * the actor id is whatever the client says it is and can be rotated.
 */
const FLOOD_WINDOW_MS = 10_000
const FLOOD_MAX = 40

/** Sent to a connection that would not stop. 1008 is the standard code for a
 *  message the server refuses on policy grounds. */
const FLOOD_CLOSE = 1008

/** Answered by the runtime without waking this object, which is the whole
 *  reason a group left open overnight costs nothing. A client that wants to
 *  know its socket is still alive sends the literal string on the left. */
const PING = 'ping'
const PONG = 'pong'

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The API's answers are per group and per moment, and a cached one is a
 * creature that has stopped growing on somebody's screen.
 */
function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count)
  crypto.getRandomValues(bytes)
  return bytes
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function hex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

/**
 * A name arriving off the wire, made safe to keep and to hand to anybody else.
 *
 * Control characters and the bidirectional formatting range are removed rather
 * than escaped, because neither is ever part of a name somebody meant to type
 * and the second is precisely how a display name gets to lie about which name
 * it is. Whitespace is collapsed so a name cannot be padded into a column of
 * its own, and the cut is by code point so it cannot end on half of a character
 * pair. What comes out is still text and nothing more: it is never HTML here
 * and must never be treated as HTML anywhere downstream.
 */
function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  const stripped = raw.replace(
    /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2069]/gu,
    '',
  )
  const collapsed = stripped.replace(/\s+/g, ' ').trim()
  return Array.from(collapsed).slice(0, max).join('')
}

/**
 * What a client sent, or null if it was not one of the three things a client
 * may say. Everything is checked here, so nothing below has to wonder whether
 * a string is a string. An unknown message type is dropped in silence rather
 * than answered with an error: it means the client is newer than this server,
 * which is not a fault of anybody's.
 */
function readClient(raw: string): ClientMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  if (parsed.type === 'hello') {
    const actorId = typeof parsed.actorId === 'string' ? parsed.actorId : ''
    if (!ACTOR_ID.test(actorId)) return null
    return { type: 'hello', actorId, actorName: cleanText(parsed.actorName, ACTOR_NAME_MAX) }
  }
  if (parsed.type === 'act') {
    if (typeof parsed.variantId !== 'string') return null
    if (parsed.variantId.length === 0 || parsed.variantId.length > VARIANT_ID_MAX) return null
    return { type: 'act', variantId: parsed.variantId }
  }
  if (parsed.type === 'name') {
    return { type: 'name', name: cleanText(parsed.name, GROUP_NAME_MAX) }
  }
  return null
}

// ---------------------------------------------------------------------------
// The Worker side
// ---------------------------------------------------------------------------

export interface MonsterEnv {
  MONSTER_GROUP: DurableObjectNamespace<MonsterGroup>
}

/**
 * The site Worker's one line about MonsterTime.
 *
 * Returns null, synchronously, for every path that is not ours, and that null
 * is load bearing: it is what lets the site hand the request back to the asset
 * server and go on serving the rest of the domain exactly as it did before this
 * module existed. It is deliberately not an async function, so the caller can
 * tell "not mine" from "mine, answer pending" without awaiting anything.
 */
export function handleMonsterTime(request: Request, env: MonsterEnv): Promise<Response> | null {
  const url = new URL(request.url)
  if (!url.pathname.startsWith(PREFIX)) return null
  return route(request, url, env)
}

async function route(request: Request, url: URL, env: MonsterEnv): Promise<Response> {
  const parts = url.pathname.slice(PREFIX.length).split('/')
  if (parts[0] !== 'groups') return json({ error: 'No such endpoint.' }, 404)

  // POST /api/monstertime/groups
  if (parts.length === 1) {
    if (request.method !== 'POST') return json({ error: 'A group is made with POST.' }, 405)
    // Both of these are made here and only here. A client that could choose
    // either could hand two friend groups the same animal, which is the one
    // outcome this app has no answer for.
    const groupId = base64url(randomBytes(ID_BYTES))
    await env.MONSTER_GROUP.getByName(groupId).create(groupId, hex(randomBytes(SEED_BYTES)))
    return json({ groupId }, 201)
  }

  const groupId = parts[1]
  if (!GROUP_ID.test(groupId)) return json({ error: 'No such group.' }, 404)
  // The id is the group: the same characters always reach the same object,
  // wherever in the world the phone holding the link happens to be.
  const group = env.MONSTER_GROUP.getByName(groupId)

  // GET /api/monstertime/groups/:id
  if (parts.length === 2) {
    if (request.method !== 'GET') return json({ error: 'A group is read with GET.' }, 405)
    const snapshot = await group.snapshot()
    if (snapshot === null) return json({ error: 'No such group.' }, 404)
    return json(snapshot)
  }

  // GET /api/monstertime/groups/:id/socket
  if (parts.length === 3 && parts[2] === 'socket') {
    if (request.method !== 'GET') return json({ error: 'A socket is opened with GET.' }, 405)
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'That endpoint is a websocket.' }, 426)
    }
    return group.fetch(request)
  }

  return json({ error: 'No such endpoint.' }, 404)
}

// ---------------------------------------------------------------------------
// The group
// ---------------------------------------------------------------------------

/**
 * Who is on the other end of one connection.
 *
 * `sid` names the connection itself and is set the moment the socket is
 * accepted, before anybody has said who they are. It exists because object
 * identity is the thing hibernation is allowed to take away, and this is the
 * thing it is promised to keep: without it, "everybody except the person who
 * just left" is a question this object cannot reliably answer after it has been
 * evicted and brought back. `actorId` stays null until the hello arrives, so a
 * socket that is open but anonymous is not counted as somebody being here.
 */
interface Seat {
  sid: string
  actorId: string | null
  actorName: string
}

/** One connection's message allowance for the current window. */
interface Budget {
  since: number
  used: number
}

export class MonsterGroup extends DurableObject<MonsterEnv> {
  /**
   * Keyed by the socket object rather than by anything durable, and that is the
   * right trade: an entry lost to eviction costs nothing, because eviction
   * only follows idleness and an idle connection has no flood to remember. A
   * WeakMap so a connection that goes away without a close event cannot leave
   * anything behind.
   */
  private budgets = new WeakMap<WebSocket, Budget>()

  /** When the creature was last renamed. In memory for the same reason. */
  private renamedAt = 0

  constructor(ctx: DurableObjectState, env: MonsterEnv) {
    super(ctx, env)
    // Synchronous, so every table exists before any handler can run and there
    // is no reason to block concurrency on anything. `meta` holds the seed, the
    // name and the birthday; tables rather than variables because a variable is
    // gone the moment this object hibernates.
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL)')
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS actions(n INTEGER PRIMARY KEY, id TEXT NOT NULL,' +
        ' variantId TEXT NOT NULL, actorId TEXT NOT NULL, actorName TEXT NOT NULL, at INTEGER NOT NULL)',
    )
    // The per person brake is read straight back out of the log rather than
    // kept anywhere, which is what makes it survive hibernation for free. This
    // index is what keeps that read to the handful of rows it should be.
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS actions_by_actor ON actions(actorId, at)')
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
  }

  // -- what the Worker calls -------------------------------------------------

  /**
   * Called once, by the endpoint that generated both of these. If a seed is
   * already here it wins: running this twice on one group would hand the same
   * people a different animal, and there is no version of that which is not a
   * disaster for them.
   */
  async create(groupId: string, seed: string): Promise<void> {
    if (this.metaValue('seed') !== null) return
    // No await between the three, so they land as one transaction. A group with
    // an id and no seed would be a group that exists and cannot hatch.
    this.ctx.storage.sql.exec("INSERT INTO meta(k, v) VALUES('groupId', ?)", groupId)
    this.ctx.storage.sql.exec("INSERT INTO meta(k, v) VALUES('seed', ?)", seed)
    this.ctx.storage.sql.exec("INSERT INTO meta(k, v) VALUES('createdAt', ?)", String(Date.now()))
  }

  /** The whole group as a plain object, or null if nothing was ever made under
   *  this id. Here so a cold load has something to draw before the socket is up. */
  async snapshot(): Promise<GroupSnapshot | null> {
    return this.readSnapshot()
  }

  /**
   * A socket joining. The Worker in front has already checked the method, the
   * id and the upgrade header, so what is left to settle is whether this group
   * exists at all: somebody who guessed at a link gets a plain 404 and no
   * socket, rather than an open connection to an animal that was never born.
   */
  override async fetch(): Promise<Response> {
    const snapshot = this.readSnapshot()
    if (snapshot === null) return json({ error: 'No such group.' }, 404)

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    // Named before anybody has said who they are, so this connection can be
    // told apart from the others even after an eviction.
    server.serializeAttachment({ sid: crypto.randomUUID(), actorId: null, actorName: '' })
    // Sent without waiting for a hello, so a screen that is only watching still
    // draws the creature.
    this.tell(server, { type: 'snapshot', snapshot, present: this.present(null) })
    return new Response(null, { status: 101, webSocket: client })
  }

  // -- what the sockets say --------------------------------------------------

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string') return
    if (!this.affordable(ws)) {
      // Far past any rate a person can produce, so this is a broken or hostile
      // client and the useful answer is to stop reading from it.
      try {
        ws.close(FLOOD_CLOSE, 'too many messages')
      } catch {
        // Already gone, which is the outcome that was wanted anyway.
      }
      return
    }

    const said = readClient(message)
    if (said === null) return

    if (said.type === 'hello') {
      this.hello(ws, said.actorId, said.actorName)
      return
    }
    if (said.type === 'act') {
      this.act(ws, said.variantId)
      return
    }
    if (said.type === 'name') {
      this.rename(ws, said.name)
    }
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    // 1005 (no code given) and 1006 (the connection simply broke) describe what
    // happened; neither may be sent back down the wire.
    const echo = code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000
    try {
      ws.close(echo, 'left')
    } catch {
      // Already closed, which is where this was going.
    }
    this.left(ws)
  }

  override webSocketError(ws: WebSocket): void {
    this.left(ws)
  }

  // -- the three things a person can do --------------------------------------

  private hello(ws: WebSocket, actorId: string, actorName: string): void {
    const seat = this.seatOf(ws)
    if (seat === null) return
    ws.serializeAttachment({
      sid: seat.sid,
      actorId,
      actorName: actorName === '' ? NAMELESS : actorName,
    })
    this.broadcast({ type: 'present', present: this.present(null) })
  }

  private act(ws: WebSocket, variantId: string): void {
    const seat = this.seatOf(ws)
    if (seat === null || seat.actorId === null) {
      this.tell(ws, { type: 'error', message: 'Say hello before acting.' })
      return
    }
    // Checked against the real catalogue, not against a shape. An id that is
    // not a thing anybody can do is a rejected message, never a stored one:
    // once it is in the log it is part of the animal forever.
    if (variantById(variantId) === undefined) {
      this.tell(ws, { type: 'error', message: 'That is not something anybody can do.' })
      return
    }

    // Rows are only ever added here and never removed, so the highest row id is
    // also how many there are, and reading the last row answers both the cap
    // and the clock question in one seek.
    const tail = this.ctx.storage.sql
      .exec<{ n: number; at: number }>('SELECT n, at FROM actions ORDER BY n DESC LIMIT 1')
      .toArray()
    if (tail.length > 0 && tail[0].n >= MAX_ACTIONS) {
      this.tell(ws, {
        type: 'error',
        message: 'This creature has a full life behind it. Nothing more can be added.',
      })
      return
    }

    const now = Date.now()
    // One scan of this actor's last hour answers all three brakes. SUM over no
    // rows is null, which is why it is read as a nullable number.
    const spent = this.ctx.storage.sql
      .exec<{ inHour: number; inMinute: number | null; last: number | null }>(
        'SELECT COUNT(*) AS inHour, SUM(CASE WHEN at > ? THEN 1 ELSE 0 END) AS inMinute,' +
          ' MAX(at) AS last FROM actions WHERE actorId = ? AND at > ?',
        now - MINUTE_MS,
        seat.actorId,
        now - HOUR_MS,
      )
      .one()

    if (spent.last !== null && now - spent.last < ACT_COOLDOWN_MS) {
      this.tell(ws, { type: 'error', message: 'Give it a moment.' })
      return
    }
    if ((spent.inMinute ?? 0) >= ACTS_PER_MINUTE) {
      this.tell(ws, { type: 'error', message: 'Slow down and let it take that in.' })
      return
    }
    if (spent.inHour >= ACTS_PER_HOUR) {
      this.tell(ws, {
        type: 'error',
        message: 'That is a lot from one person this hour. Let somebody else have a turn.',
      })
      return
    }

    // Never allowed to go backwards. The order of the log is the order of the
    // array and nothing else, but a timestamp that ran backwards after a clock
    // correction would show a creature whose life happened out of order.
    const at = tail.length > 0 && tail[0].at > now ? tail[0].at : now
    const action: ActionRecord = {
      id: crypto.randomUUID(),
      variantId,
      actorId: seat.actorId,
      actorName: seat.actorName,
      at,
    }
    // Written before it is told, always. An action that was announced and then
    // failed to save would leave everybody looking at a creature that nobody
    // arriving later would ever see.
    this.ctx.storage.sql.exec(
      'INSERT INTO actions(id, variantId, actorId, actorName, at) VALUES(?, ?, ?, ?, ?)',
      action.id,
      action.variantId,
      action.actorId,
      action.actorName,
      action.at,
    )
    // Told to everybody including the person who did it, which is the opposite
    // of what a chat room would do and is right here: the creature is the
    // ORDER, so the actor must take its place in the log from the server like
    // everyone else rather than guess at it locally and be subtly wrong.
    this.broadcast({ type: 'action', action })
  }

  private rename(ws: WebSocket, name: string): void {
    const seat = this.seatOf(ws)
    if (seat === null || seat.actorId === null) {
      this.tell(ws, { type: 'error', message: 'Say hello before naming it.' })
      return
    }
    if (name === '') {
      this.tell(ws, { type: 'error', message: 'A name needs something in it.' })
      return
    }
    // A rename that changes nothing costs nothing.
    if (name === this.metaValue('name')) return

    const now = Date.now()
    if (now - this.renamedAt < RENAME_COOLDOWN_MS) {
      this.tell(ws, { type: 'error', message: 'It was just renamed. Give it a second.' })
      return
    }
    this.renamedAt = now
    this.ctx.storage.sql.exec(
      "INSERT INTO meta(k, v) VALUES('name', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      name,
    )
    this.broadcast({ type: 'named', name })
  }

  private left(ws: WebSocket): void {
    // The closing socket may or may not still be in the runtime's list at this
    // point, and who is here must not depend on which, so it is taken out by
    // name rather than left to chance.
    const seat = this.seatOf(ws)
    this.broadcast({ type: 'present', present: this.present(seat === null ? null : seat.sid) })
  }

  // -- reading and writing ---------------------------------------------------

  private metaValue(key: string): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ v: string }>('SELECT v FROM meta WHERE k = ?', key)
      .toArray()
    return rows.length > 0 ? rows[0].v : null
  }

  /**
   * The group as everybody sees it. The genome is rolled from the seed on every
   * read rather than stored, which is the point: there is one copy of the
   * genetics, it lives in src/dna, and the server holding a stale copy of a
   * creature's potential is a bug that cannot happen because there is no copy
   * to go stale.
   */
  private readSnapshot(): GroupSnapshot | null {
    const seed = this.metaValue('seed')
    if (seed === null) return null
    return {
      groupId: this.metaValue('groupId') ?? '',
      createdAt: Number(this.metaValue('createdAt') ?? '0'),
      name: this.metaValue('name'),
      genome: rollGenome(seed),
      actions: this.ctx.storage.sql
        .exec<{
          id: string
          variantId: string
          actorId: string
          actorName: string
          at: number
        }>('SELECT id, variantId, actorId, actorName, at FROM actions ORDER BY n')
        .toArray(),
    }
  }

  // -- connections -----------------------------------------------------------

  private seatOf(ws: WebSocket): Seat | null {
    const raw: unknown = ws.deserializeAttachment()
    if (!isRecord(raw)) return null
    if (typeof raw.sid !== 'string') return null
    return {
      sid: raw.sid,
      actorId: typeof raw.actorId === 'string' ? raw.actorId : null,
      actorName: typeof raw.actorName === 'string' ? raw.actorName : '',
    }
  }

  /**
   * Who is here, optionally not counting one connection that is on its way out.
   * Somebody with the app open on a phone and a laptop is one person in the
   * group, so the list is by actor rather than by socket, and it is sorted so
   * that a list which has not changed does not arrive looking as though it has.
   */
  private present(withoutSid: string | null): PresentActor[] {
    const seen = new Map<string, string>()
    for (const ws of this.ctx.getWebSockets()) {
      const seat = this.seatOf(ws)
      if (seat === null || seat.actorId === null) continue
      if (withoutSid !== null && seat.sid === withoutSid) continue
      seen.set(seat.actorId, seat.actorName)
    }
    return Array.from(seen, ([actorId, actorName]) => ({ actorId, actorName })).sort((a, b) =>
      a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0,
    )
  }

  private affordable(ws: WebSocket): boolean {
    const now = Date.now()
    const budget = this.budgets.get(ws)
    if (budget === undefined || now - budget.since >= FLOOD_WINDOW_MS) {
      this.budgets.set(ws, { since: now, used: 1 })
      return true
    }
    budget.used += 1
    return budget.used <= FLOOD_MAX
  }

  private tell(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // Gone already. The close handler tidies up after it.
    }
  }

  private broadcast(message: ServerMessage): void {
    const text = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      // One socket that has gone away must not stop everybody else hearing
      // what happened.
      try {
        ws.send(text)
      } catch {
        // Nothing to do: it is already gone.
      }
    }
  }
}
