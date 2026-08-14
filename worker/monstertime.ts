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
import {
  allowedWhileAsleep,
  deriveCreature,
  methodFits,
  rollActivity,
  rollGenome,
  lastRouseAt,
  sleepState,
  stageOfGrowth,
  variantById,
} from '../src/dna/index'
import type { SleepState } from '../src/dna/index'
import type { Genome } from '../src/core/types'
import { googleKeys, verifyIdToken, type KeySource } from './verify'
import { cleanPasscode, hashPasscode, mintPasscode } from './passcode'
// The market's arithmetic and its legality, imported rather than restated. The
// worker takes '../src/market/rules' and never '../src/market': the second half
// of that module needs the palette, which needs three.js, and a renderer has no
// business inside a Durable Object. Nothing below re-derives a price, a purse or
// a leader; this file decides only who is asking and what gets written.
import {
  atMarket,
  checkPledge,
  checkWithdrawal,
  CLAIMED_PREFIX,
  EGG_COUNT,
  GRANDFATHERED_HATCH_SPEED,
  hatchAdjusted,
  isClaimedMember,
  pledgedBy,
  resolutionOf,
  withPledge,
  withWithdrawal,
  type Resolution,
} from '../src/market/rules'
import type {
  ActionRecord,
  ClientMessage,
  GroupSnapshot,
  GroupView,
  MarketNote,
  MarketSnapshot,
  MarketState,
  Pledge,
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

/**
 * Bytes of randomness in a seed. This is the thing that makes two groups'
 * creatures incomparable, so it is generous.
 *
 * Three are drawn for every group that forms now, one per egg on offer, and the
 * one the group buys becomes the group's seed unchanged. All three are drawn
 * here, from crypto randomness, exactly as the single seed always was: a seed a
 * client could choose is a creature two groups could both have, and putting
 * three on a screen changed nothing about that.
 */
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

/**
 * An actor id that a real, signed-in or passcode-holding person owns.
 *
 * '@' cannot appear in ACTOR_ID, so a client cannot mint one of these however
 * it is asked. That is the whole mechanism: an id beginning with '@' was issued
 * by this file after a Google-signed token verified or after somebody claimed a
 * place, and an id without one was simply typed by a browser. No extra column,
 * no second table, and every place that already reads an actorId gets the
 * distinction for free.
 *
 * It matters because trait credit is the emotional payload of the app, and
 * because coins are now spent on that id. Coins on a self-asserted id are coins
 * anybody can mint by clearing their local storage, which is what makes the
 * passcode load bearing rather than decorative.
 *
 * The character itself lives in src/market/rules.ts and is imported, not typed
 * again here. Both sides ask the question now (the server refuses a pledge from
 * anybody else, the app decides whether to offer the buttons at all), and a
 * second '@' written down would be a rule that agrees until one copy is edited.
 * That is the exact failure the last fleet lost a feature to.
 */
function verifiedActorId(uid: string): string {
  return CLAIMED_PREFIX + uid
}

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

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

/**
 * How long the creature stays up after somebody wakes it.
 *
 * Half an hour, and both ends of that are decided by what a group does with it.
 * Long enough that waking it buys a visit rather than a single action: several
 * people, a turn each, with the cooldown between them. Short enough that it
 * stays a favour asked of a sleeping animal rather than a switch, so a group
 * that wants the whole night gets it in half hour instalments, each one a row
 * in the log pushing the same three axes. That is what putting the waking
 * through the ordinary pipeline was for, and a rouse that lasted until morning
 * would throw it away.
 *
 * It must stay UNDER AN HOUR, and that is not a taste. The window is answered
 * out of the last GROUP_ACTS_PER_HOUR rows, which is an exact answer for an
 * hour and a sample for anything longer; the proof is written out at rousedAt.
 * Sitting it on the hour rather than under it would be the same defect waiting
 * for somebody to shorten the read.
 */

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
 * How many people may ever claim a place in one group.
 *
 * The same number as MAX_ACTORS, and deliberately the same number rather than a
 * second opinion: both are answering "how many people is a friend group", and
 * two different answers to that would be two bounds to reason about for no gain.
 *
 * It is here because the market gave claiming a price. Every claim raises what
 * the two eggs that scale cost, so without a bound anybody holding the link can
 * claim a thousand times and leave the group unable to reach either of them, with
 * no way back: nothing here deletes a claim. That is the same shape of defect as
 * the strand that put `withdraw` in the design, one size up, and it costs one
 * comparison to close. The purses those claims bring are no answer, because they
 * belong to whoever holds the codes.
 *
 * It is not the whole answer either, and the plain egg is why: it is flat at 75
 * now, so a thousand claims leave the group still able to buy that one and the
 * bound is what keeps the other two reachable rather than what keeps the group
 * from being stranded outright.
 */
const MAX_CLAIMED = MAX_ACTORS

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

/** One candidate seed. Three of these are drawn when a group forms and one of
 *  them becomes the animal, so this is the only place a seed comes from and it
 *  is as far from the open internet as it always was. */
function mintSeed(): string {
  return hex(randomBytes(SEED_BYTES))
}

/** Where one egg's seed lives in `meta`. Indexed by position because the index
 *  IS the egg everywhere: 0 is the cheapest and slowest, 2 the dearest and
 *  fastest, and rules.ts prices them off the same number. */
function eggKey(egg: number): string {
  return `egg:${egg}`
}

/**
 * Where the note that this browser already claimed a place lives.
 *
 * Keyed by the actor id the client sent, which is a string it keeps in local
 * storage and is not a proof of anything, and that is exactly as much as this
 * can be: the limit is written out in full in claim(). It is enough for what it
 * is for, which is that tapping the button twice does not mint a second purse
 * and raise every price in the group for good.
 *
 * The prefix cannot collide with anything else in `meta`. `claimed` is the
 * count and is an exact key rather than a prefix, `code:` is a hash, `egg:` is
 * an index, and ACTOR_ID has no colon in it.
 */
function placeKey(actorId: string): string {
  return `place:${actorId}`
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
    // ACTOR_ID has no '@' in it, so this is also what stops a client claiming
    // an id that would read as verified.
    if (!ACTOR_ID.test(actorId)) return null
    const token = typeof parsed.token === 'string' ? parsed.token : undefined
    const code = typeof parsed.code === 'string' ? parsed.code : undefined
    return {
      type: 'hello',
      actorId,
      actorName: cleanText(parsed.actorName, ACTOR_NAME_MAX),
      token,
      code,
    }
  }
  if (parsed.type === 'act') {
    if (typeof parsed.variantId !== 'string') return null
    if (parsed.variantId.length === 0 || parsed.variantId.length > VARIANT_ID_MAX) return null
    if (parsed.methodId === undefined || parsed.methodId === null) {
      return { type: 'act', variantId: parsed.variantId }
    }
    if (typeof parsed.methodId !== 'string') return null
    if (parsed.methodId.length === 0 || parsed.methodId.length > VARIANT_ID_MAX) return null
    return { type: 'act', variantId: parsed.variantId, methodId: parsed.methodId }
  }
  if (parsed.type === 'name') {
    return { type: 'name', name: cleanText(parsed.name, GROUP_NAME_MAX) }
  }
  if (parsed.type === 'claim') return { type: 'claim' }
  if (parsed.type === 'pace') {
    const pace = Number(parsed.pace)
    if (!Number.isFinite(pace)) return null
    return { type: 'pace', pace }
  }
  // Nothing about a pledge is judged here, and that is the point. A number
  // arrives as a number and every question about whether it is a sum anybody may
  // put behind an egg they are allowed to buy is answered once, by checkPledge,
  // which the app calls too. Turning a bad one away at the parse would mean the
  // client got silence where the shared rule has a reason, and it would put a
  // second, quieter copy of the rule in this file. Number() of anything that is
  // not a number is NaN, which is not an integer and not an egg index, so both
  // of those come back as a named refusal rather than as nothing at all.
  if (parsed.type === 'pledge') {
    return { type: 'pledge', egg: wireNumber(parsed.egg), coins: wireNumber(parsed.coins) }
  }
  if (parsed.type === 'withdraw') return { type: 'withdraw', egg: wireNumber(parsed.egg) }
  return null
}

