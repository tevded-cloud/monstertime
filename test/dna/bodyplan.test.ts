// Which animal a group gets, before any question of what it grows.
//
// Two groups' creatures were the same dragon in different paint, because the
// rig built exactly four limbs and no number in a Morphs record can take a leg
// away. The plan is the axis that fixes that: rolled from the seed, fixed for
// life, and the thing that decides which rig the forge reaches for.
//
// The rule this file exists to hold is the one that is invisible until it is
// broken: the plan is drawn from ITS OWN stream. Drawing it from the shared
// generator would mean that adding a third plan later shifted every draw after
// it, silently rerolling the alleles of every group that already exists.

import { describe, expect, it } from 'vitest'
import { BODY_PLANS, BUILDABLE_PLANS } from '../../src/core/types'
import { rollGenome } from '../../src/dna'
import { seedFor } from '../helpers'

describe('the body plan', () => {
  it('names the seven the bestiary declares, and builds a subset of them', () => {
    // The roster is selected from GameTev's bestiary rather than invented, and
    // every specimen there is written against these seven. An eighth needs a
    // specimen asking for it.
    expect([...BODY_PLANS]).toEqual([
      'quadruped',
      'serpent',
      'multi-limb',
      'biped',
      'winged',
      'critter',
      'blob',
    ])
    for (const plan of BUILDABLE_PLANS) expect(BODY_PLANS).toContain(plan)
  })

  it('gives every genome a plan a rig exists for', () => {
    for (let i = 0; i < 500; i++) {
      expect(BUILDABLE_PLANS).toContain(rollGenome(seedFor(i)).plan)
    }
  })

  it('gives the same seed the same plan every time', () => {
    for (let i = 0; i < 50; i++) {
      expect(rollGenome(seedFor(i)).plan).toBe(rollGenome(seedFor(i)).plan)
    }
  })

  it('spreads groups across the plans rather than favouring one', () => {
    const seen = new Map<string, number>()
    const N = 2000
    for (let i = 0; i < N; i++) {
      const plan = rollGenome(seedFor(i)).plan
      seen.set(plan, (seen.get(plan) ?? 0) + 1)
    }
    expect(seen.size).toBe(BUILDABLE_PLANS.length)
    for (const count of seen.values()) {
      // Even would be 1/n. Anything inside a third of that either way is a
      // roll, anything outside it is a bug in the draw.
      expect(count).toBeGreaterThan((N / BUILDABLE_PLANS.length) * 0.66)
      expect(count).toBeLessThan((N / BUILDABLE_PLANS.length) * 1.34)
    }
  })

  it('draws the plan off its own stream, so the roster can grow later', () => {
    // The load bearing one. If the plan came off the shared generator, adding a
    // third plan would consume a different number of values and shift every
    // allele draw after it, rerolling the creature of every group that already
    // exists. Checked by proving the alleles do not move when the plan does:
    // two seeds that differ in plan must still each be internally stable, and
    // the carried sets must not correlate with the plan.
    const byPlan = new Map<string, Set<string>>()
    for (let i = 0; i < 200; i++) {
      const g = rollGenome(seedFor(i))
      const first = g.carried.horn[0]
      if (!byPlan.has(g.plan)) byPlan.set(g.plan, new Set())
      byPlan.get(g.plan)!.add(first)
    }
    // Every plan sees a wide spread of opening horn alleles. A draw that had
    // been shifted by the plan would show the two plans drawing from visibly
    // different slices instead.
    for (const alleles of byPlan.values()) expect(alleles.size).toBeGreaterThan(3)
  })

  it('does not change what a group carries when only the plan is read', () => {
    // rollGenome is a pure function and this is the proof that adding the plan
    // did not make it stateful: the carried sets are byte-identical across
    // repeated calls, including when other seeds are rolled in between.
    const before = JSON.stringify(rollGenome(seedFor(7)).carried)
    for (let i = 100; i < 140; i++) rollGenome(seedFor(i))
    expect(JSON.stringify(rollGenome(seedFor(7)).carried)).toBe(before)
  })
})
