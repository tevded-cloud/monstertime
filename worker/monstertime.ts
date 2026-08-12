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
// survives eviction. The in-memory things below are throttles and one cached
// yes-or-no, and all of them are correct precisely because eviction only
// happens when the object has been idle: an idle connection has no flood to
// remember, and a question re-asked after an eviction is one query.
//
// A brake that a client can pick its own bucket for is not a brake. The actor
// id is whatever the client says it is, so the id is bound to the connection
// the first time it is given and never moved after that, and the limits that
// have to hold against somebody deliberately trying are the ones read back out
// of the log for the whole group, which no client can re-key.
//
// This module is imported by the tevded.com site Worker. It answers under
// /api/monstertime/ and returns null for everything else, so the rest of the
// domain keeps being answered by the asset server exactly as it was before
// this existed. See worker/README.md for what the site has to add.
import { DurableObject } from 'cloudflare:workers'
import { deriveCreature, rollGenome, stageOfGrowth, variantById } from '../src/dna/index'
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

/**
 * The name a group calls itself, so friends can open the app and type
 * "buttmcgee" instead of going to find the link somebody sent them in March.
 *
 * Lower case, digits and hyphens. Folded to lower case before anything is done
 * with it, because a name shouted across a room has no case and two groups
 * separated only by a capital letter is a trap rather than a feature.
 *
 * This is a NICKNAME, not a key. The 22 character id is still what a group
 * actually is, the link still works, and nothing here can reach a group that
 * has not published a name for itself.
 */
const HANDLE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/

function cleanHandle(raw: string): string | null {
  const folded = raw.trim().toLowerCase().replace(/\s+/g, '-')
  return HANDLE.test(folded) ? folded : null
}

/**
 * Where a name's pointer lives.
 *
 * A pointer is an ordinary MonsterGroup that holds one row saying which group
 * the name belongs to, and it works because '#' cannot appear in GROUP_ID: the
 * two key spaces cannot collide, so no name can ever be mistaken for a group
 * and no group id can ever be typed in as a name. Doing it this way means no
 * second Durable Object class, and therefore no third migration on a Worker
 * that is also running ColorTime's live rooms.
 */
function handleKey(handle: string): string {
  return `#h:${handle}`
}

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
 *
 * Reaching it ends the creature's life, and that is not reversible: the log IS
 * the animal, so there is nothing that could be removed to make room without
 * making it a different animal. Everything below that guards this number is
 * really guarding that one fact.
 */
const MAX_ACTIONS = 5000

/**
 * How many actions before the cap everybody is told it is coming, once. A group
 * finding out that their creature is finished by pressing a button and being
 * refused is the worst possible way to learn it.
 */
const CAP_WARNING = 100

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

/**
 * How long an untouched creature takes to reach its first stage, at pace 1.
 *
 * This is the number that makes a creature a living thing rather than a
 * scoreboard: it grows while every member has the app shut, and a group coming
 * back after a night finds it further along than they left it.
 *
 * Nothing is scheduled to make that happen. Growth is worked out when somebody
 * asks, from a stored total plus the hours since it was stored, so a group
 * nobody is looking at costs exactly nothing and a read never writes. An alarm
 * that woke every group on the domain every hour to tick a number nobody was
 * watching would be the same creature and a real bill.
 */
const HATCH_HOURS = 6
const HOUR = 60 * 60 * 1000
/** Growth points per millisecond at pace 1. STAGE_ACTIONS[1] is 5. */
const GROWTH_PER_MS = 5 / (HATCH_HOURS * HOUR)

/**
 * What one action is worth, and how fast that falls away inside a stage.
 *
 * Interaction is meant to bring a stage forward, not to replace the waiting: a
 * group that hammers the buttons should get there in well under an hour rather
 * than in six, and a group that presses once an evening should still be moving.
 * So the first thing done in a stage is worth the most and each one after it is
 * worth less, down to a floor, which is what stops a stage being skipped by
 * somebody with a fast thumb.
 *
 * Rational rather than exponential, deliberately: this number is written into
 * every row and replayed by every client, so it is built from the four
 * operations that return the same bits on every engine.
 *
 * These are first guesses. They want playing with before they want defending.
 */
const ACTION_WORTH = 0.2
const ACTION_FLOOR = 0.35
const ACTION_HALF = 8

