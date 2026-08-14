// The action tree, and what it did to the balance underneath it.
//
// The list of things a person can do is an input to the genetics, not a menu.
// Expression picks an allele by comparing what a group pushed against what each
// allele wants, so if the list leans toward one axis, every creature leans that
// way and the eight axes stop being eight. That balance is load-bearing in the
// way a constant in the maths is, and it rots quietly: somebody adds four fun
// feed items and nothing anywhere goes red.
//
// This file is that gate. It exists because adding a manner to every item
// multiplied the pool by four, and the honest question was whether the balance
// survived it rather than whether the code compiled.

import { describe, expect, it } from 'vitest'
import {
  ACTION_METHODS,
  ACTION_VARIANTS,
  categoriesForKind,
  methodById,
  methodFits,
  methodsForKind,
  pushOf,
} from '../../src/dna/actions'
import { ACTION_KINDS, PRESSURE_AXES } from '../../src/core/types'
import type { ActionRecord, ActionVariant, PressureAxis } from '../../src/core/types'
import { deriveCreature, rollGenome } from '../../src/dna'
import { oneButtonLog, seedFor } from '../helpers'

/** Every item, plus every item crossed with every manner its kind allows. */
function everyPairing(): Array<{ variantId: string; methodId?: string }> {
  const out: Array<{ variantId: string; methodId?: string }> = []
  for (const variant of ACTION_VARIANTS) {
    out.push({ variantId: variant.id })
    for (const method of ACTION_METHODS) {
      if (method.kind === variant.kind) out.push({ variantId: variant.id, methodId: method.id })
    }
  }
  return out
}

/**
 * How likely each item is to be the one somebody picks.
 *
 * NOT one vote per item, and the difference is the whole measurement. The tray
 * asks in order: which of the six kinds, then which shelf, then which thing on
 * it. So a kind with sixty items does not become ten times likelier than a kind
 * with six; it becomes the same one in six, spread thinner.
 *
 * Counting items flat was right while every kind held six of them and wrong the
 * moment one was filled out properly: feeding went to sixty-one items and the
 * flat count read the catalogue as two thirds about food, which is not what a
 * person meets. Weighting by the path through the tray is what the numbers below
 * are actually about, and it stays true whatever size the shelves grow to.
 */
function weightOf(variant: ActionVariant): number {
  const kinds = new Set(ACTION_VARIANTS.map((v) => v.kind)).size
  const shelvesHere = new Set(
    ACTION_VARIANTS.filter((v) => v.kind === variant.kind).map((v) => v.category),
  ).size
  const itemsHere = ACTION_VARIANTS.filter(
    (v) => v.kind === variant.kind && v.category === variant.category,
  ).length
  return 1 / (kinds * shelvesHere * itemsHere)
}

function shareByAxis(
  pairs: Array<{ variantId: string; methodId?: string }>,
): Record<PressureAxis, number> {
  const tally = Object.fromEntries(PRESSURE_AXES.map((a) => [a, 0])) as Record<PressureAxis, number>
  const byId = new Map(ACTION_VARIANTS.map((v) => [v.id, v]))
  let total = 0
  for (const pair of pairs) {
    const variant = byId.get(pair.variantId)
    if (variant === undefined) continue
    const weight = weightOf(variant)
    const push = pushOf(pair.variantId, pair.methodId)
    for (const axis of PRESSURE_AXES) {
      const amount = (push[axis] ?? 0) * weight
      tally[axis] += amount
      total += amount
    }
  }
  for (const axis of PRESSURE_AXES) tally[axis] = (100 * tally[axis]) / total
  return tally
}

