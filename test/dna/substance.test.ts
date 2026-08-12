// What goes INTO the creature, as opposed to what is done to it.
//
// The eight pressure axes describe a relationship, and they decide traits. That
// left nowhere for the difference between a strawberry and a fish to land: both
// are "nourish", and colour came from the seed alone. So an activity list with
// hundreds of leaves would have been hundreds of buttons that are aliases of
// thirty six.
//
// Substance is the other half. How a group treats the creature shapes its
// temperament; what the group puts into it shapes its body. The two must not
// bleed into each other, which is most of what is checked here.

import { describe, expect, it } from 'vitest'
import { SUBSTANCE_AXES } from '../../src/core/types'
import { ACTION_VARIANTS, deriveCreature, rollGenome } from '../../src/dna'
import { substanceMix } from '../../src/forge/materials'
import { oneButtonLog, seedFor } from '../helpers'

const genome = rollGenome(seedFor(11))

describe('the catalogue', () => {
  it('only puts something in when something actually goes in', () => {
    // Feeding it and giving it things do. Singing to it and working it do not,
    // and a catalogue where everything fed the body would make the channel
    // meaningless again by a different route.
    const gives = ACTION_VARIANTS.filter((v) => v.gives !== undefined)
    const kinds = new Set(gives.map((v) => v.kind))
    expect([...kinds].sort()).toEqual(['explore', 'feed', 'give'])
    for (const v of ACTION_VARIANTS.filter((x) => x.kind === 'sing' || x.kind === 'train')) {
      expect(v.gives).toBeUndefined()
    }
  })

  it('feeds every substance axis from somewhere', () => {
    // An axis nothing supplies is an axis that can never move, which is the
    // same defect as a locus with no allele answering it.
    for (const axis of SUBSTANCE_AXES) {
      expect(ACTION_VARIANTS.some((v) => (v.gives?.[axis] ?? 0) > 0)).toBe(true)
    }
  })

  it('puts less into the creature from a walk than from a meal', () => {
    // A place is carried on an animal rather than in it.
    const total = (id: string): number => {
      const v = ACTION_VARIANTS.find((x) => x.id === id)
      let sum = 0
      for (const axis of SUBSTANCE_AXES) sum += v?.gives?.[axis] ?? 0
      return sum
    }
    expect(total('explore.riverbank')).toBeLessThan(total('feed.riverGreens'))
  })
})

describe('a diet accumulates', () => {
  it('starts at nothing', () => {
    const fresh = deriveCreature(genome, [], null, 0)
    for (const axis of SUBSTANCE_AXES) expect(fresh.substance[axis]).toBe(0)
  })

  it('fills the axis of whatever the group keeps feeding it', () => {
    const fed = deriveCreature(genome, oneButtonLog(30, 'feed.emberfruit'), null)
    expect(fed.substance.ember).toBeGreaterThan(0)
    expect(fed.substance.verdure).toBe(0)
    expect(fed.substance.brine).toBe(0)
  })

  it('takes nothing in from being sung to', () => {
    const sung = deriveCreature(genome, oneButtonLog(30, 'sing.humDusk'), null)
    for (const axis of SUBSTANCE_AXES) expect(sung.substance[axis]).toBe(0)
  })

  it('separates what went in from what was done', () => {
    // The whole point of two channels. Singing moves pressure and not
    // substance; feeding moves both.
    const sung = deriveCreature(genome, oneButtonLog(20, 'sing.humDusk'), null)
    const fed = deriveCreature(genome, oneButtonLog(20, 'feed.emberfruit'), null)
    expect(sung.pressures.resonance).toBeGreaterThan(0)
    expect(fed.substance.ember).toBeGreaterThan(0)
    let sungTotal = 0
    for (const axis of SUBSTANCE_AXES) sungTotal += sung.substance[axis]
    expect(sungTotal).toBe(0)
  })

  it('is deterministic, like everything else in the derivation', () => {
    const log = oneButtonLog(40, 'feed.saltedFish')
    expect(JSON.stringify(deriveCreature(genome, log, null).substance)).toBe(
      JSON.stringify(deriveCreature(genome, log, null).substance),
    )
  })
})

describe('what it ate shows on it', () => {
  const paletteOf = (variantId: string, n = 40) =>
    deriveCreature(genome, oneButtonLog(n, variantId), null).substance

  it('turns two diets into two different colours from the same seed', () => {
    // The headline, and the thing that was impossible before: colour came from
    // the seed alone, so what a group fed their creature could not reach it.
    const { share: emberShare } = substanceMix(paletteOf('feed.emberfruit'))
    const { share: brineShare } = substanceMix(paletteOf('feed.saltedFish'))
    expect(emberShare.ember).toBeGreaterThan(0.9)
    expect(brineShare.brine).toBeGreaterThan(0.9)
  })

  it('reads what it was fed MOSTLY, not simply how long it was fed', () => {
    // A share rather than a total, so a creature fed for a year is not just
    // more coloured than one fed for a week.
    const short = substanceMix(paletteOf('feed.emberfruit', 10))
    const long = substanceMix(paletteOf('feed.emberfruit', 400))
    expect(short.share.ember).toBeCloseTo(long.share.ember, 5)
    expect(long.strength).toBeGreaterThan(short.strength)
  })

  it('saturates, so the tenth month says little the first did not', () => {
    const a = substanceMix(paletteOf('feed.emberfruit', 100))
    const b = substanceMix(paletteOf('feed.emberfruit', 1000))
    expect(b.strength).toBeGreaterThan(a.strength)
    expect(b.strength).toBeLessThan(1)
    expect(b.strength - a.strength).toBeLessThan(0.3)
  })

  it('leaves an unfed creature exactly the colour its seed gave it', () => {
    const nothing = substanceMix(deriveCreature(genome, [], null, 0).substance)
    expect(nothing.strength).toBe(0)
  })
})
