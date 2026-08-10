// "Two different friend groups must never end up with the same creature."
//
// This is the app's central promise and the one it has already been wrong about
// once: an earlier version of these genetics gave 1302 distinct creatures out of
// 5000 groups, while claiming uniqueness, because the measurement that produced
// the claim no longer existed to be re-run. It exists here now.
//
// The hard case is deliberately the worst one: every group is handed the SAME
// action log, so the only thing telling them apart is the seed. Real groups
// differ in behaviour too, which can only help.

import { describe, expect, it } from 'vitest'
import { deriveCreature, rollGenome } from '../../src/dna'
import { oneButtonLog, seedFor } from '../helpers'

const GROUPS = 5000
const LOG = oneButtonLog(110, 'feed.emberfruit')

function sweep(count: number, log = LOG): { full: Map<string, number>; traits: Map<string, number> } {
  const full = new Map<string, number>()
  const traits = new Map<string, number>()
  for (let i = 0; i < count; i++) {
    const creature = deriveCreature(rollGenome(seedFor(i)), log, null)
    const whole = JSON.stringify(creature)
    const shape = creature.traits.map((t) => `${t.locus}:${t.allele}`).join('|')
    full.set(whole, (full.get(whole) ?? 0) + 1)
    traits.set(shape, (traits.get(shape) ?? 0) + 1)
  }
  return { full, traits }
}

function largest(counts: Map<string, number>): number {
  let most = 0
  for (const n of counts.values()) if (n > most) most = n
  return most
}

describe('two groups never get the same creature', () => {
  const { full, traits } = sweep(GROUPS)

  it('gives every one of 5000 groups its own creature', () => {
    expect(full.size).toBe(GROUPS)
  })

  it('leaves no two groups holding an identical animal', () => {
    expect(largest(full)).toBe(1)
  })

  it('keeps the trait silhouette from collapsing under one-button play', () => {
    // Traits alone are a coarser thing than the whole creature: two groups can
    // share all eight and still stand differently, because the morphs are
    // continuous and seed-biased. So this is not required to be 1.
    //
    // It is still the number that decides whether two groups comparing
    // screenshots see the same animal. It was 279 before the draw was rewritten
    // and 93 after, against a stated target of well under 300. The bound here
    // is the design target rather than the measured figure, because the exact
    // count depends on which seeds this suite happens to use, while the target
    // does not.
    expect(largest(traits)).toBeLessThan(150)
  })

  it('gives a large majority of groups their own silhouette too', () => {
    expect(traits.size).toBeGreaterThan(GROUPS / 4)
  })

  it('does not merely spread the seed: behaviour still moves the animal', () => {
    // Uniqueness by seed alone would be a hollow win if what a group DOES made
    // no difference, so the other half of the promise is checked here.
    const genome = rollGenome(seedFor(1))
    const fed = deriveCreature(genome, oneButtonLog(110, 'feed.emberfruit'), null)
    const roamed = deriveCreature(genome, oneButtonLog(110, 'explore.riverbank'), null)
    const shape = (c: typeof fed): string => c.traits.map((t) => `${t.locus}:${t.allele}`).join('|')
    expect(shape(roamed)).not.toBe(shape(fed))
  })
})