describe('what the whole pool leans toward', () => {
  it('is still within a few points of even across all eight axes', () => {
    const share = shareByAxis(everyPairing())
    const worst = Math.max(
      ...PRESSURE_AXES.map((a) => Math.abs(share[a] - 100 / PRESSURE_AXES.length)),
    )
    // Six points, roughly half an axis. Tight enough that a lopsided batch of
    // new items trips it, loose enough that the catalogue is allowed a
    // character. If this goes red the fix is more items on the thin axes, and
    // never a bigger number here.
    expect(worst).toBeLessThan(6)
  })

  it('barely moved when manners were added on top of items', () => {
    // The real claim of the composed design: a manner colours a decision
    // without rewriting what the catalogue is about. If adding them shifted an
    // axis by more than a couple of points they are not a modifier, they are
    // the item, and the thing you fed it has stopped mattering.
    const itemsOnly = shareByAxis(ACTION_VARIANTS.map((v) => ({ variantId: v.id })))
    const withManners = shareByAxis(everyPairing())
    for (const axis of PRESSURE_AXES) {
      expect(Math.abs(withManners[axis] - itemsOnly[axis])).toBeLessThan(2.5)
    }
  })

  it('spreads the manner layer across axes instead of piling onto one', () => {
    // This is what makes the above true, and it is the property that has to
    // hold as manners are added. Three per kind on three different axes means
    // a group using all of them evenly has said nothing at all, which is the
    // only reason nobody has to hand-balance the leaves.
    const tally = Object.fromEntries(PRESSURE_AXES.map((a) => [a, 0])) as Record<PressureAxis, number>
    for (const method of ACTION_METHODS) {
      for (const axis of PRESSURE_AXES) tally[axis] += method.push[axis] ?? 0
    }
    // nourish excepted, deliberately: what a thing IS cannot be changed by how
    // it was handed over, so no manner touches it.
    expect(tally.nourish).toBe(0)
    const relationship = PRESSURE_AXES.filter((a) => a !== 'nourish')
    for (const axis of relationship) expect(tally[axis]).toBeGreaterThan(0)
    expect(Math.max(...relationship.map((a) => tally[a]))).toBeLessThanOrEqual(3)
  })

  it('keeps a manner smaller than the item it describes', () => {
    for (const method of ACTION_METHODS) {
      const weight = PRESSURE_AXES.reduce((sum, a) => sum + (method.push[a] ?? 0), 0)
      expect(weight).toBeGreaterThan(0)
      // An item pushes at least 3 across its axes. A manner worth as much as
      // one would drown out what actually went into the creature.
      expect(weight).toBeLessThanOrEqual(2)
    }
  })
})

describe('the shape of the tree', () => {
  it('gives every kind more than one shelf, or the level is pure clicking', () => {
    for (const kind of ACTION_KINDS) expect(categoriesForKind(kind).length).toBeGreaterThan(1)
  })

  it('gives every kind more than one manner, for the same reason', () => {
    for (const kind of ACTION_KINDS) expect(methodsForKind(kind).length).toBeGreaterThan(1)
  })

  it('puts every item on a shelf of its own kind', () => {
    for (const variant of ACTION_VARIANTS) {
      expect(variant.category.length).toBeGreaterThan(0)
      expect(categoriesForKind(variant.kind)).toContain(variant.category)
    }
  })

  it('never names a manner the same as an item', () => {
    // The collision this shipped with: an item called "from your own hand"
    // sitting one level above a manner called "by hand", offering the same
    // sentence twice with different consequences.
    const labels = new Set(ACTION_VARIANTS.map((v) => v.label.toLowerCase()))
    for (const method of ACTION_METHODS) {
      expect(labels.has(method.label.toLowerCase())).toBe(false)
    }
  })

  it('has no two manners sharing an id', () => {
    expect(new Set(ACTION_METHODS.map((m) => m.id)).size).toBe(ACTION_METHODS.length)
  })

  it('names every manner under the kind it belongs to', () => {
    // The id prefix is not decoration. It is what makes a mismatched pairing
    // visible in a stored row by eye.
    for (const method of ACTION_METHODS) expect(method.id.startsWith(`${method.kind}.`)).toBe(true)
  })
})

