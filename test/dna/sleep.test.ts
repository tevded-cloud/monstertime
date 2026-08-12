// Gates sleep.ts: the one function in src/dna that is not a read of the log.
//
// Everything here is checked against the function's OWN reported boundaries
// rather than a hand rolled copy of the schedule, on purpose. A test that
// recomputes the windows independently is really a second implementation of
// sleep.ts agreeing with itself, and the entire reason this file exists is that
// there is supposed to be exactly one. Where a claim needs an outside number
// (the forty percent target, the run length ceiling) it is the number already
// measured and written into sleep.ts's own header comment, at whatever smaller
// sample this suite can afford to run on every commit.

import { describe, expect, it } from 'vitest'
import { rollGenome, sleepState, sleepStateOf } from '../../src/dna'
import { ACTIVITY_PATTERNS } from '../../src/core/types'
import type { ActivityPattern } from '../../src/core/types'
import { seedFor } from '../helpers'

/** Nobody has woken it, which is what every test about the timetable itself
 *  wants to say. Named rather than a bare zero, because a lone 0 at the end of
 *  five arguments reads as a placeholder and this one is a fact. */
const NEVER_WOKEN = 0


const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

// An arbitrary fixed epoch instant. It is not the birthday of any seed used
// below; every claim here has to hold for a createdAt picked out of the air,
// because that is what a real group's createdAt is.
const CREATED_AT = 1_700_000_000_000

describe('the same three inputs always give the same answer', () => {
  it('two calls with identical arguments agree exactly', () => {
    // This is the whole point of the function existing at all: the Durable
    // Object and the app call the same code over the same seed, createdAt and
    // instant, and a creature asleep for one screen and awake for the other is
    // the worst bug this app could ship.
    const seed = seedFor(1)
    const a = sleepState('nocturnal', seed, CREATED_AT, CREATED_AT + 5 * HOUR, NEVER_WOKEN)
    const b = sleepState('nocturnal', seed, CREATED_AT, CREATED_AT + 5 * HOUR, NEVER_WOKEN)
    expect(b).toEqual(a)
  })

  it('sleepStateOf reads a genome to the identical answer sleepState gives from its fields', () => {
    for (let s = 0; s < 10; s++) {
      const seed = seedFor(6000 + s)
      const genome = rollGenome(seed)
      const now = CREATED_AT + s * 7 * HOUR
      expect(sleepStateOf(genome, CREATED_AT, now, NEVER_WOKEN)).toEqual(
        sleepState(genome.activity, genome.seed, CREATED_AT, now, NEVER_WOKEN),
      )
    }
  })
})

describe('how much of the day it sleeps', () => {
  // Sampled across the whole cycle rather than at one instant: a single lucky
  // or unlucky timestamp says nothing about a schedule. Ten minute steps
  // resolve every boundary in the table (the narrowest window is three hours
  // and forty minutes) without so many samples the suite is slow.
  const STEP = 10 * MINUTE
  const SPAN_DAYS = 12
  const SEEDS = 30

  function fractionAsleep(activity: ActivityPattern, seed: string): number {
    let asleep = 0
    let total = 0
    for (let t = 0; t < SPAN_DAYS * DAY; t += STEP) {
      if (sleepState(activity, seed, CREATED_AT, CREATED_AT + t, NEVER_WOKEN).asleep) asleep++
      total++
    }
    return asleep / total
  }

  it('sleeps close to forty percent of the time, for every pattern, over a population of seeds', () => {
    // The file's own header measured 39.89% at 400 seeds, 10 minute samples over
    // 30 days. Thirty seeds over twelve days here, for a suite that has to run on
    // every commit; the band is loose enough to hold at the smaller sample and
    // tight enough that a schedule quietly turned into a fifth or three quarters
    // of the day would still trip it.
    for (const activity of ACTIVITY_PATTERNS) {
      let sum = 0
      for (let s = 0; s < SEEDS; s++) sum += fractionAsleep(activity, seedFor(1000 + s))
      const mean = sum / SEEDS
      expect(mean).toBeGreaterThan(0.32)
      expect(mean).toBeLessThan(0.48)
    }
  })
})

