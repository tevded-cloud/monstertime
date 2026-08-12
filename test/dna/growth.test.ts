// Time, and how it got into a creature that is a pure function of its log.
//
// The creature is f(seed, log). That is what lets every phone and the server
// agree without syncing anything, and it is also why nothing used to happen
// while nobody was looking: growth was the action count, so a creature closed
// for a month was exactly where it was left.
//
// Growth is now a number that accrues from elapsed hours as well as from things
// people do, and the server stamps the running total onto every row it writes.
// So the log still says everything, the derivation still consults no clock, and
// a replay knows exactly how old the animal was at every step.
//
// The two properties worth protecting are opposite ends of the same change: a
// creature must be able to grow with nobody there, and every log written before
// any of this existed must still derive the animal it always derived.

import { describe, expect, it } from 'vitest'
import type { ActionRecord } from '../../src/core/types'
import { deriveCreature, rollGenome } from '../../src/dna'
import { oneButtonLog, seedFor } from '../helpers'

const genome = rollGenome(seedFor(3))

/** A log whose rows carry an explicit growth total. */
function grownLog(points: number[]): ActionRecord[] {
  return points.map((growth, i) => ({
    id: `act-${i}`,
    variantId: 'feed.emberfruit',
    actorId: ['ann', 'bo', 'cy'][i % 3],
    actorName: ['ann', 'bo', 'cy'][i % 3],
    at: 1_700_000_000_000 + i * 10_000,
    growth,
  }))
}

describe('a creature grows while nobody is there', () => {
  it('is an egg with nothing done to it and no time passed', () => {
    expect(deriveCreature(genome, [], null, 0).stageName).toBe('egg')
  })

  it('hatches on time alone, with an empty log', () => {
    // The headline. Nobody did anything; the hours did it.
    const hatched = deriveCreature(genome, [], null, 5)
    expect(hatched.stageName).toBe('hatchling')
    expect(hatched.actionCount).toBe(0)
  })

  it('walks the whole stage ladder on time alone', () => {
    const at = (grown: number): string => deriveCreature(genome, [], null, grown).stageName
    expect(at(4.9)).toBe('egg')
    expect(at(5)).toBe('hatchling')
    expect(at(17.9)).toBe('hatchling')
    expect(at(18)).toBe('juvenile')
    expect(at(48)).toBe('adolescent')
    expect(at(110)).toBe('adult')
  })

  it('locks traits at a boundary crossed with nobody there', () => {
    // A group that acted a few times and then left. The actions supply the
    // pressure; the hours supply the growth. Traits still arrive.
    const log = grownLog([0.2, 0.4, 0.6, 0.8, 1.0])
    const beforeTime = deriveCreature(genome, log, null, 1.0)
    const afterTime = deriveCreature(genome, log, null, 20)
    expect(beforeTime.stageName).toBe('egg')
    expect(beforeTime.traits.length).toBe(0)
    expect(afterTime.stageName).toBe('juvenile')
    expect(afterTime.traits.length).toBeGreaterThan(0)
  })

  it('credits a trait that time locked to the people who supplied the pressure', () => {
    // Nobody was present at the moment it grew, so credit has to come from the
    // behaviour behind it rather than from whoever happened to act last.
    const log = grownLog([0.2, 0.4, 0.6, 0.8, 1.0])
    const grown = deriveCreature(genome, log, null, 20)
    const named = new Set(log.map((a) => a.actorId))
    for (const trait of grown.traits) {
      expect(trait.credited.length).toBeGreaterThan(0)
      for (const id of trait.credited) expect(named).toContain(id)
    }
  })

  it('never skips a boundary it passed over in one jump', () => {
    // The reason a tick is a crossing rather than an equality. Growth moves in
    // fractions and in jumps, so a creature can go from 4 to 30 without ever
    // standing on 5 or 18, and both of those stages still have to happen.
    const jumped = deriveCreature(genome, grownLog([4]), null, 30)
    const walked = deriveCreature(genome, grownLog([4, 5, 18, 30]), null, 30)
    expect(jumped.stageName).toBe(walked.stageName)
    // Both went through hatchling and juvenile, so both have the memories of it.
    expect(jumped.memories.length).toBeGreaterThan(1)
  })

  it('goes on ticking past adult', () => {
    const adult = deriveCreature(genome, [], null, 110)
    const older = deriveCreature(genome, [], null, 110 + 40 * 3)
    expect(adult.stageName).toBe('adult')
    expect(older.stageName).toBe('adult')
    expect(older.memories.length).toBeGreaterThan(adult.memories.length)
  })

  it('reads stage off the growth stamps, not off how many rows there are', () => {
    // Fifty actions that between them grew the creature barely at all, which is
    // what a group hammering one stage looks like once the returns diminish.
    const slow = grownLog(Array.from({ length: 50 }, (_, i) => (i + 1) * 0.04))
    expect(deriveCreature(genome, slow, null, 2).stageName).toBe('egg')
    expect(deriveCreature(genome, slow, null, 2).actionCount).toBe(50)
  })
})

describe('every log written before growth existed still derives the same animal', () => {
  it('treats a row with no growth stamp as one point, exactly as before', () => {
    // The compatibility property, and the reason the parameter is optional. A
    // log from before any of this, replayed today, has to be the same creature
    // it was: one action, one point, ticks at 5, 18, 48 and 110.
    const old = oneButtonLog(60, 'feed.emberfruit')
    const before = deriveCreature(genome, old, null)
    expect(before.stageName).toBe('adolescent')
    expect(before.actionCount).toBe(60)
    expect(before.traits.length).toBeGreaterThan(0)
  })

  it('gives the same creature whether growth is omitted or passed as the count', () => {
    const old = oneButtonLog(60, 'feed.emberfruit')
    expect(JSON.stringify(deriveCreature(genome, old, null, 60))).toBe(
      JSON.stringify(deriveCreature(genome, old, null)),
    )
  })

  it('is still deterministic once growth is in the mix', () => {
    const log = grownLog([1, 3, 7, 12, 20, 33])
    expect(JSON.stringify(deriveCreature(genome, log, null, 44))).toBe(
      JSON.stringify(deriveCreature(genome, log, null, 44)),
    )
  })

  it('never goes backwards as growth increases', () => {
    const log = grownLog([1, 3, 7])
    let last = -1
    for (let g = 0; g <= 200; g += 5) {
      const stage = deriveCreature(genome, log, null, g).stage
      expect(stage).toBeGreaterThanOrEqual(last)
      last = stage
    }
  })
})