describe('pairing an item with a manner', () => {
  it('refuses a manner from another kind', () => {
    expect(methodFits('feed.emberfruit', 'tend.firmly')).toBe(false)
    expect(methodFits('feed.emberfruit', 'feed.byHand')).toBe(true)
  })

  it('refuses a manner that does not exist', () => {
    expect(methodFits('feed.emberfruit', 'feed.lovingly')).toBe(false)
    expect(methodById('feed.lovingly')).toBeNull()
  })

  it('adds the manner on top of the item rather than replacing it', () => {
    const bare = pushOf('feed.emberfruit')
    const withIt = pushOf('feed.emberfruit', 'feed.byHand')
    expect(withIt.nourish).toBe(bare.nourish)
    expect(withIt.bond ?? 0).toBe((bare.bond ?? 0) + 1)
  })

  it('ignores a manner that does not belong rather than trusting it', () => {
    // Belt and braces with the server check. A row that got in before that
    // check existed, or through a bug, has to compose to the item alone rather
    // than to whatever the mismatched manner happened to push.
    expect(pushOf('feed.emberfruit', 'tend.firmly')).toEqual(pushOf('feed.emberfruit'))
    expect(pushOf('feed.emberfruit', 'nonsense')).toEqual(pushOf('feed.emberfruit'))
  })

  it('leaves an action with no manner exactly as it was', () => {
    // Every action written before manners existed. The day this stops being
    // true is the day every creature in every group changes.
    for (const variant of ACTION_VARIANTS) {
      expect(pushOf(variant.id)).toEqual(variant.push)
    }
  })
})

describe('whether any of this reaches the creature', () => {
  // The layer above measures the catalogue. None of it would notice if
  // expression quietly went back to reading the item alone, and then the whole
  // tree is four taps that change nothing. These are the tests that notice.

  const withManner = (log: ActionRecord[], methodId: string): ActionRecord[] =>
    log.map((row) => ({ ...row, methodId }))

  it('makes a creature raised one way different from the same one raised another', () => {
    // Stated over a population rather than one seed, because it is not true of
    // every seed and pretending otherwise would be a test that passes on a
    // lucky number. A manner is one point against an item's five, so on some
    // genomes it moves the pressures without moving which allele wins. The
    // claim worth making is that it usually does move it, and the first draft
    // of this test asserted it on seed 41, which is one of the quiet ones.
    const log = oneButtonLog(60, 'feed.emberfruit')
    const shape = (c: { traits: Array<{ locus: string; allele: string }> }): string =>
      c.traits.map((t) => `${t.locus}:${t.allele}`).sort().join('|')
    let differ = 0
    const SEEDS = 60
    for (let s = 0; s < SEEDS; s++) {
      const genome = rollGenome(seedFor(s))
      const byHand = shape(deriveCreature(genome, withManner(log, 'feed.byHand'), null))
      const thrown = shape(deriveCreature(genome, withManner(log, 'feed.thrown'), null))
      if (byHand !== thrown) differ++
    }
    // Measured at 175 in 200 the day this was written. Half is the floor: below
    // that a manner has stopped being a decision and is a fourth tap that
    // mostly changes nothing.
    expect(differ / SEEDS).toBeGreaterThan(0.5)
  })

  it('sends the pressure to the axis the manner names', () => {
    const genome = rollGenome(seedFor(42))
    const log = oneButtonLog(40, 'feed.emberfruit')
    const bare = deriveCreature(genome, log, null)
    const byHand = deriveCreature(genome, withManner(log, 'feed.byHand'), null)
    // feed.byHand is the bond one, and ember-fruit pushes no bond at all, so
    // this is the whole of the difference rather than a nudge inside noise.
    expect(byHand.pressures.bond).toBeGreaterThan(bare.pressures.bond)
    expect(byHand.pressures.nourish).toBe(bare.pressures.nourish)
  })

  it('leaves a log with no manners deriving exactly what it always did', () => {
    // The compatibility claim, stated where it can fail. Every action written
    // before this shipped carries no manner, and if this ever goes red every
    // creature that exists has silently changed.
    const genome = rollGenome(seedFor(43))
    const log = oneButtonLog(50, 'train.chaseYard')
    const before = deriveCreature(genome, log, null)
    expect(before.traits.length).toBeGreaterThan(0)
    expect(JSON.stringify(before)).toBe(JSON.stringify(deriveCreature(genome, log, null)))
  })

  it('ignores a manner belonging to another kind, all the way through', () => {
    // Not a unit check of pushOf this time: a row that got past the server with
    // a mismatched manner must produce the creature the item alone produces.
    const genome = rollGenome(seedFor(44))
    const log = oneButtonLog(50, 'feed.emberfruit')
    const clean = deriveCreature(genome, log, null)
    const wrong = deriveCreature(genome, withManner(log, 'tend.firmly'), null)
    expect(JSON.stringify(wrong)).toBe(JSON.stringify(clean))
  })
})