describe('never asleep at the moment a group first meets its creature', () => {
  it('reports awake at elapsed zero, for every pattern and a spread of seeds', () => {
    // Every window starts after part zero of twenty, and the seed's own offset
    // is capped at three of those twenty, so phase zero always lands inside the
    // opening awake stretch. A group that hatched an egg and found it asleep
    // would have no way to tell that from a broken app.
    for (const activity of ACTIVITY_PATTERNS) {
      for (let s = 0; s < 100; s++) {
        expect(sleepState(activity, seedFor(7000 + s), CREATED_AT, CREATED_AT, NEVER_WOKEN).asleep).toBe(false)
      }
    }
  })
})

describe('crepuscular really has two windows', () => {
  function countAsleepBlocks(activity: ActivityPattern, seed: string, span: number): number {
    let blocks = 0
    let wasAsleep = false
    for (let t = 0; t < span; t += MINUTE) {
      const asleep = sleepState(activity, seed, CREATED_AT, CREATED_AT + t, NEVER_WOKEN).asleep
      if (asleep && !wasAsleep) blocks++
      wasAsleep = asleep
    }
    return blocks
  }

  it('goes down about twice as often as a one block pattern, over the identical stretch of time', () => {
    // Compared on the SAME seed and the same span rather than against a fixed
    // count, because the cycle length differs seed to seed and a fixed
    // expectation would either be loose enough to hide a bug or tight enough to
    // flake. The cycle length itself does not depend on which pattern is being
    // asked about (it comes off the same clock draw), so the comparison is exact.
    const SPAN = 3 * DAY
    for (const seed of [seedFor(2), seedFor(3), seedFor(4)]) {
      const diurnal = countAsleepBlocks('diurnal', seed, SPAN)
      const nocturnal = countAsleepBlocks('nocturnal', seed, SPAN)
      const crepuscular = countAsleepBlocks('crepuscular', seed, SPAN)
      expect(diurnal).toBeGreaterThanOrEqual(1)
      expect(nocturnal).toBeGreaterThanOrEqual(1)
      expect(crepuscular).toBeGreaterThan(diurnal)
      expect(crepuscular).toBeGreaterThan(nocturnal)
    }
  })
})

describe('diurnal and nocturnal keep genuinely different hours', () => {
  it('is not the same window wearing two names', () => {
    // Same seed, same createdAt: the cycle length and phase are drawn off the
    // seed alone and do not depend on which pattern is asked about, so any
    // difference below is entirely the shape of the table in sleep.ts and not a
    // coincidence of the sample. The table puts them at parts 12-20 and 6-14 of
    // a twenty part day: two parts overlap and the other twelve disagree, so
    // real coverage should read as clearly more disagreement than agreement.
    const SPAN = 3 * DAY
    for (const seed of [seedFor(5), seedFor(6), seedFor(7)]) {
      let agree = 0
      let disagree = 0
      let diurnalAsleepNocturnalAwake = 0
      let nocturnalAsleepDiurnalAwake = 0
      for (let t = 0; t < SPAN; t += MINUTE) {
        const now = CREATED_AT + t
        const d = sleepState('diurnal', seed, CREATED_AT, now, NEVER_WOKEN).asleep
        const n = sleepState('nocturnal', seed, CREATED_AT, now, NEVER_WOKEN).asleep
        if (d === n) agree++
        else disagree++
        if (d && !n) diurnalAsleepNocturnalAwake++
        if (n && !d) nocturnalAsleepDiurnalAwake++
      }
      expect(disagree).toBeGreaterThan(agree)
      // And each pattern has to be caught actually awake somewhere the other is
      // asleep, or "opposite" would only be a claim about degree rather than
      // about the two schedules genuinely differing in shape.
      expect(diurnalAsleepNocturnalAwake).toBeGreaterThan(0)
      expect(nocturnalAsleepDiurnalAwake).toBeGreaterThan(0)
    }
  })
})

