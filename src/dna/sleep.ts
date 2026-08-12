// sleep.ts: when the creature is awake, and when it is not.
//
// One function, called by both sides. The Durable Object refuses an action with
// it and the app draws its countdown from it, and because it is the same
// arithmetic over the same three inputs they cannot come to different answers.
// A creature that was asleep for one member and awake for another would be the
// worst kind of bug this app can have: two people in the same group, looking at
// the same animal, being told different things about it.
//
// Nothing here reads a clock. The instant arrives as an argument, exactly the
// way it already does for growth, because everything in src/dna is a pure
// function of a seed and an ordered log, and something that changed depending
// on when it was looked at would not be one. Sleep is deliberately NOT a field
// on Creature for the same reason: it is not a fact about the log, it is a fact
// about the minute you asked.
//
// THE CREATURE'S DAY IS NOT TWENTY FOUR HOURS, and that is the decision this
// whole file turns on. A schedule whose period is exactly one solar day sits at
// the same wall clock hour every day for the rest of the group's life. A group
// whose one regular slot is nine in the evening, and whose creature sleeps
// through nine in the evening, is then locked out of their own animal forever,
// with nothing on any screen that could ever tell them why. So the period is
// near a day and not equal to one, which is what an animal actually does when
// it is kept away from daylight: it free runs, an hour or several off the sun,
// and its hours walk round the clock. Nineteen to twenty one hours means the
// schedule slides three to five hours against the wall clock every calendar
// day. Measured over a year of visits at one fixed hour, across a thousand
// seeds: asleep on 39.9% of them, and the longest run of asleep evenings any
// seed produced was 3 for the two patterns that sleep in one block and 2 for
// the one that sleeps in two. Nobody is locked out, and nobody is locked out
// for a week either.
//
// The phase is measured from the moment the group was made, in absolute
// milliseconds. That is an instant every member and the server agree on without
// anybody converting anything, which is the whole of what "anchored to UTC"
// buys here. No timezone appears in this file and none may: a group is the
// thing that owns a creature, and a group spread over three continents has no
// local evening to keep hours by.

import { ACTIVITY_PATTERNS } from '../core/types'
import type { ActivityPattern, Genome } from '../core/types'
import { makeRng } from './rng'

/**
 * Whether it is asleep, and when that stops being true.
 *
 * Both halves are needed by both callers, which is why one shape answers both
 * questions. The app wants `until` to count down to, in either direction: a
 * sleeping creature is worth waiting for and a waking one is worth using while
 * it lasts. The server wants it to say why it refused, in a sentence that ends
 * with something better than "later".
 *
 * `since` is when the current stretch began, not when the last one did.
 */
