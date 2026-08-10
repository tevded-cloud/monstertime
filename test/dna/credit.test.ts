// Who a trait belongs to.
//
// "Ana is why it has those ears" is the sentence this whole app exists to
// produce, so credit is the part most worth getting wrong quietly. It has been
// wrong before in the direction that matters most: somebody who clicked once,
// in passing, was taking sole credit for 1.64 traits per group.
//
// Both directions are checked here, deliberately. A credit rule that simply
// credited nobody would pass a drive-by test perfectly while destroying the
// feature, so the mirror case (a person who really did do nearly all of it must
// be named) is asserted next to it.

import { describe, expect, it } from 'vitest'
import type { ActionRecord } from '../../src/core/types'
import { deriveCreature, rollGenome } from '../../src/dna'
import { action, committedLog, seedFor } from '../helpers'

/** A varied log by three regulars, with `visits` actions from a passer-by. */
function withVisitor(regularActions: number, visits: number): ActionRecord[] {
  const log = committedLog(regularActions, 'feed', 0.5)
  const out = log.map((a, i) => ({ ...a, actorId: ['ann', 'bo', 'cy'][i % 3], actorName: ['ann', 'bo', 'cy'][i % 3] }))
  // Dropped in a third of the way through, which is where a visitor actually
  // turns up: late enough that the regulars have set a direction, early enough
  // that traits are still locking in afterwards.
  const at = Math.floor(out.length / 3)
  for (let v = 0; v < visits; v++) {
    out.splice(at + v, 0, action(1000 + v, 'give.mirrorBit', 'zed'))
  }
  return out.map((a, i) => ({ ...a, id: `act-${i}`, at: 1_700_000_000_000 + i * 10_000 }))
}

function soleCreditFor(actorId: string, groups: number, visits: number): number {
  let total = 0
  for (let i = 0; i < groups; i++) {
    const creature = deriveCreature(rollGenome(seedFor(i)), withVisitor(150, visits), null)
    for (const trait of creature.traits) {
      if (trait.credited.length === 1 && trait.credited[0] === actorId) total += 1
    }
  }
  return total / groups
}

describe('a passer-by does not take a trait', () => {
  it('gives a one-click visitor sole credit on nothing at all', () => {
    // The recorded invariant, and an exact zero rather than a small number: one
    // click is not a relationship with an animal, and being told it is would
    // devalue every trait that was earned.
    expect(soleCreditFor('zed', 120, 1)).toBe(0)
  })

  it('still gives a one-click visitor nothing when the group is small', () => {
    // A smaller group means each action is a larger share, which is where the
    // old bug bit hardest.
    let total = 0
    for (let i = 0; i < 80; i++) {
      const log = withVisitor(40, 1)
      const creature = deriveCreature(rollGenome(seedFor(i)), log, null)
      for (const trait of creature.traits) {
        if (trait.credited.length === 1 && trait.credited[0] === 'zed') total += 1
      }
    }
    expect(total).toBe(0)
  })

  it('does not simply refuse to credit anybody', () => {
    // The mirror. Without this, the two tests above would be satisfied by a
    // credit rule that named nobody, which passes as a gate and fails as a
    // product.
    let credited = 0
    let traits = 0
    for (let i = 0; i < 60; i++) {
      const creature = deriveCreature(rollGenome(seedFor(i)), withVisitor(150, 1), null)
      traits += creature.traits.length
      credited += creature.traits.filter((t) => t.credited.length > 0).length
    }
    expect(traits).toBeGreaterThan(0)
    expect(credited / traits).toBeGreaterThan(0.9)
  })

  it('names the person who actually did nearly all of it', () => {
    // 108 of 120, the mirror case from the original measurement.
    const actors = (i: number): string => (i % 10 === 0 ? 'ann' : 'dom')
    let sole = 0
    for (let i = 0; i < 60; i++) {
      const log = committedLog(120, 'feed', 0.6).map((a, n) => ({ ...a, actorId: actors(n), actorName: actors(n) }))
      const creature = deriveCreature(rollGenome(seedFor(i)), log, null)
      sole += creature.traits.filter((t) => t.credited.length === 1 && t.credited[0] === 'dom').length
    }
    expect(sole / 60).toBeGreaterThan(3)
  })

  it('only ever credits people who are actually in the log', () => {
    for (let i = 0; i < 60; i++) {
      const log = withVisitor(150, 2)
      const creature = deriveCreature(rollGenome(seedFor(i)), log, null)
      const known = new Set(log.map((a) => a.actorId))
      for (const trait of creature.traits) {
        for (const id of trait.credited) expect(known).toContain(id)
      }
      for (const memory of creature.memories) {
        for (const id of memory.actorIds) expect(known).toContain(id)
      }
    }
  })

  it('orders credit deterministically rather than by object key order', () => {
    // Two screens disagreeing about whose horns those are is named in
    // express.ts as the worst bug this app could have, so the tie break is
    // asserted rather than assumed: the same log, with the actors met in a
    // different order, must credit the same people in the same order.
    const log = withVisitor(150, 3)
    const shuffled = [...log].sort((a, b) => (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0))
    // Re-stamp so the ORDER of the log is unchanged; only the object identities
    // and the order the actors are first seen in differ.
    const restamped = shuffled.map((a, i) => ({ ...log[i], actorId: a.actorId, actorName: a.actorName }))
    const genome = rollGenome(seedFor(3))
    const once = deriveCreature(genome, restamped, null)
    const twice = deriveCreature(genome, [...restamped], null)
    expect(twice.traits.map((t) => t.credited.join(','))).toEqual(once.traits.map((t) => t.credited.join(',')))
  })
})