describe('a population of seeds keeps different hours from each other', () => {
  // If every seed produced the same schedule the whole point of a group
  // learning ITS creature's hours would be gone. This samples many seeds at the
  // one check-in habit a real group actually has: once a day, at roughly the
  // same hour.
  const SEEDS = 150
  const DAYS = 120
  const CHECK_IN = 20 * HOUR

  function visits(activity: ActivityPattern, seed: string): boolean[] {
    const out: boolean[] = []
    for (let d = 0; d < DAYS; d++) {
      out.push(sleepState(activity, seed, CREATED_AT, CREATED_AT + CHECK_IN + d * DAY, NEVER_WOKEN).asleep)
    }
    return out
  }

  function longestRun(values: boolean[]): number {
    let longest = 0
    let run = 0
    for (const asleep of values) {
      run = asleep ? run + 1 : 0
      if (run > longest) longest = run
    }
    return longest
  }

  it('lands close to the forty percent design point over the whole population', () => {
    // The header comment's own number at 1000 seeds over a year: 39.9%.
    let asleepCount = 0
    let total = 0
    for (const activity of ACTIVITY_PATTERNS) {
      for (let s = 0; s < SEEDS; s++) {
        for (const asleep of visits(activity, seedFor(2000 + s))) {
          if (asleep) asleepCount++
          total++
        }
      }
    }
    const rate = asleepCount / total
    expect(rate).toBeGreaterThan(0.3)
    expect(rate).toBeLessThan(0.5)
  })

  it('carries a genuinely different schedule per seed, not the same clock stamped with a different name', () => {
    // Whether one FIXED hour happens to read asleep or awake depends on where
    // that hour falls against a day length that itself varies (nineteen to
    // twenty one hours), which can resonate with an unlucky choice of check-in
    // and make a real, varied population look falsely uniform: checked at
    // elapsed twenty hours exactly, every nocturnal seed here reads awake,
    // because twenty hours is close enough to every possible cycle length that
    // the phase wraps back near zero, which this file's own header guarantees
    // is always awake. That is a property of the number twenty, not of the
    // seeds. Reading the reported boundary instead sidesteps it entirely: it is
    // a real number that differs seed to seed exactly when the schedule
    // (cycle length and phase offset) genuinely does, with no dependence on
    // where the asleep/awake line happens to fall.
    const MINUTE = 60_000
    for (const activity of ACTIVITY_PATTERNS) {
      const boundaries = new Set<number>()
      for (let s = 0; s < SEEDS; s++) {
        const state = sleepState(activity, seedFor(2000 + s), CREATED_AT, CREATED_AT + 12 * HOUR, NEVER_WOKEN)
        boundaries.add(Math.round(state.until / MINUTE))
      }
      // A hundred and fifty seeds collapsing onto a handful of boundary minutes
      // would mean every creature in the world keeps the same hours, which is
      // the failure this test exists to catch. Measured at 100 seeds when this
      // was written: 73 to 84 distinct minutes depending on the pattern.
      expect(boundaries.size).toBeGreaterThan(SEEDS / 2)
    }
  })

  it('never locks a seed out for more than a handful of evenings running', () => {
    // The header comment's own measured ceiling at 1000 seeds over a year: 3 for
    // the two single block patterns, 2 for the twice a day one. A period exactly
    // equal to 24 hours would have no ceiling at all, which is the regression
    // this specifically guards against.
    const caps: Record<ActivityPattern, number> = { diurnal: 3, nocturnal: 3, crepuscular: 2 }
    for (const activity of ACTIVITY_PATTERNS) {
      let worst = 0
      for (let s = 0; s < SEEDS; s++) {
        const run = longestRun(visits(activity, seedFor(2000 + s)))
        if (run > worst) worst = run
      }
      expect(worst).toBeLessThanOrEqual(caps[activity])
    }
  })
})