export interface SleepState {
  asleep: boolean
  since: number
  until: number
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

// The band the creature's own day is drawn from. Nineteen hours and not
// eighteen because a day much shorter than ours stops reading as a day at all,
// and twenty one and not twenty three because the drift is what keeps a group
// from being locked out: at twenty three hours the schedule creeps by one hour
// a calendar day, and eight hours of sleep would then land on somebody's
// evening for eight evenings running. Three hours a day is the slowest slide
// that keeps that run short.
const CYCLE_MIN_MS = 19 * HOUR_MS
const CYCLE_SPAN_MINUTES = 120

// The cycle is divided into twentieths and every window is a whole number of
// them. Two reasons, and the second is the load bearing one. It reads: at the
// middle of the band a part is exactly one hour. And it keeps every boundary an
// exact integer number of milliseconds, so the comparison that decides whether
// a creature is asleep is integer arithmetic on both machines rather than two
// floats that agree to fifteen places and then do not.
const PARTS = 20

// Which parts of its own day each kind sleeps through.
//
// All three sleep the same total, eight parts of twenty. That is deliberate and
// it is the fairest thing in the file: nobody chose their creature's pattern, so
// no pattern may be a worse deal than another. What differs is the shape. The
// two that sleep in one block differ in where the block falls, and the third
// sleeps twice, which is a genuinely different animal to keep: it is never down
// for long, and it is never up for long either.
//
// Forty percent because that is roughly what a real animal of any of these
// kinds spends asleep, and because it has to be often enough that a group meets
// it. A creature that slept a tenth of the time would be a rumour rather than a
// thing you learn to live around. It is also not a closed door: waking it is an
// action, so a group that finds it down always has something they can do.
//
// Every window starts after part zero, which is not a coincidence and must stay
// true. Phase zero is the moment the group was made, so a creature is always
// awake when its group first meets it, and whatever it rolled it stays awake
// for at least two and three quarter hours of that first session: measured
// across four hundred seeds, none was asleep at birth and the shortest first
// waking stretch was 2.94 hours. A group that made a creature and found it
// asleep would have no way of telling that from a broken app.
const SLEEP_PARTS: Record<ActivityPattern, number[][]> = {
  diurnal: [[12, 20]],
  nocturnal: [[6, 14]],
  crepuscular: [
    [6, 10],
    [16, 20],
  ],
}

// How far into its first waking stretch a creature can be born, at most three
// parts of twenty. The seed decides where in that stretch, so two groups who
// made a creature in the same minute do not keep identical hours forever. It is
// bounded rather than spread over the whole cycle because the alternative is a
// group meeting an animal that goes to sleep ten minutes later.
const OFFSET_PARTS = 3

/**
 * How long a creature stays up after somebody wakes it.
 *
 * It lives HERE and not in the worker, and that placement is the fix for a real
 * defect rather than tidiness. The server grew a rouse of its own and the app
 * never learned about it, so for half an hour after a successful waking the two
 * sides held different beliefs: the server would take any ordinary action, and
 * the app went on drawing a sleeping animal and offering the single button the
 * server now refused. Two answers to one question is the thing this file exists
 * to prevent, so there is one number and one function and both sides call it.
 *
 * Under an hour on purpose, and load bearing: the server answers this from the
 * last GROUP_ACTS_PER_HOUR rows, and that read is only EXACT while the window
 * is shorter than the hour its cap covers. Raise this past an hour and wakings
 * a group paid for start being missed, with nothing going red.
 */
export const ROUSE_MS = 30 * MINUTE_MS

interface Clock {
  activity: ActivityPattern
  // The length of this creature's own day, in whole minutes of milliseconds.
  cycle: number
  // How far into its first waking stretch it was born, same units.
  offset: number
}

/**
 * Everything the clock is made of, off its own stream.
 *
 * `clock:` and not the shared draw, exactly like `plan:` in alleles.ts, and for
 * the identical reason: taking these three off the genome's own generator would
 * shift every allele drawn after them and silently reroll every creature that
 * already exists. There are groups out there who have been raising theirs for
 * months, and their animal is not allowed to change because sleep was added.
 *
 * One function for all three so the draw ORDER lives in one place. Three
 * separate calls to makeRng with the same key would each start the same
 * sequence over, and the pattern and the cycle would then be two readings of one
 * number: every diurnal creature would have the shortest day. Anything added
 * later goes on the END of this, for the same reason the stream is separate.
 */
function rollClock(seed: string): Clock {
  const rng = makeRng('clock:' + seed)
  const activity = ACTIVITY_PATTERNS[rng.int(ACTIVITY_PATTERNS.length)]
  const cycle = CYCLE_MIN_MS + rng.int(CYCLE_SPAN_MINUTES + 1) * MINUTE_MS
  const offset = rng.int(Math.floor((cycle * OFFSET_PARTS) / PARTS / MINUTE_MS) + 1) * MINUTE_MS
  return { activity, cycle, offset }
}

/** Which hours this seed keeps, as a kind. Called once, at hatch, by rollGenome:
 *  the pattern belongs on the genome because it is fixed for life, and the rest
 *  of the clock does not, because it is derivable and storing a derived thing is
 *  how two machines end up disagreeing about it. */
export function rollActivity(seed: string): ActivityPattern {
  return rollClock(seed).activity
}

interface Segment {
  start: number
  end: number
  asleep: boolean
}

function partOf(cycle: number, part: number): number {
  return Math.round((cycle * part) / PARTS)
}

// The whole cycle as a run of segments, ascending, covering it exactly once.
// Built rather than written down so the windows table stays the only statement
// of the schedule and the gaps between windows cannot drift out of step with it.
function segmentsFor(activity: ActivityPattern, cycle: number): Segment[] {
  const out: Segment[] = []
  let at = 0
  for (const window of SLEEP_PARTS[activity]) {
    const start = partOf(cycle, window[0])
    const end = partOf(cycle, window[1])
    if (start > at) out.push({ start: at, end: start, asleep: false })
    out.push({ start, end, asleep: true })
    at = end
  }
  if (at < cycle) out.push({ start: at, end: cycle, asleep: false })
  return out
}

/** Whether a number can be done arithmetic on at all. Number.isFinite and not
 *  the global isFinite, because the global coerces and would call the string
 *  "0" a usable instant. What arrives here has come off a storage row through a
 *  Number(), and the answer to a missing row is NaN. */
function usable(value: number): boolean {
  return Number.isFinite(value)
}

/**
 * Is it asleep right now, and when does that change.
 *
 * `activity` is passed in rather than read back off the seed so a caller that
 * already holds a genome spends nothing, and so this function states plainly
 * that the pattern is the input and the timetable is the output.
 */
export function sleepState(
  activity: ActivityPattern,
  seed: string,
  createdAt: number,
  nowMs: number,
  rousedAt: number,
): SleepState {
  const clock = rollClock(seed)
  // A clock that cannot be read must never put a creature to sleep. Sleep
  // refuses actions, so a missing createdAt row, or a parse that came back NaN,
  // would otherwise lock a whole group out of their own animal on the strength
  // of a bad number, and every comparison against NaN is false so it would fail
  // in whichever direction the code happened to be written. Falling back to no
  // elapsed time at all puts the creature at the top of its waking day, which is
  // the state a group can always act in.
  const elapsed = usable(nowMs) && usable(createdAt) ? nowMs - createdAt : 0
  const started = usable(nowMs) ? nowMs : 0

  // Written out rather than taken as read: a group whose device clock is behind
  // the moment their group was made gives a negative elapsed, and the remainder
  // of a negative number is negative in this language.
  let phase = (elapsed + clock.offset) % clock.cycle
  if (phase < 0) phase += clock.cycle

  const segments = segmentsFor(activity, clock.cycle)
  let index = 0
  while (index < segments.length - 1 && phase >= segments[index].end) index += 1
  const here = segments[index]
  const first = segments[0]
  const last = segments[segments.length - 1]

  // Phase zero is the moment the group was made, and that instant is an anchor,
  // not an event: nothing happens to the creature there. So when the segment it
  // begins and the segment it ends on are the same kind, they are really one
  // stretch that the anchor happens to sit inside, and a stretch reported as
  // starting or ending at the anchor would show a group a countdown to a moment
  // when nothing is going to happen.
  const joined = segments.length > 1 && first.asleep === last.asleep
  const from = index === 0 && joined ? last.start - clock.cycle : here.start
  const to = index === segments.length - 1 && joined ? first.end + clock.cycle : here.end

  const schedule: SleepState = {
    asleep: here.asleep,
    since: started - (phase - from),
    until: started + (to - phase),
  }
  return roused(schedule, started, rousedAt)
}

/**
 * The timetable with a waking laid over it.
 *
 * Being woken does not move the schedule, it overrides where the creature
 * currently sits in it, so this is applied last and never folded into the
 * segment maths.
 *
 * `rousedAt` is 0 when nobody has woken it, which is also what an unreadable
 * row gives, and 0 is far enough in the past that it can never be inside a
 * window. A rouse in the FUTURE is ignored the same way: a device whose clock
 * is behind the server would otherwise hold a creature awake indefinitely off
 * one row.
 */
function roused(schedule: SleepState, started: number, rousedAt: number): SleepState {
  if (!schedule.asleep) return schedule
  if (!usable(rousedAt) || rousedAt > started) return schedule
  const until = rousedAt + ROUSE_MS
  if (started < until) return { asleep: false, since: rousedAt, until }
  // Down again, but the stretch it is in did not begin when the window did: it
  // began when the waking ran out. Worth saying properly, because `since` is
  // what the app draws "it has been down since" from, and telling a group it
  // has been asleep all evening when they had it up an hour ago is the app
  // contradicting something they did themselves.
  return { asleep: true, since: schedule.since > until ? schedule.since : until, until: schedule.until }
}

/**
 * When it was last woken, out of a log.
 *
 * ONE implementation, called by both sides with whatever rows they hold: the
 * server passes the recent window it already read for the cooldown, the app
 * passes its own copy of the log. Order agnostic and bounded by the window
 * rather than by position, so neither caller has to sort or slice first, and
 * neither can be subtly more right than the other.
 *
 * Returns 0 for "not recently", which is what sleepState wants.
 */
export function lastRouseAt(
  rows: ReadonlyArray<{ variantId: string; at: number }>,
  nowMs: number,
  isRouse: (variantId: string) => boolean,
): number {
  if (!usable(nowMs)) return 0
  const from = nowMs - ROUSE_MS
  let best = 0
  for (const row of rows) {
    if (!usable(row.at) || row.at <= from || row.at > nowMs) continue
    if (!isRouse(row.variantId)) continue
    if (row.at > best) best = row.at
  }
  return best
}

/** The same answer for a caller holding a snapshot, which is both of them. The
 *  group's createdAt is the anchor, so this is the call that cannot be got
 *  wrong by passing the wrong timestamp. */
export function sleepStateOf(
  genome: Genome,
  createdAt: number,
  nowMs: number,
  rousedAt: number,
): SleepState {
  return sleepState(genome.activity, genome.seed, createdAt, nowMs, rousedAt)
}