/** What a group may set its pace to. Below the floor a creature would take a
 *  month; above the ceiling the whole life is one sitting and the log's own
 *  rate limits become the real constraint anyway. */
const PACE_MIN = 0.25
const PACE_MAX = 6

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

/**
 * The same brake for the group as a whole, and this is the one that has to hold
 * against somebody who is actually trying.
 *
 * The per person caps above are per ACTOR ID, and an actor id is a string the
 * client made up. Binding it to the connection stops one socket from being
 * several people, but nothing stops somebody opening a second socket and being
 * somebody new, so on its own the per person cap bounds only the polite. This
 * one is counted across every row in the window regardless of whose it is, so
 * there is no bucket to pick and no id to rotate into.
 *
 * The number is three people acting flat out at once, which no real evening
 * looks like and which is still the difference between filling the log in forty
 * minutes and filling it in a day and a half of unbroken effort.
 */
const GROUP_ACTS_PER_MINUTE = 12
const GROUP_ACTS_PER_HOUR = 120

/**
 * How many different people may ever act in one group. A friend group is not
 * fifty people, and without a bound here a script can mint a fresh actor id per
 * action: the bond list is keyed by actor id, so that ends with a creature
 * whose closest relationships are with five thousand strangers who each did one
 * thing. Generous enough that phones, laptops and cleared browser storage are
 * never the reason somebody is turned away.
 */
const MAX_ACTORS = 48

/**
 * Sockets one group may hold open at once. The flood guard is per connection,
 * so without this the way round it is simply more connections.
 */
const MAX_SOCKETS = 64

/** How long the creature's name is left alone after somebody changes it. Held
 *  in memory on purpose: renaming in a loop needs an open socket, and an open
 *  socket is the one state in which this object is certainly not hibernating. */
const RENAME_COOLDOWN_MS = 5_000

/**
 * The flood guard, in messages per window per connection. This exists to keep a
 * broken or hostile client from reaching the SQL underneath: the caps above are
 * what decide whether an action happens, but they cost a query to evaluate, and
 * a client sending a thousand messages a second would spend the whole day's
 * read allowance being told no. Counted per connection because that is the only
 * thing here that is not a name the client chose, and bounded overall by
 * MAX_SOCKETS, without which opening another connection is a fresh budget.
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
  if (parsed.type === 'pace') {
    const pace = Number(parsed.pace)
    if (!Number.isFinite(pace)) return null
    return { type: 'pace', pace }
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
  if (parts[0] === 'handles') return handles(request, parts, env)
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

/**
 * The name a group answers to.
 *
 *   GET  /api/monstertime/handles/:name   which group is this, if any
 *   PUT  /api/monstertime/handles/:name   claim it for a group
 *
 * A name is a way back in for people who are already in the group and have lost
 * the link, which on a phone is most of the time. It is not a second security
 * boundary and is not pretending to be one: anybody who types the name is in,
 * which is the entire point of it and is what was asked for.
 */
async function handles(request: Request, parts: string[], env: MonsterEnv): Promise<Response> {
  if (parts.length !== 2) return json({ error: 'No such endpoint.' }, 404)
  const handle = cleanHandle(decodeURIComponent(parts[1]))
  if (handle === null) {
    return json({ error: 'A name is 3 to 32 letters, numbers or hyphens.' }, 400)
  }
  const pointer = env.MONSTER_GROUP.getByName(handleKey(handle))

  if (request.method === 'GET') {
    const groupId = await pointer.resolveHandle()
    if (groupId === null) return json({ error: 'Nobody is called that yet.' }, 404)
    return json({ handle, groupId })
  }

  if (request.method !== 'PUT') return json({ error: 'A name is claimed with PUT.' }, 405)

  const asked = await readGroupId(request)
  if (asked === null) return json({ error: 'Say which group.' }, 400)

  // The group has to exist before it can be called anything. Without this a
  // stranger could park every good name against ids nobody ever minted.
  const group = env.MONSTER_GROUP.getByName(asked)
  if ((await group.snapshot()) === null) return json({ error: 'No such group.' }, 404)

  const holder = await pointer.claimHandle(asked)
  if (holder !== asked) return json({ error: 'Somebody already goes by that.' }, 409)
  await group.setHandle(handle)
  return json({ handle, groupId: asked }, 201)
}