describe('the boundary it reports is the exact instant the state changes', () => {
  // Read straight off the function's own `until` and `since` rather than a hand
  // derived boundary, so this stays a test of sleep.ts and not a second, private
  // copy of the schedule that could quietly drift from it. Off-by-one at a
  // boundary is the named risk here, and it is exactly what these two catch.

  it('flips at `until`: awake at that instant if it was asleep, asleep if it was awake, and never before', () => {
    let checked = 0
    for (const activity of ACTIVITY_PATTERNS) {
      for (let s = 0; s < 20; s++) {
        const seed = seedFor(3000 + s)
        // A handful of points spread round the cycle, so both directions of the
        // flip (going down, waking up) get exercised rather than whichever one a
        // single probe happens to land near.
        for (let probe = 0; probe < 21 * HOUR; probe += 3 * HOUR) {
          const now = CREATED_AT + probe
          const state = sleepState(activity, seed, CREATED_AT, now, NEVER_WOKEN)
          const atBoundary = sleepState(activity, seed, CREATED_AT, state.until, NEVER_WOKEN)
          const justBefore = sleepState(activity, seed, CREATED_AT, state.until - 1, NEVER_WOKEN)
          expect(atBoundary.asleep).toBe(!state.asleep)
          expect(justBefore.asleep).toBe(state.asleep)
          checked++
        }
      }
    }
    // Guards the guard: a loop that silently iterated zero times would pass
    // every expectation above by never making one.
    expect(checked).toBeGreaterThan(100)
  })

  it('flips at `since` the same way: one millisecond earlier belongs to the segment before it', () => {
    let checked = 0
    for (const activity of ACTIVITY_PATTERNS) {
      for (let s = 0; s < 20; s++) {
        const seed = seedFor(4000 + s)
        for (let probe = 0; probe < 21 * HOUR; probe += 3 * HOUR) {
          const now = CREATED_AT + probe
          const state = sleepState(activity, seed, CREATED_AT, now, NEVER_WOKEN)
          const atSince = sleepState(activity, seed, CREATED_AT, state.since, NEVER_WOKEN)
          const justBefore = sleepState(activity, seed, CREATED_AT, state.since - 1, NEVER_WOKEN)
          expect(atSince.asleep).toBe(state.asleep)
          expect(justBefore.asleep).toBe(!state.asleep)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('the reported window always contains the instant that was actually asked about', () => {
    // A general containment check, sampled on a 47 minute step deliberately: not
    // a divisor of an hour or of any window width in the table, so the sample
    // does not conspire to only ever land near a boundary.
    for (const activity of ACTIVITY_PATTERNS) {
      for (let s = 0; s < 10; s++) {
        const seed = seedFor(5000 + s)
        for (let t = 0; t < 5 * DAY; t += 47 * MINUTE) {
          const now = CREATED_AT + t
          const state = sleepState(activity, seed, CREATED_AT, now, NEVER_WOKEN)
          expect(state.since).toBeLessThanOrEqual(now)
          expect(state.until).toBeGreaterThan(now)
          expect(state.until).toBeGreaterThan(state.since)
        }
      }
    }
  })
})

describe('any point in the cycle a group could be created at', () => {
  it('produces no crash and a sane state for a device clock reading before the group existed', () => {
    // nowMs less than createdAt happens on real phones: a slow clock, or a
    // message arriving before local time has caught up. The remainder of a
    // negative elapsed is negative in this language, and the correction has to
    // run on every call, not only the ones somebody thought to check.
    const seed = seedFor(9)
    const state = sleepState('crepuscular', seed, CREATED_AT, CREATED_AT - 5 * MINUTE, NEVER_WOKEN)
    expect(Number.isFinite(state.since)).toBe(true)
    expect(Number.isFinite(state.until)).toBe(true)
    expect(typeof state.asleep).toBe('boolean')
  })

  it('behaves identically relative to its own anchor for a createdAt anywhere on the timeline', () => {
    // createdAt carries no calendar meaning to this file, only its distance from
    // now, so a group made at an arbitrary historical instant and a group made a
    // moment ago must both produce a well formed state across many real day
    // boundaries measured from their own anchor.
    const seed = seedFor(10)
    const anchors = [0, 1_700_000_000_000, 1_700_000_000_000 + 17 * HOUR + 23 * MINUTE]
    for (const anchor of anchors) {
      for (let days = 0; days < 40; days++) {
        const state = sleepState('diurnal', seed, anchor, anchor + days * DAY + 11 * HOUR, NEVER_WOKEN)
        expect(Number.isFinite(state.since)).toBe(true)
        expect(Number.isFinite(state.until)).toBe(true)
      }
    }
  })
})

describe('a clock that cannot be read', () => {
  it('falls back to awake, never to asleep, so a missing storage row cannot lock a group out', () => {
    const seed = seedFor(11)
    for (const activity of ACTIVITY_PATTERNS) {
      expect(sleepState(activity, seed, NaN, CREATED_AT, NEVER_WOKEN).asleep).toBe(false)
      expect(sleepState(activity, seed, CREATED_AT, NaN, NEVER_WOKEN).asleep).toBe(false)
      expect(sleepState(activity, seed, NaN, NaN, NEVER_WOKEN).asleep).toBe(false)
    }
  })
})

describe('a clock that cannot be read', () => {
  // The guard these cover was already written and already correct, and every
  // test naming it passed for a different reason: the assertions only looked at
  // `asleep`, which stays false either way, so stripping the guard left the
  // whole suite green while `since` and `until` came back NaN. A test that
  // cannot fail is not protection, and this one is about the failure that would
  // lock a group out of their own animal.

  it('says awake, with real numbers, when the birthday is missing', () => {
    const genome = rollGenome(seedFor(88))
    const now = CREATED_AT + 9 * HOUR
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const state = sleepState(genome.activity, genome.seed, bad, now, NEVER_WOKEN)
      expect(state.asleep).toBe(false)
      // The half that was not being checked. A NaN window is what the app draws
      // a countdown from, and "asleep for NaN more minutes" is the screen this
      // guard exists to prevent.
      expect(Number.isFinite(state.since)).toBe(true)
      expect(Number.isFinite(state.until)).toBe(true)
    }
  })

  it('says awake, with real numbers, when the instant itself is unreadable', () => {
    const genome = rollGenome(seedFor(89))
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const state = sleepState(genome.activity, genome.seed, CREATED_AT, bad, NEVER_WOKEN)
      expect(state.asleep).toBe(false)
      expect(Number.isFinite(state.since)).toBe(true)
      expect(Number.isFinite(state.until)).toBe(true)
    }
  })

  it('ignores a waking it cannot read rather than holding it awake forever', () => {
    // The same disease one field along. A device whose clock is behind the
    // server reports a waking in the future, and an unbounded one would hold a
    // creature up indefinitely off a single row.
    //
    // The instant is SEARCHED FOR rather than picked, and that is not fussiness.
    // The first draft of this used a fixed hour, that creature happened to be
    // awake there, and the assertion held whatever the guard did: removing the
    // guard left it green. A test about being wrongly woken has to run at a
    // moment the creature is actually down.
    const genome = rollGenome(seedFor(90))
    let now = 0
    for (let t = 0; t < 24 * HOUR; t += 10 * MINUTE) {
      if (sleepState(genome.activity, genome.seed, CREATED_AT, CREATED_AT + t, NEVER_WOKEN).asleep) {
        now = CREATED_AT + t
        break
      }
    }
    expect(now).toBeGreaterThan(0)
    const plain = sleepState(genome.activity, genome.seed, CREATED_AT, now, NEVER_WOKEN)
    expect(plain.asleep).toBe(true)
    for (const bad of [Number.NaN, now + HOUR, Number.POSITIVE_INFINITY]) {
      expect(sleepState(genome.activity, genome.seed, CREATED_AT, now, bad)).toEqual(plain)
    }
    // And the positive control, so this cannot pass by the guard refusing
    // everything: a waking that IS readable and in the past does take effect.
    expect(
      sleepState(genome.activity, genome.seed, CREATED_AT, now, now - MINUTE).asleep,
    ).toBe(false)
  })
})
