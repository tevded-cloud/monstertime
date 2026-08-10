// The allele catalogue and the rarity ladder built on it.
//
// A note on what is and is not asserted here. The ladder's core claim, that the
// pressure rate an allele demands is monotone in its threshold, lives in
// `hasEarned`, which is private to express.ts. Restating its formula in a test
// would assert only that the test can copy an expression, and would go on
// passing if both copies drifted together. So the ladder is checked through
// what a player can actually observe: an allele never turns up before the stage
// it is gated to, rare alleles stay rarer than common ones, and the catalogue
// the ladder is built from is well formed.

import { describe, expect, it } from 'vitest'
import { LOCI } from '../../src/core/types'
import { ALLELES, alleleById, deriveCreature, rollGenome } from '../../src/dna'
import { committedLog, oneButtonLog, seedFor } from '../helpers'

describe('the allele catalogue', () => {
  it('holds 91 alleles', () => {
    expect(ALLELES.length).toBe(91)
  })

  it('gives every allele a unique id', () => {
    expect(new Set(ALLELES.map((a) => a.id)).size).toBe(ALLELES.length)
  })

  it('names every id after the locus it belongs to', () => {
    // The forge, the chronicle and the registry all key off these ids, and a
    // mismatch between the prefix and the locus is the kind of thing that reads
    // correctly right up until something groups by one of the two.
    const wrong = ALLELES.filter((a) => !a.id.startsWith(`${a.locus}.`))
    expect(wrong.map((a) => a.id)).toEqual([])
  })

  it('puts at least one allele at every locus', () => {
    for (const locus of LOCI) {
      expect(ALLELES.filter((a) => a.locus === locus).length).toBeGreaterThan(0)
    }
  })

  it('gives every allele a usable threshold and stage', () => {
    for (const allele of ALLELES) {
      expect(Number.isFinite(allele.threshold)).toBe(true)
      expect(allele.threshold).toBeGreaterThan(0)
      expect(Number.isInteger(allele.minStage)).toBe(true)
      expect(allele.minStage).toBeGreaterThanOrEqual(0)
      expect(allele.minStage).toBeLessThanOrEqual(4)
    }
  })

  it('gives every allele an affinity to be read against', () => {
    // An allele with no affinity has no direction, so nothing a group did could
    // ever point toward it and it would sit in the catalogue unreachable.
    for (const allele of ALLELES) {
      expect(Object.entries(allele.affinity).length).toBeGreaterThan(0)
    }
  })
})

describe('the rarity ladder holds where it can be seen', () => {
  it('never expresses an allele before the stage it is gated to', () => {
    // The availability half of the ladder, and an exact invariant rather than a
    // distributional one, so one violation anywhere fails it.
    const offenders: string[] = []
    for (let i = 0; i < 200; i++) {
      for (const kind of ['feed', 'give', 'explore']) {
        const creature = deriveCreature(rollGenome(seedFor(i)), committedLog(200, kind), null)
        for (const trait of creature.traits) {
          const allele = alleleById(trait.allele)
          if (allele && trait.stage < allele.minStage) {
            offenders.push(`${trait.allele} at stage ${trait.stage}, gated to ${allele.minStage}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('only ever expresses an allele the genome actually carries', () => {
    // Potential is fixed at hatch. A trait outside the carried set would mean a
    // group grew something its seed never offered, which is the whole basis of
    // two groups diverging.
    for (let i = 0; i < 200; i++) {
      const genome = rollGenome(seedFor(i))
      const creature = deriveCreature(genome, committedLog(300, 'feed'), null)
      for (const trait of creature.traits) {
        expect(genome.carried[trait.locus]).toContain(trait.allele)
      }
    }
  })

  it('keeps the striking alleles rarer than the plain ones', () => {
    // The frequency half. Counted across a wide sweep rather than asserted per
    // pair, because affinity direction also decides a locus: a high threshold
    // allele that answers a group's habit exactly should beat a low threshold
    // one that answers nothing, and that is the design, not an inversion.
    const seen = new Map<string, number>()
    for (let i = 0; i < 400; i++) {
      const kind = ['feed', 'train', 'explore', 'sing', 'give', 'tend'][i % 6]
      const creature = deriveCreature(rollGenome(seedFor(i)), committedLog(160, kind), null)
      for (const trait of creature.traits) seen.set(trait.allele, (seen.get(trait.allele) ?? 0) + 1)
    }
    const rateOf = (id: string): number => seen.get(id) ?? 0
    for (const locus of LOCI) {
      const here = ALLELES.filter((a) => a.locus === locus)
      const cheapest = here.reduce((lo, a) => (a.threshold < lo.threshold ? a : lo))
      const dearest = here.reduce((hi, a) => (a.threshold > hi.threshold ? a : hi))
      expect(rateOf(dearest.id)).toBeLessThanOrEqual(rateOf(cheapest.id))
    }
  })
})

describe('growth follows the log', () => {
  it('reaches the documented stages at the documented action counts', () => {
    // STAGE_ACTIONS is [0, 5, 18, 48, 110] and is private, so it is pinned here
    // through the public surface: these boundaries decide when a group gets its
    // first trait, and moving them silently changes the feel of the first
    // session for every group there will ever be.
    const genome = rollGenome(seedFor(9))
    const log = oneButtonLog(200, 'feed.emberfruit')
    const stageAt = (n: number): string => deriveCreature(genome, log.slice(0, n), null).stageName
    expect(stageAt(0)).toBe('egg')
    expect(stageAt(4)).toBe('egg')
    expect(stageAt(5)).toBe('hatchling')
    expect(stageAt(17)).toBe('hatchling')
    expect(stageAt(18)).toBe('juvenile')
    expect(stageAt(47)).toBe('juvenile')
    expect(stageAt(48)).toBe('adolescent')
    expect(stageAt(109)).toBe('adolescent')
    expect(stageAt(110)).toBe('adult')
  })

  it('never goes backwards as the log grows', () => {
    const genome = rollGenome(seedFor(12))
    const log = committedLog(300, 'train')
    let last = -1
    for (let n = 0; n <= 300; n += 10) {
      const stage = deriveCreature(genome, log.slice(0, n), null).stage
      expect(stage).toBeGreaterThanOrEqual(last)
      last = stage
    }
  })
})