/**
 * A number off the wire, or NaN.
 *
 * Anything that is not already a number becomes NaN rather than being coerced,
 * and that is not fussiness. Number(null) is 0, 0 is a real egg and a real
 * refusal to spend nothing, so a message with a field missing would otherwise
 * read as a considered choice of the cheapest egg. NaN is neither an egg index
 * nor a sum, so both of those come back from the shared rules as a named
 * refusal.
 */
function wireNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN
}

// ---------------------------------------------------------------------------
// The Worker side
// ---------------------------------------------------------------------------

export interface MonsterEnv {
  MONSTER_GROUP: DurableObjectNamespace<MonsterGroup>
  /**
   * The Firebase project ID whose sign-ins this app accepts.
   *
   * Optional, and everything works without it: with no project configured no
   * token is ever believed, everybody is an unverified guest, and the app is
   * exactly what it was before sign-in existed. That is the point of it being
   * optional rather than required. It also means an accidentally blank binding
   * fails CLOSED, refusing every token, rather than falling back to trusting
   * whatever a client sent.
   */
  MONSTERTIME_FIREBASE_PROJECT?: string
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
    // The id is made here and only here, and the eggs are drawn inside the
    // object create() runs in. A client that could choose either could hand two
    // friend groups the same animal, which is the one outcome this app has no
    // answer for. What has changed is that no seed is chosen at this moment by
    // anybody, including us: the group forms with three eggs in front of it and
    // buys one of them together.
    const groupId = base64url(randomBytes(ID_BYTES))
    await env.MONSTER_GROUP.getByName(groupId).create(groupId)
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

/**
 * The tail of the log, newest first, as `act` reads it once and then answers
 * everything out of: the lifetime cap, both group windows, and when the
 * creature was last woken. One read rather than four because every one of them
 * is a question about the same handful of recent rows, and because the row
 * count that makes the read exact is the same number in all four cases.
 *
 * A type and not an interface, which is not a style choice: the row generic on
 * sql.exec wants a string index signature, and TypeScript infers one for a type
 * alias and refuses to for an interface.
 */
type Recent = {
  n: number
  at: number
  variantId: string
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

  /** Google's signing keys, fetched at most once an hour and shared by every
   *  sign-in this object sees. */
  private readonly keys: KeySource = googleKeys()

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
   * Called once, by the endpoint that generated the id.
   *
   * A group is born WITH NO SEED and three eggs on offer. That is the whole
   * feature: a seed written here would be a creature that already belongs to
   * whoever pressed the button, decided before anybody else had arrived, which
   * is exactly what the market replaces. The group's seed is set once, later, by
   * resolve(), and it is the seed of the egg they bought.
   *
   * If this group has already been made it wins and nothing here runs again:
   * running this twice would put three different eggs in front of a group that
   * may already be pledging against the first three, and if it had already
   * bought, a second set of candidates over a live seed is a group holding an
   * animal nobody chose. The test is `groupId` and not `seed`, because there is
   * a real and normal state now in which a group exists and has no seed.
   */
  async create(groupId: string): Promise<void> {
    this.schema()
    if (this.metaValue('groupId') !== null) return
    // No await anywhere in here, so all five land as one transaction. A group
    // with an id and no eggs would be a group that exists and can never buy.
    this.ctx.storage.sql.exec("INSERT INTO meta(k, v) VALUES('groupId', ?)", groupId)
    this.ctx.storage.sql.exec("INSERT INTO meta(k, v) VALUES('createdAt', ?)", String(Date.now()))
    for (let egg = 0; egg < EGG_COUNT; egg++) {
      this.ctx.storage.sql.exec('INSERT INTO meta(k, v) VALUES(?, ?)', eggKey(egg), mintSeed())
    }
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
        ' variantId TEXT NOT NULL, methodId TEXT, actorId TEXT NOT NULL,' +
        ' actorName TEXT NOT NULL, at INTEGER NOT NULL, growth REAL NOT NULL DEFAULT 0)',
    )
    // The per person brake is read straight back out of the log rather than
    // kept anywhere, which is what makes it survive hibernation for free. This
    // index is what keeps that read to the handful of rows it should be.
    this.ctx.storage.sql.exec(
      'CREATE INDEX IF NOT EXISTS actions_by_actor ON actions(actorId, at)',
    )
    this.pledgeTable()
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
  /**
   * Move this group's whole life back by the given number of milliseconds.
   *
   * The second hook the test suite has, and it earns its place the same way the
   * first one does: what it reaches cannot be reached any other way. Every
   * creature is awake on the day its group is made, by construction and
   * deliberately, so nothing anybody does to a fresh group can put it to sleep,
   * and hours of real waiting is not a thing a test can do. A sleep gate with
   * nothing exercising it is a gate nobody knows fires, and this app has already
   * shipped one of those.
   *
   * The alternative was letting this object be told what time it is, which would
   * put a settable clock on the path every real action takes. This touches
   * stored instants only, and nothing in route() calls it, so it is exactly as
   * far from the open internet as forgetGrowthColumn is.
   *
   * The birthday and every row move TOGETHER, because that is what "time has
   * passed" means here: the schedule is measured from when the creature began
   * and the rouse from the last waking, and shifting one without the other would
   * be a state this group could never have been in. Growth follows the same
   * instants, so the creature comes out as old as the clock now says it is.
   *
   * `bornAt` moves with them and cannot be left out. It is what the night is
   * measured from, so a hook that aged a group without it would age everything
   * except the schedule, and every sleep test would be asking about a creature
   * standing still.
   */
  async age(byMs: number): Promise<void> {
    if (!this.exists()) return
    this.setMeta('createdAt', String(Number(this.metaValue('createdAt') ?? '0') - byMs))
    const bornAt = this.metaValue('bornAt')
    if (bornAt !== null) this.setMeta('bornAt', String(Number(bornAt) - byMs))
    const grownAt = this.metaValue('grownAt')
    if (grownAt !== null) this.setMeta('grownAt', String(Number(grownAt) - byMs))
    this.ctx.storage.sql.exec('UPDATE actions SET at = at - ?', byMs)
  }

  async forgetGrowthColumn(): Promise<void> {
    this.ctx.storage.sql.exec('ALTER TABLE actions DROP COLUMN growth')
    this.ctx.storage.sql.exec('ALTER TABLE actions DROP COLUMN methodId')
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'growth'")
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'grownAt'")
    // And the table the market added, which is the one this deploy's migration
    // has to put back. A group that has never seen it is exactly the group that
    // 500s if a read names it.
    this.ctx.storage.sql.exec('DROP TABLE IF EXISTS pledges')
    // The eggs go only if this group has already bought, and the condition is
    // the point rather than a saving. A group with a seed is put back to
    // precisely what every live group looks like today: a seed, a log, and no
    // memory of ever having chosen. A group still AT the market keeps its three,
    // because a market with no eggs in it is not an older shape of anything, it
    // is a group that could never exist, and a hook that manufactures impossible
    // states proves nothing about the ones that happen. What it leaves is the
    // state the migration is for: a group that needs the pledges table and does
    // not have it.
    if (this.metaValue('seed') !== null) {
      for (let egg = 0; egg < EGG_COUNT; egg++) {
        this.ctx.storage.sql.exec('DELETE FROM meta WHERE k = ?', eggKey(egg))
      }
    }
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'hatchSpeed'")
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'claimed'")
    // Nobody who bought before the market existed has one of these, and a group
    // put back on that schema must not either: what makes a grandfathered
    // creature's night correct is that it falls through to `createdAt`, and a
    // `bornAt` left lying here would prove that fallback works while quietly
    // never using it.
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE k = 'bornAt'")
    // Same for the note saying which browser claimed which place. The codes stay,
    // exactly as they do for a real group of this vintage, and that pair is the
    // honest shape of the limit: a place claimed before this deploy has nothing
    // recorded that a second claim from the same browser could be matched
    // against, so for those the double claim is still open and there is nothing
    // here that could close it.
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE k LIKE 'place:%'")
    this.migrated = false
    this.made = null
  }

  /**
   * Put a second row behind one person on one egg, the way a pledge used to.
   *
   * The third hook the test suite has, and it earns its place the same way the
   * other two do: what it reaches cannot be reached any other way. Every group
   * standing at the market on the day this deploys has rows like these, because
   * a pledge appended one and lowering a figure meant a withdrawal and then a
   * smaller pledge, and the very next read of such a group runs a migration that
   * has to fold them together without moving a coin. That migration runs on live
   * markets with nobody looking, and the number it is folding decides which
   * animal a group ends up with, so it is not allowed to be the one piece of
   * this with nothing exercising it.
   *
   * The index goes with the row, because the index is what makes a second row
   * impossible now, and putting it back is precisely the job being tested. The
   * cached answers are cleared so the next read migrates rather than trusting
   * what this instantiation already worked out.
   *
   * Nothing in route() calls it, so it is exactly as far from the open internet
   * as forgetGrowthColumn and age are.
   */
  async pledgeTwice(actorId: string, actorName: string, egg: number, coins: number): Promise<void> {
    if (!this.exists()) return
    this.ctx.storage.sql.exec('DROP INDEX IF EXISTS pledges_one_per_person')
    this.ctx.storage.sql.exec(
      'INSERT INTO pledges(actorId, actorName, egg, coins, at) VALUES(?, ?, ?, ?, ?)',
      actorId,
      actorName,
      egg,
      coins,
      Date.now(),
    )
    this.migrated = false
    this.made = null
  }

  private migrate(): void {
    if (this.migrated) return
    this.migrated = true
    this.addGrowthColumn()
    // Each column is tried on its own. Sharing one try block would mean a
    // group that already has growth returns before methodId is ever attempted,
    // which is every group that exists: the second migration would silently
    // never run anywhere it was needed.
    this.addMethodColumn()
    this.addPledgeTable()
  }

  private addGrowthColumn(): void {
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

  /**
   * How a thing was done, added to every group that predates methods existing.
   *
   * Nullable with no backfill, and that is the correct history rather than a
   * shortcut: nobody who acted before this shipped was ever asked how, so
   * writing a manner onto their rows would invent a fact about them and change
   * the creature they raised. A null composes to the item's push alone, which
   * is exactly what those actions did at the time.
   */
  private addMethodColumn(): void {
    try {
      this.ctx.storage.sql.exec('ALTER TABLE actions ADD COLUMN methodId TEXT')
    } catch {
      // Already has it.
    }
  }

  /**
   * The table coins live in, added to every group that predates the market.
   *
   * A whole new table rather than a column, so IF NOT EXISTS is the honest
   * statement here and does the work: the sentence that did nothing and cost
   * every live creature a 500 was IF NOT EXISTS against a table that was already
   * there. This one is against a table that is not.
   *
   * Grandfathered groups have no market and will never write a row into it, and
   * it is made for them anyway. The alternative is a table that exists for some
   * groups and not others, and therefore a read that throws depending on when
   * the group was made, which is the same outage wearing a different hat. It
   * costs one statement, once, on the first read after this deploy.
   *
   * Its own try block, like the two above it and for the same reason: a group
   * that already had one of the earlier migrations must not return before
   * reaching this one.
   *
   * It is reached before anything can write a pledge, and that ordering is now
   * load bearing rather than tidy: migrate() is called by exists(), exists() is
   * called by marketNow(), and pledge() reads the market before it writes a row.
   * The upsert below names a unique index by its columns, so the index has to be
   * there first.
   */
  private addPledgeTable(): void {
    try {
      this.pledgeTable()
    } catch {
      // Nothing to do: it is already there.
    }
  }

  /**
   * The pledge table in the shape this deploy needs, whether the group has one
   * already or not. One place, so the DDL a new group gets and the DDL an old
   * one is migrated onto cannot drift apart.
   *
   * Coins behind eggs, in arrival order, and nothing derived from them. The
   * totals, everybody's purse, which egg is in front and whether the thing is
   * bought are all worked out from these rows by src/market/rules.ts every time
   * they are asked, because a stored running total is a number that can be wrong
   * and this one decides which animal a group ends up with.
   *
   * THE INDEX IS AN INVARIANT AND NOT A LOOKUP, which is why there was rightly
   * none here before. Every read is the whole list (that is what the rules take)
   * and the list is bounded by a purse per member, so there is still no query to
   * narrow and this index will never be read by one. What it is for is that a
   * pledge now SETS what somebody has on an egg rather than adding to it, and one
   * person, one egg, one row is the property the market rests on. Stated to
   * SQLite it cannot be broken by a second writer arriving later; kept true by
   * the one method that happens to write today, it lasts until somebody adds the
   * second one.
   */
  private pledgeTable(): void {
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS pledges(n INTEGER PRIMARY KEY, actorId TEXT NOT NULL,' +
        ' actorName TEXT NOT NULL, egg INTEGER NOT NULL, coins INTEGER NOT NULL,' +
        ' at INTEGER NOT NULL)',
    )
    this.collapsePledges()
    this.ctx.storage.sql.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS pledges_one_per_person ON pledges(actorId, egg)',
    )
  }

  /**
   * Rows from before a pledge replaced instead of adding, folded into one each.
   *
   * A pledge used to append, so anybody who moved twice on one egg has two rows
   * and the unique index above would refuse to be built over them. Between the
   * two statements it must be impossible for a coin to appear or vanish: this
   * runs on the first read after the deploy, on live markets, with nobody
   * looking, and a total that moved by one could put a different egg in front and
   * hand a group an animal they did not choose. Summing is not a judgement call
   * for exactly that reason: two rows of forty and fifty already MEANT ninety to
   * every purse, every total and every leader in src/market/rules.ts, so summing
   * them is the one collapse that leaves all three answers identical.
   *
   * The survivor is the earliest row, so it keeps its `at` and its place in the
   * list, for the reason withPledge keeps them: the order is the record of how
   * the group got here, and somebody who moved twice did not arrive the second
   * time.
   *
   * A no-op on a group that has never pledged and on every group made after this,
   * which is what lets it sit on the same path as the CREATE.
   */
  private collapsePledges(): void {
    this.ctx.storage.sql.exec(
      'UPDATE pledges SET coins = (SELECT SUM(dup.coins) FROM pledges dup' +
        ' WHERE dup.actorId = pledges.actorId AND dup.egg = pledges.egg)' +
        ' WHERE n IN (SELECT MIN(n) FROM pledges GROUP BY actorId, egg)',
    )
    this.ctx.storage.sql.exec(
      'DELETE FROM pledges WHERE n NOT IN (SELECT MIN(n) FROM pledges GROUP BY actorId, egg)',
    )
  }

  /**
   * The whole group as a plain object, or null if nothing was ever made under
   * this id. Here so a cold load has something to draw before the socket is up.
   *
   * Either shape, and the caller narrows with atMarket(). This used to answer
   * null for a group with no seed, which was right when the only way to have no
   * seed was not to exist; a group at the market is a group, and a door that
   * called it missing would have made "no such group" the first thing everybody
   * saw for the whole time they were choosing.
   */
  async snapshot(): Promise<GroupView | null> {
    return this.readView()
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
    //
    // A group at the market gets the market instead, because that is the message
    // its screens are drawing from: the handle is on both shapes, and a snapshot
    // that arrived as null would leave the person who just claimed the name
    // looking at the form they filled in.
    const view = this.readView()
    if (view === null) return
    if (atMarket(view)) {
      this.broadcast({ type: 'market', snapshot: view, present: this.present(null), note: null })
      return
    }
    this.broadcast({ type: 'snapshot', snapshot: view, present: this.present(null) })
  }

  /**
   * A socket joining. The Worker in front has already checked the method, the
   * id and the upgrade header, so what is left to settle is whether this group
   * exists at all: somebody who guessed at a link gets a plain 404 and no
   * socket, rather than an open connection to an animal that was never born.
   */
  override async fetch(): Promise<Response> {
    const view = this.readView()
    if (view === null) return json({ error: 'No such group.' }, 404)
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
    // draws the creature, or the market if there is no creature yet. Somebody
    // who has not claimed a place can watch the whole thing and cannot spend a
    // coin in it, which is the point of the market being on this connection
    // rather than behind a door.
    if (atMarket(view)) {
      this.tell(server, { type: 'market', snapshot: view, present: this.present(null), note: null })
    } else {
      this.tell(server, { type: 'snapshot', snapshot: view, present: this.present(null) })
    }
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
      // The only handler that awaits. Verifying a token means a signature check
      // and, once an hour, fetching Google's keys; everything else in here is
      // synchronous and stays that way.
      void this.hello(ws, said.actorId, said.actorName, said.token, said.code)
      return
    }
    if (said.type === 'act') {
      this.act(ws, said.variantId, said.methodId)
      return
    }
    if (said.type === 'name') {
      this.rename(ws, said.name)
      return
    }
    if (said.type === 'pace') {
      this.repace(ws, said.pace)
      return
    }
    if (said.type === 'pledge') {
      this.pledge(ws, said.egg, said.coins)
      return
    }
    if (said.type === 'withdraw') {
      this.withdraw(ws, said.egg)
      return
    }
    if (said.type === 'claim') {
      void this.claim(ws)
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
  private async hello(
    ws: WebSocket,
    claimed: string,
    actorName: string,
    token?: string,
    code?: string,
  ): Promise<void> {
    const seat = this.seatOf(ws)
    if (seat === null) return

    // A token, if there is one and if this deployment knows which project to
    // believe. The id the client sent alongside it is discarded on success:
    // somebody signed in does not get to choose who they are.
    let actorId = claimed
    const project = this.env.MONSTERTIME_FIREBASE_PROJECT
    if (token !== undefined && project !== undefined && project !== '') {
      const user = await verifyIdToken(token, project, this.keys)
      if (user === null) {
        this.tell(ws, { type: 'error', message: 'That sign-in is not valid any more.' })
        return
      }
      actorId = verifiedActorId(user.uid)
    }

    // A passcode, if they have one. Checked after a token, because a token is
    // the stronger claim and there is no reason to look at both.
    if (actorId === claimed && code !== undefined) {
      const owner = await this.whoHolds(code)
      if (owner === null) {
        // Deliberately the same refusal whether the code was malformed, unknown
        // or simply wrong. Telling somebody which of those it was is telling
        // them how far through the wordlist they have got.
        this.tell(ws, { type: 'error', message: 'That code does not open anything here.' })
        return
      }
      actorId = owner
    }

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

  private act(ws: WebSocket, variantId: string, methodId?: string): void {
    const seat = this.seatOf(ws)
    if (seat === null || seat.actorId === null) {
      this.tell(ws, { type: 'error', message: 'Say hello before acting.' })
      return
    }
    // Nothing to do it to yet, and this is first because at the market NOTHING
    // is something anybody can do: every refusal below is about a creature, and
    // being told that a real variant is not a thing anybody can do, or that it
    // is asleep, would be a lie about a group that simply has not bought its egg.
    //
    // It also has to be here rather than nowhere. Without it a message reaching
    // this far writes an action row for a group with no seed, and that row is in
    // the log for the rest of the animal's life: the creature is the ordered log,
    // so the group's first act would be one taken before they chose the animal.
    if (this.metaValue('seed') === null) {
      this.tell(ws, {
        type: 'error',
        message: 'There is nothing here yet. The group has to buy its egg first.',
      })
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
    // A manner has to belong to the thing it describes. Nobody fed a creature
    // firmly, and a row saying so would be replayed forever by every client,
    // each composing a push out of a pairing the catalogue does not contain.
    if (methodId !== undefined && !methodFits(variantId, methodId)) {
      this.tell(ws, { type: 'error', message: 'That is not a way of doing that.' })
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
      .exec<Recent>(
        'SELECT n, at, variantId FROM actions ORDER BY n DESC LIMIT ?',
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

    // Whether it is awake, and it sits HERE rather than anywhere else in this
    // sequence, for three reasons that all point at the same place.
    //
    // Below the two checks above it that say the message is nonsense, because
    // "it is asleep" is a lie told to somebody who sent a variant that does not
    // exist or a manner that does not belong to one. Below the lifetime cap,
    // because the cap is permanent and sleep is not, and a group whose
    // creature's life is complete must not be sent away to come back in three
    // hours to the same closed door.
    //
    // ABOVE every brake below it, and that is the part a person actually feels.
    // Sleep and the ten second cooldown are true at the same time constantly,
    // and whichever answers first is the only reason anybody is ever given.
    // "Give it a moment" sends somebody back in ten seconds, and in ten seconds,
    // and in ten seconds, for four hours, with the real answer never once on
    // screen. Above the stage gate for the same reason and one more: the stage
    // gate can cost a read of the whole log, and this is arithmetic over two
    // meta rows and the rows already in hand.
    const sleep = this.sleepNow(now, recent)
    // The catalogue decides what may be done to a sleeping animal, and it is
    // asked BY NAME. This app has already shipped a refusal that was never
    // wired up at all, with two tests green the whole time because a different
    // rule turned the same message away first, and a negative test goes green
    // the moment anything refuses. So the rule doing the refusing here has a
    // name a test can point at, and there is no second list of what may be done
    // while it is down.
    const whileAsleep = allowedWhileAsleep(variantId)
    if (sleep.asleep && !whileAsleep) {
      // Not an `error`, because nobody made a mistake and the app wants to draw
      // something else entirely. `since` and `until` are the stretch it is in,
      // and `now` is THIS clock: a phone four minutes fast would otherwise count
      // down to a moment that has already been and gone.
      this.tell(ws, { type: 'asleep', since: sleep.since, until: sleep.until, now })
      return
    }
    if (!sleep.asleep && whileAsleep) {
      // The other half of the same gate, and it is the half the tray already
      // enforces: availableVariants hands out disjoint sets, so waking it is
      // simply not on screen while it is up. A client is not the only thing
      // that can send a message, though, and this one carries a push, so
      // without this line waking an awake creature is a button nobody can see
      // that costs nothing and moves three axes. It is also how a group would
      // bank a rouse: wake it in the last minute of the evening and the first
      // half hour of the night is already spent.
      this.tell(ws, { type: 'error', message: 'It is already awake.' })
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
      ...(methodId === undefined ? {} : { methodId }),
      actorId: seat.actorId,
      actorName: seat.actorName,
      at,
      growth: grown,
    }
    // Written before it is told, always. An action that was announced and then
    // failed to save would leave everybody looking at a creature that nobody
    // arriving later would ever see.
    this.ctx.storage.sql.exec(
      'INSERT INTO actions(id, variantId, methodId, actorId, actorName, at, growth) VALUES(?, ?, ?, ?, ?, ?, ?)',
      action.id,
      action.variantId,
      action.methodId ?? null,
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
    // The creature's name, and there is no creature until the egg is bought. A
    // name stored now would be a name for whichever of the three they end up
    // with, chosen before they had.
    if (this.metaValue('seed') === null) {
      this.tell(ws, { type: 'error', message: 'There is nothing to name yet.' })
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

  // -- the market ------------------------------------------------------------

  /**
   * Coins behind an egg, which is also a vote for it.
   *
   * WHO THIS IS COMES FROM THE SEAT and never from the message, exactly as it
   * does for an action. Every question after that is checkPledge's, which the
   * app calls with the same arguments before it offers the button, so a refusal
   * arriving here is a race rather than a surprise. Nothing in this method
   * decides a price, a purse or a leader; it decides only what gets written.
   *
   * A PLEDGE SETS A FIGURE, it does not add one, so zero is a real message and
   * is how somebody takes their coins back off an egg. That makes this the only
   * thing a slider ever has to send, at any position, which is the whole reason
   * the two-message version is gone.
   *
   * NOT ASYNC, and that is load bearing rather than incidental. See resolve().
   */
  private pledge(ws: WebSocket, egg: number, coins: number): void {
    const seat = this.seatOf(ws)
    // A named reason rather than "say hello first", because the app does
    // something different with each one and this is the one it can act on: a
    // socket that has not said who it is has not claimed a place either, so what
    // that person needs on screen is the claim panel. It is also the same answer
    // a guest who HAS said hello gets from checkPledge below, which is right:
    // both of them are people without a passcode, and the coins do not exist for
    // either.
    if (seat === null || seat.actorId === null) {
      this.tell(ws, { type: 'refused', reason: 'unclaimed' })
      return
    }
    const market = this.marketNow()
    if (market === null) {
      this.tell(ws, { type: 'refused', reason: 'closed' })
      return
    }
    const refusal = checkPledge(market, seat.actorId, egg, coins)
    if (refusal !== null) {
      this.tell(ws, { type: 'refused', reason: refusal })
      return
    }

    const pledge: Pledge = {
      actorId: seat.actorId,
      actorName: seat.actorName,
      egg,
      coins,
      at: Date.now(),
    }
    // Written before anybody is told, for the reason an action is: a pledge that
    // was announced and then failed to save would leave the group counting money
    // that is not there, and the number they are counting decides which animal
    // they get.
    //
    // ONE ROW PER PERSON PER EGG, SET rather than added to. This was an INSERT
    // every time, so lowering a pledge took two messages, a withdrawal and then
    // a smaller pledge, and between them the market sat in a state nobody asked
    // for: the withdrawal alone could push a different egg into the lead AND
    // fund it, so dragging a slider down bought the group a creature nobody
    // chose. That purchase cannot be undone, which makes it the worst thing this
    // screen can do, and the fix is that the intermediate state no longer exists
    // rather than that something guards it.
    //
    // `at` is deliberately not in the update. An adjusted row keeps the moment
    // this person first backed this egg, and therefore its place in the list,
    // exactly as withPledge does: the order is the record of how the group got
    // here and somebody changing their mind has not just arrived. The name is
    // updated, because somebody who renamed themselves mid-market should not
    // spend the rest of it under the old one.
    this.ctx.storage.sql.exec(
      'INSERT INTO pledges(actorId, actorName, egg, coins, at) VALUES(?, ?, ?, ?, ?)' +
        ' ON CONFLICT(actorId, egg) DO UPDATE SET coins = excluded.coins,' +
        ' actorName = excluded.actorName',
      pledge.actorId,
      pledge.actorName,
      pledge.egg,
      pledge.coins,
      pledge.at,
    )

    // Asked of the state this row produces rather than of the table it was just
    // written to. The two are the same list, and this way the decision and the
    // thing everybody is shown are made from exactly the value the checks above
    // were made against.
    const next = withPledge(market, pledge)
    const bought = resolutionOf(next)
    if (bought !== null) {
      this.resolve(bought)
      return
    }
    this.tellMarket(next, { kind: 'pledged', actorName: pledge.actorName, egg, coins })
  }

  /**
   * Taking back everything one person has on one egg.
   *
   * Not in the locked design, and it is here because without it a group can
   * strand itself for good: coins come only from claiming, so two people who put
   * a hundred each on two different eggs and reach neither price have no money
   * left, no way to move it and no creature, ever. A vote you cannot change is
   * not a vote.
   *
   * A WITHDRAWAL CAN BUY THE EGG, which is the part worth stating out loud. An
   * egg can be fully funded and still not be in front, because the group wants a
   * dearer one more; take the coins off the dearer one and the funded egg leads
   * and is bought on the spot. So this asks the same question a pledge does, in
   * the same words, and hands it to the same resolve().
   *
   * KEPT, THOUGH A PLEDGE OF ZERO NOW SAYS THE SAME THING, and the reason is
   * what is already installed on people's phones. This app is live, a message
   * this server stopped understanding is a message dropped in silence, and the
   * one it would be dropping is somebody trying to get their coins back off an
   * egg. A client keeps working until it is next loaded, and there is no version
   * of the wire that makes that safe to guess at. It also still answers a
   * question a zero pledge does not: 'nothing-pledged' tells somebody the coins
   * they were reaching for are not there, where a zero pledge onto an empty egg
   * is a perfectly good instruction to leave it empty.
   *
   * What it leaves behind differs by one row and by nothing else: this removes
   * the row, a zero pledge sets it to zero, and every total, purse, leader and
   * resolution in src/market/rules.ts reads the two identically. The market
   * screen skips a backer holding nothing, so neither is on anybody's screen.
   */
  private withdraw(ws: WebSocket, egg: number): void {
    const seat = this.seatOf(ws)
    if (seat === null || seat.actorId === null) {
      this.tell(ws, { type: 'refused', reason: 'unclaimed' })
      return
    }
    const market = this.marketNow()
    if (market === null) {
      this.tell(ws, { type: 'refused', reason: 'closed' })
      return
    }
    const refusal = checkWithdrawal(market, seat.actorId, egg)
    if (refusal !== null) {
      this.tell(ws, { type: 'refused', reason: refusal })
      return
    }

    // Read before the rows go, so the group can be told what came off the table.
    const back = pledgedBy(market, seat.actorId)[egg]
    this.ctx.storage.sql.exec(
      'DELETE FROM pledges WHERE actorId = ? AND egg = ?',
      seat.actorId,
      egg,
    )
    const next = withWithdrawal(market, seat.actorId, egg)
    const bought = resolutionOf(next)
    if (bought !== null) {
      this.resolve(bought)
      return
    }
    this.tellMarket(next, { kind: 'withdrew', actorName: seat.actorName, egg, coins: back })
  }

  /**
   * The group buys the egg in front, once, forever.
   *
   * HOW THIS HAPPENS EXACTLY ONCE. A Durable Object handles one event at a time,
   * and a handler that never awaits runs to completion before the runtime
   * delivers the next message to this object. pledge(), withdraw() and this are
   * synchronous from end to end: no await stands between reading the pledges,
   * deciding that the price is met, and writing the seed. So two people sending
   * the closing coins in the same millisecond are two messages in a queue, the
   * first sets the seed, and the second finds marketNow() answering null and is
   * refused as closed. There is no window between the read and the write for
   * anything to happen in, because a window is a thing only an await can open.
   *
   * The guard on the first line is the belt to that braces. It is what would
   * catch a future edit that put an await into either caller, and it costs one
   * point query at the one moment in a group's life this runs.
   *
   * THE SEED IS THE CANDIDATE, UNCHANGED. Not re-rolled, not derived, not
   * anything: the egg on the screen was drawn from this exact string by the same
   * call the renderer makes, so buying the pale green egg has to produce the pale
   * green creature or the whole screen was a lie.
   */
  private resolve(bought: Resolution): void {
    if (this.metaValue('seed') !== null) return
    const at = Date.now()
    // Everything on the eggs that lost goes back to whoever put it there. The
    // rows are deleted rather than kept, because a purse is a hundred minus what
    // that person has on the table and the coins are no longer on the table; a
    // row left behind would be storage saying money was spent that was not. What
    // stays is what the group actually paid for their animal.
    this.ctx.storage.sql.exec('DELETE FROM pledges WHERE egg <> ?', bought.egg)
    this.setMeta('seed', bought.seed)
    this.setMeta('hatchSpeed', String(bought.hatchSpeed))
    // Growth starts HERE and not when the group formed. Growth is a stored base
    // plus the hours since it was stored, and with no base the hours are counted
    // from the birthday, so a group that spent two days choosing would have
    // bought an egg that hatched on the way home. What they bought is a wait, and
    // the wait starts when they buy it.
    this.setMeta('growth', '0')
    this.setMeta('grownAt', String(at))
    // And so does the day the creature keeps, for the same reason and in the
    // same breath. Re-anchoring growth here while the sleep schedule went on
    // reading `createdAt` meant a group made at nine in the morning that argued
    // until six in the evening was handed a creature nine hours into a timetable
    // it had never once been awake for, so it could arrive asleep. src/dna/sleep
    // .ts is built the other way round on purpose: phase zero is inside a waking
    // stretch, measured across four hundred seeds with none asleep at birth,
    // because a group that meets a sleeping animal has no way to tell that from
    // a broken app. One instant for both, written here, so the two cannot come
    // apart again.
    this.setMeta('bornAt', String(at))

    const snapshot = this.readSnapshot()
    if (snapshot === null) return
    // The whole group travels with it, so a client crosses from the market to
    // the creature on one message rather than on a message plus a fetch, and
    // `spent` travels because what a group paid is the first thing they will ask
    // each other and the market it was decided in is gone by then.
    this.broadcast({ type: 'bought', egg: bought.egg, spent: bought.spent, snapshot })
  }

  /**
   * The market as it stands, or null if there is not one.
   *
   * THE SEED IS WHAT CLOSES THE MARKET, and that line is the only thing standing
   * between a group and a different animal than the one they bought. It cannot
   * be left to the shared rules to notice, because "is this bought" is answered
   * there by comparing the money on the leading egg against its price, and the
   * price moves: somebody claiming a place after the purchase raises all three,
   * the winning egg's total drops below its new price, and a market that has been
   * resolved for a week reads as open again. A pledge accepted then could reach
   * another egg's price and overwrite a seed that a live creature is derived
   * from. The stored seed is the only fact about this that does not move.
   */
  private marketNow(): MarketState | null {
    if (!this.exists()) return null
    if (this.metaValue('seed') !== null) return null
    const candidates = this.candidates()
    if (candidates === null) return null
    return { candidates, claimed: this.claimedCount(), pledges: this.pledgeRows() }
  }

  /**
   * The three eggs on offer, or null if this group has none.
   *
   * Written out as three rather than collected in the loop, because the contract
   * says three and a tuple is how the compiler is told to count them. Change
   * EGG_COUNT and this is a compile error, which is the right kind of failure:
   * the alternative is a fourth egg that exists in the price table and never
   * reaches a screen.
   */
  private candidates(): [string, string, string] | null {
    const seeds: string[] = []
    for (let egg = 0; egg < EGG_COUNT; egg++) {
      const seed = this.metaValue(eggKey(egg))
      if (seed === null) return null
      seeds.push(seed)
    }
    return [seeds[0], seeds[1], seeds[2]]
  }

  /**
   * How many people hold a passcode here. The price input, and the reason a
   * group of eight is not looking at a group of two's prices.
   *
   * Kept in `meta` and added to at the one place a place is claimed, like the
   * actor count and for the same reason. A group that predates the counter is
   * counted off its own code rows instead, and the answer is deliberately NOT
   * written down when it is: this is on the read path, every market screen asks
   * it, and a read that writes is what turns a group nobody is looking at into a
   * bill. The count is exact either way.
   */
  private claimedCount(): number {
    const stored = this.metaValue('claimed')
    if (stored !== null) {
      const held = Number(stored)
      return Number.isFinite(held) && held > 0 ? Math.floor(held) : 0
    }
    return this.ctx.storage.sql
      .exec<{ claimed: number }>("SELECT COUNT(*) AS claimed FROM meta WHERE k LIKE 'code:%'")
      .one().claimed
  }

  /** Every pledge, in the order they arrived. The order is not decoration: it is
   *  the only record of how the group got where it is, and a market screen that
   *  can say who moved first is worth more than a shorter list. */
  private pledgeRows(): Pledge[] {
    return this.ctx.storage.sql
      .exec<{ actorId: string; actorName: string; egg: number; coins: number; at: number }>(
        'SELECT actorId, actorName, egg, coins, at FROM pledges ORDER BY n',
      )
      .toArray()
  }

  private marketSnapshot(market: MarketState): MarketSnapshot {
    return {
      groupId: this.metaValue('groupId') ?? '',
      // The GROUP's birthday, and it stays that here rather than following
      // readSnapshot's: there is no creature yet, so there is no schedule for
      // this to be phase zero of and nothing that reads it as one.
      createdAt: Number(this.metaValue('createdAt') ?? '0'),
      handle: this.metaValue('handle'),
      market,
    }
  }

  /**
   * Everybody looking gets the whole market, every time it moves.
   *
   * The whole state rather than what changed, because it is three seeds and a
   * short list, the group is minutes old, and a client that has to replay a
   * stream of increments to know what is on the table is a client that can be
   * wrong about the thing the group is deciding.
   */
  private tellMarket(market: MarketState, note: MarketNote | null): void {
    this.broadcast({
      type: 'market',
      snapshot: this.marketSnapshot(market),
      present: this.present(null),
      note,
    })
  }

  // -- reading and writing ---------------------------------------------------

  /**
   * When THIS CREATURE began, as it sits in storage, or null if neither row is
   * there.
   *
   * The one answer to "what is phase zero", asked by the schedule the server
   * enforces and by the figure the snapshot carries to the app, because those
   * two disagreeing is the defect this whole area has already shipped once.
   *
   * `bornAt` is written by resolve() and is the moment the group bought its egg.
   * A GROUP THAT NEVER HAD A MARKET FALLS THROUGH TO createdAt, and that
   * fallback is the whole of the grandfathering rather than a default: every
   * group made before eggs existed has a seed, no `bornAt` and a creature that
   * began the day the group did, so this hands back exactly the row it always
   * did and not one of their animals moves by a minute.
   *
   * A string and not a number, so a caller can tell a missing row from a real
   * instant. sleepNow wants NaN for missing, readSnapshot wants zero, and the
   * two want different things for a good reason each.
   */
  private bornAt(): string | null {
    return this.metaValue('bornAt') ?? this.metaValue('createdAt')
  }

  /**
   * The genome, WRITTEN DOWN the first time it is asked for and never rolled
   * again.
   *
   * This closes the worst latent defect in the app, and it is worth stating
   * plainly because nothing about it is visible from the call site it replaces.
   * A genome was never stored: `rollGenome(seed)` ran on every single read, so
   * the creature a group is raising was recomputed by whatever code happened to
   * be deployed at the moment somebody opened the app.
   *
   * That made SEVERAL FILES production state rather than source. `HABIT_SHAPES`
   * in alleles.ts is summed off ACTION_VARIANTS so that a genome has to answer
   * to the habits a group can actually fall into, which is a good design and
   * exactly what makes it dangerous: adding one ordinary action variant, which
   * feels like pure content work, re-dealt the alleles of creatures that
   * already existed. Measured at 23 in 500, one group in twenty, with the whole
   * suite green. The comment above that code asserted the opposite for months.
   *
   * Frozen, the catalogue can grow to any size without a single existing
   * creature changing, which is the only reason the action tree can be built
   * out at all.
   *
   * LAZY, on read, rather than at create(). Groups that predate this have no
   * stored genome and there is no migration hook that runs for all of them, so
   * the first read is the only moment that reliably happens for every group.
   * What it stores is exactly what that group already derives today, so nobody
   * sees anything change.
   *
   * THE SEQUENCING IS THE WHOLE THING and it does not survive being ignored:
   * this must be DEPLOYED, and every live group READ ONCE, before any catalogue
   * change ships. A group first read after new items land would be frozen
   * against the new catalogue and re-dealt in the same breath as being
   * protected from it.
   */
  private genome(seed: string): Genome {
    const held = this.metaValue('genome')
    if (held !== null) {
      try {
        return JSON.parse(held) as Genome
      } catch {
        // Unreadable rather than absent. Falling through re-rolls and rewrites
        // it, which is the same answer this group got before it was ever
        // frozen, and is strictly better than serving a broken creature.
      }
    }
    const rolled = rollGenome(seed)
    this.setMeta('genome', JSON.stringify(rolled))
    return rolled
  }

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

  // -- who somebody is -------------------------------------------------------

  /**
   * Mint a place in this group, and answer with the code once.
   *
   * Only the hash is kept, so this is the only moment the code exists anywhere
   * but the browser that asked. There is no second chance to read it and no
   * path in this file that could produce one, which is the property that makes
   * the code worth anything at all.
   *
   * THIS IS ALSO WHERE MONEY COMES FROM. A claimed member has a purse, an
   * unclaimed one has nothing, and there is no other source of coins in this
   * unit: no ledger is written, because a purse is the starting hundred minus
   * what that person has on the table, worked out from the pledge list every
   * time it is asked.
   */
  private async claim(ws: WebSocket): Promise<void> {
    const seat = this.seatOf(ws)
    if (seat === null || seat.actorId === null) {
      this.tell(ws, { type: 'error', message: 'Say who you are before claiming a place.' })
      return
    }
    if (isClaimedMember(seat.actorId)) {
      this.tell(ws, { type: 'error', message: 'You already have a place here.' })
      return
    }
    if (!this.exists()) return

    // MINTED AND HASHED BEFORE ANY GUARD IS READ, and that ordering is the fix
    // for a real race rather than a tidy-up.
    //
    // The await used to sit between the two bounds below and the writes that
    // enforce them. Every storage call here is synchronous, so a turn with no
    // await in it runs to completion before another message is delivered, but
    // an await gives the turn up: two claim messages arriving in one batch both
    // read the place row as absent and both read the count as under the cap,
    // then both write. One device minted two purses, and a group could push
    // past MAX_CLAIMED, and the market's whole price floor rests on that count.
    //
    // Neither of these depends on anything the guards read, so hoisting them
    // costs nothing: the code is random and the hash is over the group id,
    // which cannot change. What is left below is guard, guard, write, write,
    // write, with no suspension point anywhere in it.
    const code = mintPasscode()
    const owner = verifiedActorId(`c${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`)
    const held = `code:${await hashPasscode(this.groupId(), code)}`

    // A SECOND CLAIM FROM THE SAME BROWSER IS NOT A SECOND MEMBER. The count is
    // added to every time this method gets past here and nothing anywhere takes
    // one away, so somebody who tapped the button twice raised the price of the
    // two eggs that scale for the rest of the group's life, and the hundred coins
    // behind the first place became unreachable in the same moment: only the
    // hash of a code is kept, so a place whose code was never used again cannot
    // be got back into and cannot be spent. The group is then permanently poorer
    // and permanently dearer with nothing on screen saying why.
    //
    // Refused rather than answered with the old place, and that is deliberate.
    // Handing this connection the place back would mean handing it a fresh code,
    // and the id it is asking under is a string the client chose that everybody
    // in the group can already see in the `present` list, so anybody could take
    // anybody's coins by typing their name. There is no code to re-read either:
    // it existed once, in the browser that asked.
    if (this.metaValue(placeKey(seat.actorId)) !== null) {
      this.tell(ws, {
        type: 'error',
        message:
          'A place here was already claimed on this device.' +
          ' Enter the code it was given to use it.',
      })
      return
    }
    if (this.claimedCount() >= MAX_CLAIMED) {
      this.tell(ws, {
        type: 'error',
        message: 'This group already has as many people in it as it can hold.',
      })
      return
    }

    // Counted BEFORE the code row goes in, and that order is the whole of the
    // correctness. A group that predates the counter has its members counted off
    // those very rows, so writing the row first and then adding one to the answer
    // counts this person twice: every price in the group jumps by two members'
    // worth on the first claim, and the eggs a group of two was shown are the
    // eggs a group of four pays for. Caught by the market suite on the day it was
    // written, which is the only reason it is not in production.
    this.setMeta('claimed', String(this.claimedCount() + 1))
    this.setMeta(held, owner)
    // Written in the same turn as the count it is guarding, so there is no state
    // in which one exists without the other.
    this.setMeta(placeKey(seat.actorId), owner)

    // Known limit, written down rather than hidden: anything this person did
    // BEFORE claiming stays in the log under their guest id, so they can appear
    // twice in the bond list until they claim. Rewriting the log to point at
    // the new id is the obvious fix and it is worse, because the log is the
    // creature and editing it after the fact to settle an identity question is
    // how a creature quietly becomes a different creature. The honest answer is
    // to ask people to claim their place before they start, which is what the
    // panel will do.

    // THE LIMIT THAT CANNOT BE CLOSED HERE, in the place somebody would come
    // looking for it. The check above is against the seat that asked, and a
    // seat is one socket: one human with the app open in two tabs, or on a phone
    // and a laptop, arrives as two ids, claims twice and holds two purses. There
    // is no accounts system and there cannot be one, because the link IS the
    // access control and that is the whole shape of the app.
    //
    // So the price floor in src/market/rules.ts holds against one MEMBER and not
    // against one person, and no comment anywhere may say otherwise. What stands
    // in for the check that cannot exist is the screen: the market carries every
    // pledge under the name that made it, so somebody funding an egg out of two
    // purses is doing it in front of their friends rather than behind
    // arithmetic. A group seeing who backed what is the real bound here.

    ws.serializeAttachment({ sid: seat.sid, actorId: owner, actorName: seat.actorName })
    this.tell(ws, { type: 'claimed', actorId: owner, code })
    this.broadcast({ type: 'present', present: this.present(null) })

    // Everybody at the market has to be told, because a new member is a hundred
    // more coins in the group and a higher price on the two eggs that scale.
    // Somebody watching "twelve short" become "sixty-seven short" without being
    // told why would be watching the screen lie about what they can afford.
    //
    // A claim cannot buy an egg, and the reason is that it puts no coins on one
    // and lowers no price, NOT that it makes everything dearer. It used to be
    // the second of those and is not any more: the plain egg is flat at 75, so a
    // friend arriving leaves it costing exactly what it cost. That is why
    // nothing here asks whether the market has resolved.
    const market = this.marketNow()
    if (market !== null) this.tellMarket(market, null)
  }

  /** Which member a code belongs to, or null. Reads and never writes, so
   *  guessing at codes cannot make this app create storage. */
  private async whoHolds(raw: string): Promise<string | null> {
    const code = cleanPasscode(raw)
    if (code === null) return null
    if (!this.exists()) return null
    // Looked up BY the hash rather than compared against one, so there is no
    // secret comparison here to be timed. An earlier version of this line ran a
    // constant-time compare of a value against itself, which did nothing except
    // look reassuring, and reassuring-looking security code is worse than none.
    return this.metaValue(`code:${await hashPasscode(this.groupId(), code)}`)
  }

  private groupId(): string {
    return this.metaValue('groupId') ?? ''
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
  /**
   * How fast this group's egg hatches, as the multiplier they paid for.
   *
   * Stored at the moment the market resolved and never afterwards. A group made
   * before markets existed has no row here and reads as 1, which is the middle
   * egg's speed and is exactly the tuning the app already had: hatchAdjusted(x,
   * 1) is x on both of its branches, so no creature that already exists moves by
   * a single growth point. That is the whole of the grandfathering, and it is
   * the reason the middle egg is 1 rather than some tidier number.
   *
   * Anything unreadable means "as it was" and never "faster", because the one
   * thing a mangled row must not be able to do is age somebody's animal.
   */
  private hatchSpeed(): number {
    const raw = Number(this.metaValue('hatchSpeed') ?? String(GRANDFATHERED_HATCH_SPEED))
    return Number.isFinite(raw) && raw > 0 ? raw : GRANDFATHERED_HATCH_SPEED
  }

  /**
   * Growth as everybody outside this object sees it: the plain figure with the
   * egg this group bought taken into account.
   *
   * THE ADJUSTMENT IS APPLIED ON THE WAY OUT AND NEVER STORED. hatchAdjusted is
   * not idempotent, so folding its answer back into `meta.growth` would re-age
   * the creature on every read, faster and faster, and the log is the animal.
   * Everything written down here stays in plain units and this is the one door
   * they leave by.
   *
   * Both figures that leave go through it: the snapshot's `growth` and the total
   * stamped onto each action row. Those two are compared against the same stage
   * table by deriveCreature, and mixing units would be worse than useless: a slow
   * egg's rows would carry a bigger number than the snapshot, deriveCreature
   * takes the larger of the two, and the longer wait a group paid less for would
   * be erased by the first thing anybody did.
   */
  private grown(at: number): number {
    return hatchAdjusted(this.growthNow(at), this.hatchSpeed())
  }

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
    const done = Number(this.metaValue('sinceStage') ?? '0')
    const worth = ACTION_WORTH * (ACTION_FLOOR + (1 - ACTION_FLOOR) / (1 + done / ACTION_HALF))
    const next = now + worth

    this.setMeta('growth', String(next))
    this.setMeta('grownAt', String(at))
    // The stage question is asked of the ADJUSTED figures, because the stage is
    // the one everybody can see. A group on the slow egg crosses out of the egg
    // stage later than the plain number does, and a run of actions that reset
    // itself at the plain boundary would hand that group a stage's worth of
    // full-price actions while their creature was still in the one before it.
    const grown = hatchAdjusted(next, this.hatchSpeed())
    const stage = stageOfGrowth(hatchAdjusted(now, this.hatchSpeed()))
    // Reset the run when the stage changes, so every stage starts with actions
    // at full value rather than inheriting the last one's exhaustion.
    this.setMeta('sinceStage', stageOfGrowth(grown) === stage ? String(done + 1) : '0')
    // The row carries what a client will compare against the snapshot, so it
    // leaves by the same door. See grown().
    return grown
  }

  /**
   * The group, either way it can be: a creature, or a market with three eggs in
   * it. The one door, so that "which of the two is this" is asked in one place
   * and answered by the stored seed.
   *
   * A group with a seed has no market and cannot have one, and that is the whole
   * of the grandfathering: every group made before this feature existed has a
   * seed, so every one of them takes the first branch on the first line and
   * nothing below the market ever runs for them. No migration of anybody's
   * history, no reset, and no group that has been raising a creature for months
   * being asked to buy an egg it already has.
   */
  private readView(): GroupView | null {
    if (!this.exists()) return null
    if (this.metaValue('seed') !== null) return this.readSnapshot()
    const market = this.marketNow()
    return market === null ? null : this.marketSnapshot(market)
  }

  /**
   * The group as everybody sees it. The genome is rolled from the seed on every
   * read rather than stored, which is the point: there is one copy of the
   * genetics, it lives in src/dna, and the server holding a stale copy of a
   * creature's potential is a bug that cannot happen because there is no copy
   * to go stale.
   *
   * Null while the group is still at the market, which is not the same as "no
   * such group" and is why readView() exists above it. Every caller left here is
   * one that genuinely needs a creature: acting on it, naming it, working out
   * its stage, telling everybody it has just been bought.
   */
  private readSnapshot(): GroupSnapshot | null {
    if (!this.exists()) return null
    const seed = this.metaValue('seed')
    if (seed === null) return null
    return {
      groupId: this.metaValue('groupId') ?? '',
      // THE CREATURE'S BEGINNING, which for a group that bought an egg is the
      // moment they bought it and not the moment they formed. It leaves under
      // the name the contract already has because this field has exactly one
      // consumer: src/ui/useGroup.ts reads it into a local called `bornAt` and
      // hands it to sleepStateOf, which is the same call sleepNow makes below.
      // Sending the group's birthday here while the server measured the night
      // from the purchase would be two answers to one question, which is the
      // thing putting the schedule in a shared file exists to prevent.
      createdAt: Number(this.bornAt() ?? '0'),
      name: this.metaValue('name'),
      handle: this.metaValue('handle'),
      growth: this.grown(Date.now()),
      pace: this.pace(),
      genome: this.genome(seed),
      actions: this.ctx.storage.sql
        .exec<{
          id: string
          variantId: string
          methodId: string | null
          actorId: string
          actorName: string
          at: number
          growth: number
        }>('SELECT id, variantId, methodId, actorId, actorName, at, growth FROM actions ORDER BY n')
        .toArray()
        // SQL says null, the contract says absent. Left as null it would reach
        // methodFits as a value and read as a manner nobody chose.
        .map(({ methodId, ...rest }) => (methodId === null ? rest : { ...rest, methodId })),
    }
  }

  // -- sleep -----------------------------------------------------------------

  /**
   * Whether the creature is down at this instant, as this server will act on it.
   *
   * Two things folded together. Underneath is the schedule, which is sleep.ts,
   * which the app runs too off the same seed and the same birthday: neither
   * side can invent a different night, and that is the reason the server is
   * allowed to be the one that decides. On top of it sits the rouse: somebody
   * woke it, so it is up for a while whatever the timetable says.
   *
   * THE ROUSE IS READ BACK OUT OF THE LOG. It is not stored, not cached and not
   * held in a field, and that is the whole of the design here. This object
   * hibernates between one action and the next, so a woken creature kept in an
   * instance variable is a creature that goes straight back to sleep the moment
   * nobody is looking at it, which is exactly the moment before a group with
   * the app shut opens it again. The waking is already a row: it went through
   * the same pipeline as everything else, it is in the log forever, the log is
   * the most durable thing this app has, and every client is sent all of it on
   * connect. So there is nothing here to persist, and therefore nothing to
   * migrate, and therefore no way for this to be the column that 500s every
   * group that predates it.
   */
  private sleepNow(now: number, recent: Recent[]): SleepState {
    const seed = this.metaValue('seed')
    // A group with no seed has no schedule, and the answer to not knowing has
    // to be awake every time: this is the only check in `act` that refuses
    // outright for hours, so a row that cannot be read must never be able to
    // shut a group out of their own animal. Nothing reaches this in practice,
    // because a socket is only handed out for a group that read back a snapshot.
    if (seed === null) return { asleep: false, since: now, until: now }

    // WHEN THE CREATURE BEGAN, which is when its group bought the egg, and not
    // when the group was made. Those were the same row until resolve() started
    // re-anchoring growth to the purchase and left this one behind, and the gap
    // between them is however long the group spent arguing: nine hours of that
    // is nine hours of a timetable the creature was never awake for, which is
    // how one could be born asleep. bornAt() is the single answer, and the
    // snapshot the app works from carries the same instant.
    //
    // Handed over as NaN when the row is missing, rather than as the zero that
    // readSnapshot uses. Zero is a real instant, and a creature born in 1970 is
    // fifty years into a schedule and asleep two evenings in five of them.
    // NaN is the value sleep.ts already has a written answer for, and its
    // answer is awake, decided in the one file both sides share.
    const born = this.bornAt()
    // The rouse goes in as an argument rather than being applied here, and that
    // is a correction rather than a refactor. It used to be folded on after the
    // call, in this file only, so the app had no idea a waking lasted half an
    // hour: for that half hour the server would take any ordinary action while
    // every screen still drew a sleeping animal and offered the single button
    // the server now refused. Two answers to one question, which is precisely
    // what putting the schedule in a shared file was meant to prevent. There is
    // one function now, and it is not possible to call it without saying when
    // the creature was last woken.
    return sleepState(
      // rollActivity and not rollGenome: the same answer by construction, since
      // rollGenome takes the pattern from this very function, at a fraction of
      // the cost. This runs on every action, and a whole genome roll draws an
      // allele at every locus to reach one field.
      rollActivity(seed),
      seed,
      born === null ? Number.NaN : Number(born),
      now,
      lastRouseAt(recent, now, allowedWhileAsleep),
    )
  }

  // Reading the last waking back out of the log used to live here. It moved to
  // lastRouseAt in src/dna/sleep.ts, and the move is the fix rather than a
  // tidy: the app could not see this method, so it did not know a waking lasted
  // half an hour, and for that half hour it drew a sleeping animal the server
  // would have let anybody feed.
  //
  // What the move does NOT change is why the answer here is exact rather than a
  // sample, and that argument is still load bearing. It is answered out of
  // `recent`, which `act` has already read, and three numbers tie together to
  // make that complete: the read is the last GROUP_ACTS_PER_HOUR rows, the
  // group's hourly cap refuses the row after that many inside one hour, and
  // ROUSE_MS is under an hour. A row inside the waking window that was not
  // among the ones read would mean more rows in an hour than the cap allows.
  // Raise ROUSE_MS past an hour, or shorten this read, and wakings a group paid
  // an action for start being missed. test/worker/sleep.test.ts holds that
  // relationship down, because nothing else would go red.

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