/** The group id out of a PUT body, or null if it is not one. Bounded before it
 *  is looked at, because this is a door on the open internet. */
async function readGroupId(request: Request): Promise<string | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  const asked = (body as { groupId?: unknown }).groupId
  if (typeof asked !== 'string' || !GROUP_ID.test(asked)) return null
  return asked
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
  /** Whether the one-off column-and-backfill migration has run for this
   *  instantiation. In memory is enough: the migration is idempotent and an
   *  eviction only costs one more no-op ALTER. */
  private migrated = false

  private budgets = new WeakMap<WebSocket, Budget>()

  /** When the creature was last renamed. In memory for the same reason. */
  private renamedAt = 0

  /**
   * Whether this group was ever really made, cached once it has been asked.
   *
   * Only ever goes from unknown to an answer, and from false to true when
   * create() runs, never the other way, because nothing here deletes a group.
   * An eviction throws the answer away and it costs one query to get it back.
   */
  private made: boolean | null = null

  constructor(ctx: DurableObjectState, env: MonsterEnv) {
    super(ctx, env)
    // Set here rather than beside the socket it serves because the constructor
    // is the one thing that runs again on every wake, and this costs nothing.
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
    this.schema()
    if (this.metaValue('seed') !== null) return
    // No await between the three, so they land as one transaction. A group with
    // an id and no seed would be a group that exists and cannot hatch.
    this.ctx.storage.sql.exec("INSERT INTO meta(k, v) VALUES('groupId', ?)", groupId)
    this.ctx.storage.sql.exec("INSERT INTO meta(k, v) VALUES('seed', ?)", seed)
    this.ctx.storage.sql.exec("INSERT INTO meta(k, v) VALUES('createdAt', ?)", String(Date.now()))
  }

  /**
   * The tables. Made here and not in the constructor, and that is the whole
   * point of the method existing.
   *
   * A Durable Object comes into being the moment somebody asks about it, and
   * an id arriving off the open internet is nearly always an id nobody ever
   * minted. With this in the constructor, every probe of a group that does not
   * exist wrote three statements to a brand new object and only then worked out
   * that the answer was 404, so a stranger with a loop could make this app
   * write storage as fast as it could ask. The allowance being spent is shared
   * with everything else on the domain, so that was not only our own problem.
   * Nothing writes until create() runs, and create() is only reachable from the
   * endpoint that minted the id.
   */
  private schema(): void {
    // Synchronous, so all three land before the inserts that follow and there
    // is no reason to block concurrency on anything. `meta` holds the seed, the
    // name and the birthday; tables rather than variables because a variable is
    // gone the moment this object hibernates.
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL)',
    )
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS actions(n INTEGER PRIMARY KEY, id TEXT NOT NULL,' +
        ' variantId TEXT NOT NULL, actorId TEXT NOT NULL, actorName TEXT NOT NULL,' +
        ' at INTEGER NOT NULL, growth REAL NOT NULL DEFAULT 0)',
    )
    // The per person brake is read straight back out of the log rather than
    // kept anywhere, which is what makes it survive hibernation for free. This
    // index is what keeps that read to the handful of rows it should be.
    this.ctx.storage.sql.exec(
      'CREATE INDEX IF NOT EXISTS actions_by_actor ON actions(actorId, at)',
    )
    this.made = true
  }

  /**
   * Whether there is anything here at all. Asked before every read, because the
   * tables do not exist until create() has run and a query against a table that
   * is not there throws rather than coming back empty. The try is the test
   * itself, which is not elegant, and the alternative was making the table so
   * that asking about it would work.
   */
  private exists(): boolean {
    if (this.made !== null) return this.made
    let found: boolean
    try {
      this.ctx.storage.sql.exec('SELECT 1 AS ok FROM meta LIMIT 1').toArray()
      found = true
    } catch {
      found = false
    }
    this.made = found
    if (found) this.migrate()
    return found
  }

  /**
   * Bring a group made before growth existed up to date.
   *
   * `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already there,
   * so adding the growth column to the DDL added it for new groups only. Every
   * group made before that deploy then threw on the first SELECT naming the
   * column, which is to say every existing creature became a 500. Not a
   * degraded creature. Gone.
   *
   * The backfill matters as much as the column. A new column takes its default
   * on every existing row, so the whole log would have read as growth zero and
   * every creature would have been stuck as an egg for ever, which is a quieter
   * version of the same disaster. `n` is the insertion order, so setting growth
   * to it restores exactly what growth was when one action meant one point.
   */
  /**
   * Put this group back on the schema it had before growth existed.
   *
   * Only the test suite calls this, and it earns its place there: the outage it
   * reproduces is one that every existing creature hit at once, and a migration
   * with nothing exercising it is a migration nobody knows works.
   */
  async forgetGrowthColumn(): Promise<void> {
    this.ctx.storage.sql.exec('ALTER TABLE actions DROP COLUMN growth')
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'growth'")
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'grownAt'")
    this.migrated = false
    this.made = null
  }

  private migrate(): void {
    if (this.migrated) return
    this.migrated = true
    try {
      this.ctx.storage.sql.exec('ALTER TABLE actions ADD COLUMN growth REAL NOT NULL DEFAULT 0')
      // Only reached the once, when the column has just been added and every
      // row is therefore carrying the default.
      this.ctx.storage.sql.exec('UPDATE actions SET growth = n')
    } catch {
      // Already has the column. Nothing to do.
      return
    }
    // And the group's running total, which the column alone does not give it:
    // without this the base is zero and the creature walks back down its own
    // stages the moment anybody looks at it.
    if (this.metaValue('growth') === null) {
      const rows = this.ctx.storage.sql
        .exec<{ n: number }>('SELECT MAX(n) AS n FROM actions')
        .toArray()
      const grown = rows.length > 0 && rows[0].n !== null ? Number(rows[0].n) : 0
      this.setMeta('growth', String(grown))
      this.setMeta('grownAt', String(Date.now()))
    }
  }

  /** The whole group as a plain object, or null if nothing was ever made under
   *  this id. Here so a cold load has something to draw before the socket is up. */
  async snapshot(): Promise<GroupSnapshot | null> {
    return this.readSnapshot()
  }

  /**
   * Which group this name points at, or null. Reads and never writes, so a
   * stranger typing names into the box cannot make this app create storage: an
   * unclaimed name is exactly as cheap to ask about as an unminted group id.
   */
  async resolveHandle(): Promise<string | null> {
    if (!this.exists()) return null
    return this.metaValue('points')
  }

  /**
   * Claim this name for a group. First come, first served.
   *
   * Returns whichever group holds it, which is the answer the caller needs
   * either way: the same id back means the claim succeeded, a different one
   * means somebody got there first. Deciding it inside the object is what makes
   * it safe, because a Durable Object runs one request at a time, so two groups
   * claiming the same name at the same moment cannot both read "free".
   */
  async claimHandle(groupId: string): Promise<string> {
    this.schema()
    const held = this.metaValue('points')
    if (held !== null) return held
    this.setMeta('points', groupId)
    return groupId
  }

  /** Records the name a group answers to, for the app to show. Older names are
   *  deliberately left pointing here, so a link or a name already given out to
   *  somebody goes on working after the group renames itself. */
  async setHandle(handle: string): Promise<void> {
    if (!this.exists()) return
    this.setMeta('handle', handle)

    // Everybody looking has to be told, or the person who claimed the name sees
    // the form they just filled in still sitting there and nobody else learns
    // the group has a name until they next reload.
    //
    // A whole snapshot rather than a message of its own, because the contract
    // has no type for this and a fresh snapshot is already defined as truth
    // that replaces whatever a client had. It re-sends the action log, which
    // for a long lived group is not free, and it is the right trade here: a
    // group is named once or twice in its life.
    const snapshot = this.readSnapshot()
    if (snapshot !== null) {
      this.broadcast({ type: 'snapshot', snapshot, present: this.present(null) })
    }
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
    // Far more than a group of friends on every device they own, so anything
    // that reaches this is opening connections on purpose, and the reason it
    // matters is that the message allowance below is per connection.
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return json({ error: 'Too many connections are open to this group.' }, 503)
    }

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
      return
    }
    if (said.type === 'pace') {
      this.repace(ws, said.pace)
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

  /**
   * Somebody saying who they are, which a connection may do once and once only.
   *
   * The id is settable and then immovable for the life of this socket. It used
   * to be settable on every message, and since every per person brake is a
   * query against that id, that meant a client could pick which bucket it was
   * billed against immediately before each action: three limits, carefully
   * shaped, enforcing nothing at all. There is still no proof that the id is
   * whose it says it is, because there are no accounts and cannot be, but one
   * connection is now one person for as long as it is open, which is the least
   * a per person limit needs in order to mean anything.
   *
   * The same id again is allowed through, because it is how somebody changes
   * the name they are showing under and it moves nobody into anybody else's
   * bucket.
   */
  private hello(ws: WebSocket, actorId: string, actorName: string): void {
    const seat = this.seatOf(ws)
    if (seat === null) return
    if (seat.actorId !== null && seat.actorId !== actorId) {
      this.tell(ws, {
        type: 'error',
        message:
          'This connection already belongs to somebody. Open another one to join as anybody else.',
      })
      return
    }
    const named = actorName === '' ? NAMELESS : actorName
    // A hello that says nothing new is not news for anybody else either.
    if (seat.actorId === actorId && seat.actorName === named) return
    ws.serializeAttachment({ sid: seat.sid, actorId, actorName: named })
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
    const variant = variantById(variantId)
    if (variant === undefined) {
      this.tell(ws, { type: 'error', message: 'That is not something anybody can do.' })
      return
    }

    const now = Date.now()
    // Rows are only ever added here and never removed, so the highest row id is
    // also how many there are, and one read answers the cap, the clock and the
    // whole group's recent history at once. Descending row order is descending
    // time order because the timestamp below is clamped so it can never go
    // backwards, and a read of the last GROUP_ACTS_PER_HOUR rows is an exact
    // answer for the hour rather than a sample, because that limit is precisely
    // what stops a hundred and twenty first row being written inside one.
    const recent = this.ctx.storage.sql
      .exec<{ n: number; at: number }>(
        'SELECT n, at FROM actions ORDER BY n DESC LIMIT ?',
        GROUP_ACTS_PER_HOUR,
      )
      .toArray()
    const tail = recent.length > 0 ? recent[0] : null
    if (tail !== null && tail.n >= MAX_ACTIONS) {
      this.tell(ws, {
        type: 'error',
        message:
          'This creature has a full life behind it. Nothing more can be added,' +
          ' but all of it stays exactly as it is, and a new group starts a new one.',
      })
      return
    }

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

    // The same two windows again for everybody together. Counted in here rather
    // than in SQL because the rows are already read: there is no index on `at`
    // alone, and a WHERE on it would be a scan of the whole log every time.
    let groupMinute = 0
    let groupHour = 0
    for (const row of recent) {
      if (row.at > now - HOUR_MS) groupHour += 1
      if (row.at > now - MINUTE_MS) groupMinute += 1
    }
    if (groupMinute >= GROUP_ACTS_PER_MINUTE) {
      this.tell(ws, { type: 'error', message: 'A lot is happening at once. Let it catch up.' })
      return
    }
    if (groupHour >= GROUP_ACTS_PER_HOUR) {
      this.tell(ws, {
        type: 'error',
        message: 'It has had a very full hour. Come back to it in a while.',
      })
      return
    }

    // Somebody who has never acted here before is a new name in the bond list
    // forever, so there is a bound on how many of those a group can collect.
    const returning = this.hasActed(seat.actorId)
    if (!returning && this.actorCount() >= MAX_ACTORS) {
      this.tell(ws, {
        type: 'error',
        message: 'This group already has as many people in it as it can hold.',
      })
      return
    }

    // Last, because it is the only check here that can cost a read of the whole
    // log, and by this point the message has already had to get past every
    // cheap reason to refuse it.
    const minStage = variant.minStage ?? 0
    if (minStage > 0 && !this.grownTo(minStage)) {
      this.tell(ws, { type: 'error', message: 'It is not ready for that yet.' })
      return
    }

    // Never allowed to go backwards. The order of the log is the order of the
    // array and nothing else, but a timestamp that ran backwards after a clock
    // correction would show a creature whose life happened out of order.
    const at = tail !== null && tail.at > now ? tail.at : now
    // Folded before the row is written, so the row carries the total INCLUDING
    // what this action was worth. A replay then sees the creature exactly as
    // grown as it was at the moment the pressure landed.
    const grown = this.addActionGrowth(at)
    const action: ActionRecord = {
      id: crypto.randomUUID(),
      variantId,
      actorId: seat.actorId,
      actorName: seat.actorName,
      at,
      growth: grown,
    }
    // Written before it is told, always. An action that was announced and then
    // failed to save would leave everybody looking at a creature that nobody
    // arriving later would ever see.
    this.ctx.storage.sql.exec(
      'INSERT INTO actions(id, variantId, actorId, actorName, at, growth) VALUES(?, ?, ?, ?, ?, ?)',
      action.id,
      action.variantId,
      action.actorId,
      action.actorName,
      action.at,
      action.growth,
    )
    // Kept as a number rather than counted, because the honest question is a
    // scan of the index and it would be asked on every action. Correct because
    // it is written here, in the one place a person can become a new one.
    if (!returning) this.setMeta('actors', String(this.actorCount() + 1))
    // Told to everybody including the person who did it, which is the opposite
    // of what a chat room would do and is right here: the creature is the
    // ORDER, so the actor must take its place in the log from the server like
    // everyone else rather than guess at it locally and be subtly wrong.
    this.broadcast({ type: 'action', action })

    // Said to the whole group, once, on the way past. The cap is the end of
    // this creature's life and it cannot be undone, so the one thing that must
    // not happen is a group discovering it by pressing a button one day and
    // being told no.
    const used = tail === null ? 1 : tail.n + 1
    if (used === MAX_ACTIONS - CAP_WARNING) {
      this.broadcast({
        type: 'error',
        message: `There is room for ${CAP_WARNING} more things, and then its life is complete.`,
      })
    }
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
    this.setMeta('name', name)
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

  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO meta(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
      key,
      value,
    )
  }

  /** Whether this actor has ever acted here. One row off the index, which is
   *  the reason the index has actorId first. */
  private hasActed(actorId: string): boolean {
    return (
      this.ctx.storage.sql
        .exec<{ ok: number }>('SELECT 1 AS ok FROM actions WHERE actorId = ? LIMIT 1', actorId)
        .toArray().length > 0
    )
  }

  /**
   * How many different people have ever acted here.
   *
   * Kept in `meta` and added to as they arrive, because the honest question is
   * a scan of the whole index and this is asked on the way in. It cannot drift:
   * rows are never deleted, so the number only ever goes up and only ever by
   * one, at the one place that inserts. A group whose log predates this counter
   * works it out the once and writes it down.
   */
  private actorCount(): number {
    const stored = this.metaValue('actors')
    if (stored !== null) return Number(stored)
    const counted = this.ctx.storage.sql
      .exec<{ actors: number }>(
        'SELECT COUNT(*) AS actors FROM (SELECT DISTINCT actorId FROM actions)',
      )
      .one().actors
    this.setMeta('actors', String(counted))
    return counted
  }

  /**
   * Whether the creature has grown to a given stage, which some of the things a
   * person can do are gated behind.
   *
   * The client only ever offers what the creature is old enough for, but the
   * client is not the only thing that can send a message, and an action stored
   * out of its stage is a pressure the design says the animal cannot feel yet,
   * sitting in the log permanently. So the server has to know the stage, and it
   * works it out by deriving the creature from its own log with the same code
   * every screen uses. There is no second copy of the genetics here and there
   * must never be one.
   *
   * Deriving costs a read of the whole log, which is why the answer is written
   * down. It is not a cache and cannot go stale: the stage is a function of how
   * many actions there are, that number only goes up, so a stage once reached
   * is reached forever. The only time this really runs is the handful of
   * occasions a group is growing into the gated half of the catalogue.
   */
  private grownTo(stage: number): boolean {
    const reached = Number(this.metaValue('stage') ?? '0')
    if (reached >= stage) return true
    const snapshot = this.readSnapshot()
    if (snapshot === null) return false
    const grown = deriveCreature(
      snapshot.genome,
      snapshot.actions,
      snapshot.name,
      snapshot.growth,
    ).stage
    if (grown > reached) this.setMeta('stage', String(grown))
    return grown >= stage
  }

  /**
   * How fast this group wants its creature to live.
   *
   * The settling on the first line is the whole of the correctness here. Growth
   * is a stored base plus the hours since, multiplied by pace, so changing pace
   * without banking what has already accrued would re-price every hour the
   * creature has ever lived at the new rate. Turn it up on a week-old animal and
   * that week would silently be re-run at the faster rate; turn it down and the
   * creature would go backwards. Bank first, then change the rate, and only the
   * future moves.
   */
  private repace(ws: WebSocket, wanted: number): void {
    const seat = this.seatOf(ws)
    if (seat === null || seat.actorId === null) {
      this.tell(ws, { type: 'error', message: 'Say hello before changing the pace.' })
      return
    }
    const next = Math.min(PACE_MAX, Math.max(PACE_MIN, wanted))
    if (next === this.pace()) return

    const at = Date.now()
    this.setMeta('growth', String(this.growthNow(at)))
    this.setMeta('grownAt', String(at))
    this.setMeta('pace', String(next))

    // Everybody has to be told, because this changes how fast the animal they
    // are all looking at is living.
    const snapshot = this.readSnapshot()
    if (snapshot !== null) {
      this.broadcast({ type: 'snapshot', snapshot, present: this.present(null) })
    }
  }

  // -- growth ----------------------------------------------------------------

  /** This group's pace, clamped, defaulting to 1. */
  private pace(): number {
    const raw = Number(this.metaValue('pace') ?? '1')
    if (!Number.isFinite(raw)) return 1
    return Math.min(PACE_MAX, Math.max(PACE_MIN, raw))
  }

  /**
   * How grown the creature is at this instant.
   *
   * A stored total plus the time since it was stored. Nothing is written, which
   * is what makes reading it free and what lets an idle group cost nothing at
   * all: the creature has been growing the whole time, it simply had not been
   * added up until somebody asked.
   */
  private growthNow(at: number): number {
    const base = Number(this.metaValue('growth') ?? '0')
    // Falls back to when the group was made, NOT to now. Defaulting to now was
    // a bug with no symptom except the whole feature quietly not working: every
    // read set the clock to the moment it was asked, elapsed was always zero,
    // and a creature nobody had acted on grew not at all, forever.
    const since = Number(this.metaValue('grownAt') ?? this.metaValue('createdAt') ?? String(at))
    const elapsed = Math.max(0, at - since)
    return (Number.isFinite(base) ? base : 0) + elapsed * GROWTH_PER_MS * this.pace()
  }

  /**
   * Fold an action's worth into the total and store the result.
   *
   * Called only from `act`, which already writes, so growth never turns a read
   * into a write. The worth falls away across the actions taken since this
   * stage began, so a burst brings a stage forward without skipping it.
   */
  private addActionGrowth(at: number): number {
    const now = this.growthNow(at)
    const stage = stageOfGrowth(now)
    const done = Number(this.metaValue('sinceStage') ?? '0')
    const worth = ACTION_WORTH * (ACTION_FLOOR + (1 - ACTION_FLOOR) / (1 + done / ACTION_HALF))
    const next = now + worth

    this.setMeta('growth', String(next))
    this.setMeta('grownAt', String(at))
    // Reset the run when the stage changes, so every stage starts with actions
    // at full value rather than inheriting the last one's exhaustion.
    this.setMeta('sinceStage', stageOfGrowth(next) === stage ? String(done + 1) : '0')
    return next
  }

  /**
   * The group as everybody sees it. The genome is rolled from the seed on every
   * read rather than stored, which is the point: there is one copy of the
   * genetics, it lives in src/dna, and the server holding a stale copy of a
   * creature's potential is a bug that cannot happen because there is no copy
   * to go stale.
   */
  private readSnapshot(): GroupSnapshot | null {
    if (!this.exists()) return null
    const seed = this.metaValue('seed')
    if (seed === null) return null
    return {
      groupId: this.metaValue('groupId') ?? '',
      createdAt: Number(this.metaValue('createdAt') ?? '0'),
      name: this.metaValue('name'),
      handle: this.metaValue('handle'),
      growth: this.growthNow(Date.now()),
      pace: this.pace(),
      genome: rollGenome(seed),
      actions: this.ctx.storage.sql
        .exec<{
          id: string
          variantId: string
          actorId: string
          actorName: string
          at: number
          growth: number
        }>('SELECT id, variantId, actorId, actorName, at, growth FROM actions ORDER BY n')
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