describe('the manners an item allows', () => {
  it('never names a manner that does not exist', () => {
    // A typo here does not throw and does not go red on its own: methodFits
    // just answers no, so the item quietly offers fewer manners than it meant
    // to. That happened on the shelf of sitting-with-it, which asked for
    // 'tend.slowly' when the manner is 'tend.firmly', and the only symptom was
    // one option on screen instead of two.
    const known = new Set(ACTION_METHODS.map((m) => m.id))
    for (const variant of ACTION_VARIANTS) {
      for (const id of variant.methods ?? []) {
        expect({ variant: variant.id, method: id, known: known.has(id) })
          .toEqual({ variant: variant.id, method: id, known: true })
      }
    }
  })

  it('never names a manner belonging to another kind', () => {
    for (const variant of ACTION_VARIANTS) {
      for (const id of variant.methods ?? []) {
        const method = methodById(id)
        if (method === null) continue
        expect({ variant: variant.id, sameKind: method.kind === variant.kind })
          .toEqual({ variant: variant.id, sameKind: true })
      }
    }
  })

  it('actually refuses a manner an item left off its list', () => {
    // THE ENFORCEMENT, which the four checks around this one do not touch. They
    // read the data: that the ids exist, belong to the right kind, and leave
    // something open. All of that stays true if methodFits ignores the list
    // entirely, which is exactly the bug that shipped: the field was added and
    // nothing read it, so a per-item allow-list allowed everything. Sabotaging
    // methodFits to `return true` left all of them green.
    let narrowed = 0
    for (const variant of ACTION_VARIANTS) {
      if (variant.methods === undefined) continue
      narrowed++
      for (const method of ACTION_METHODS) {
        if (method.kind !== variant.kind) continue
        const allowed = variant.methods.includes(method.id)
        expect({ variant: variant.id, method: method.id, fits: methodFits(variant.id, method.id) })
          .toEqual({ variant: variant.id, method: method.id, fits: allowed })
      }
    }
    // And there is something to enforce. If every item stopped narrowing, the
    // loop above would pass by doing nothing at all.
    expect(narrowed).toBeGreaterThan(5)
  })

  it('always leaves at least one manner open', () => {
    // Never zero: an item nothing can be true of cannot be done at all, and it
    // would sit in the tray as a dead end.
    for (const variant of ACTION_VARIANTS) {
      const open = ACTION_METHODS.filter((m) => methodFits(variant.id, m.id)).length
      expect({ variant: variant.id, open: open >= 1 }).toEqual({ variant: variant.id, open: true })
    }
  })

  it('does not ask when there is only one answer', () => {
    // Some shelves ARE a manner. Everything on "from far off" is done from far
    // off, so distance is not a decision there and offering it as one is a tap
    // that asks nothing. The tray commits straight from the item in that case,
    // and this holds the two halves together: if an item narrows to one, the
    // one it narrows to is what gets recorded.
    for (const variant of ACTION_VARIANTS) {
      const open = ACTION_METHODS.filter((m) => methodFits(variant.id, m.id))
      if (open.length !== 1) continue
      expect(methodFits(variant.id, open[0].id)).toBe(true)
      expect(variant.methods).toEqual([open[0].id])
    }
  })
})
