// The purchase, and how it reaches the chronicle without weakening the promise
// the whole app rests on.
//
// Chronicle.tsx renders two things and only two: creature.traits and
// creature.memories. Both come out of one call, so that call is the entire
// channel to the payoff surface. Buying the egg together is the first thing that
// ever happens to a group's creature and the emotional centre of the market, and
// it was reaching that surface nowhere: an hour after the argument nothing in
// the app said which egg won, what it cost, or who backed it.
//
// It cannot be recomputed from (genome, actions). Who pledged what is a fact the
// server holds in a table, and the losing rows are deleted at resolution, so a
// client folding the log alone can only invent it, and two clients inventing it
// would show two different histories of the same animal. So it is an ARGUMENT.
// The derivation stays a pure function of what it is handed; what it is handed
// grew by one field that the server fills and every client is sent.
//
// WHAT THIS FILE HAS TO PROVE, in the order the doubts arrive:
//
//   1. Two clients handed the same server state write the same chronicle, in
//      whatever order the rows reached them.
//   2. The purchase changes the chronicle and NOTHING else about the animal. No
//      pressure, no substance, no action count, no bond, no trait.
//   3. A group with no purchase derives exactly what it derived before any of
//      this existed, whether the argument is passed as absent or left off.
//   4. Every rule that reads the rows actually refuses something, with a
//      positive control beside it, because a negative test in this repo goes
//      green the moment ANY rule refuses and four tests once passed against an
//      enforcement sabotaged to `return true`.
//
// test/dna/purity.test.ts and test/dna/determinism.test.ts are the other half of
// this and are deliberately NOT edited: if either had to be loosened to fit the
// purchase in, the purchase would be in the wrong place.

import { describe, expect, it } from 'vitest'
import type { Creature, GroupSnapshot, Memory, Pledge, Purchase } from '../../src/core/types'
import { deriveCreature, rollGenome } from '../../src/dna'
import { creatureOf } from '../../src/dna/express'
import { oneButtonLog, seedFor } from '../helpers'

const genome = rollGenome(seedFor(41))

// A log of a real variant by real actors, so that nothing else in the
// derivation is refusing while a purchase rule is being measured. The fixtures
// in this file are built to make every OTHER gate pass.
const log = oneButtonLog(24, 'feed.emberfruit')

// The instant the market resolved. Distinct from any action's `at` in the log
// above, which starts at 1_700_000_000_000, so a timestamp that came from the
// wrong place is visible rather than coincidentally right.
const BOUGHT_AT = 1_699_999_000_000

/** One surviving pledge row, in the shape the server stores them. Claimed
 *  members carry the '@' prefix, so the ids here are the ids a real market
 *  produces. */
function pledge(actorId: string, actorName: string, coins: number, egg: number): Pledge {
  return { actorId, actorName, egg, coins, at: BOUGHT_AT - 300_000 }
}

function purchaseOf(egg: number, pledges: Pledge[]): Purchase {
  return { egg, at: BOUGHT_AT, pledges }
}

/** The two pledges the ordinary fixture is built on: 60 and 45 on the middle
 *  egg, which is 105 coins and a real price for a group of two. */
const ANA = pledge('@ana', 'Ana', 60, 1)
const BEN = pledge('@ben', 'Ben', 45, 1)

function memoryOf(creature: Creature): Memory | null {
  for (const memory of creature.memories) {
    if (memory.id === 'p.bought') return memory
  }
  return null
}

function textOf(creature: Creature): string {
  const memory = memoryOf(creature)
  return memory === null ? '' : memory.text
}

function derive(purchase: Purchase | null): Creature {
  return deriveCreature(genome, log, 'Nim', 30, purchase)
}

function snapshotOf(purchase: Purchase | undefined): GroupSnapshot {
  return {
    groupId: 'group-1',
    createdAt: BOUGHT_AT,
    name: 'Nim',
    handle: 'nim',
    genome,
    actions: log,
    growth: 30,
    pace: 1,
    purchase,
  }
}

describe('the purchase reaches the chronicle', () => {
  it('says what it cost and who put the coins in', () => {
    // The positive control the whole file hangs off. Every negative below is a
    // one-row edit of this fixture, so a rule that refused everything would be
    // caught here rather than read as a pass.
    expect(textOf(derive(purchaseOf(1, [ANA, BEN])))).toBe(
      'It was bought for 105 coins, the middle of the three. Ana put in 60 and Ben 45.',
    )
  })

  it('quotes a total that is exactly the figures it just named', () => {
    // The defect this shape exists to make impossible. A total sent alongside
    // the list could disagree with the list printed under it, so there is no
    // total on the wire and this is the sum of these three rows and nothing
    // else. 60 + 45 + 30.
    const text = textOf(derive(purchaseOf(1, [ANA, BEN, pledge('@cal', 'Cal', 30, 1)])))
    expect(text).toContain('135 coins')
    expect(text).toBe(
      'It was bought for 135 coins, the middle of the three. Ana put in 60, Ben 45 and Cal 30.',
    )
  })

  it('names one backer without making them a list', () => {
    expect(textOf(derive(purchaseOf(0, [pledge('@ana', 'Ana', 75, 0)])))).toBe(
      'It was bought for 75 coins, the cheapest of the three. Ana put in all of it.',
    )
  })

  it('names every backer, however many there are', () => {
    // No cap, unlike trait credit, and the difference is deliberate: credit
    // names who SHAPED the animal and stops at three because a fourth name
    // makes the first three mean less. Everybody who paid is a fact, and every
    // one of them is reading this line looking for their own name.
    const many = [
      pledge('@ana', 'Ana', 60, 2),
      pledge('@ben', 'Ben', 45, 2),
      pledge('@cal', 'Cal', 40, 2),
      pledge('@dee', 'Dee', 35, 2),
      pledge('@eve', 'Eve', 5, 2),
    ]
    const text = textOf(derive(purchaseOf(2, many)))
    for (const name of ['Ana', 'Ben', 'Cal', 'Dee', 'Eve']) expect(text).toContain(name)
    expect(text).toContain('185 coins')
  })

  it('says which of the three the group took', () => {
    const said = (egg: number): string =>
      textOf(derive(purchaseOf(egg, [pledge('@ana', 'Ana', 90, egg)])))
    expect(said(0)).toContain('the cheapest of the three')
    expect(said(1)).toContain('the middle of the three')
    expect(said(2)).toContain('the dearest of the three')
  })

  it('drops the clause and keeps the figure when the egg is not one of the three', () => {
    // The fallback, and it is this way round on purpose: what the group paid is
    // the fact, and which of three it was is the colour on top of it. Naming a
    // fourth egg would be the app stating something that was never on screen.
    expect(textOf(derive(purchaseOf(7, [pledge('@ana', 'Ana', 90, 7)])))).toBe(
      'It was bought for 90 coins. Ana put in all of it.',
    )
  })

  it('stamps it with the moment the market resolved', () => {
    const memory = memoryOf(derive(purchaseOf(1, [ANA, BEN])))
    expect(memory?.at).toBe(BOUGHT_AT)
    // Before anybody had done anything, which is what the log's own numbering
    // says: the first action is 1. Chronicle sorts on this, so it is what puts
    // the purchase at the bottom of the list where the oldest thing belongs.
    expect(memory?.atAction).toBe(0)
  })

  it('carries no actor ids, so no name can be filtered out of it', () => {
    // Chronicle turns actorIds into "X did this." by looking each id up in the
    // bonds, and bonds come from the action log. Ana and Ben are in this
    // fixture's log; Zoe below is a backer who paid and has never clicked
    // anything, so an id list would have her dropped from the one line in the
    // app whose whole job is to say who paid. The names live in the text, where
    // nothing can filter them.
    const withStranger = derive(purchaseOf(1, [ANA, pledge('@zoe', 'Zoe', 45, 1)]))
    expect(memoryOf(withStranger)?.actorIds).toEqual([])
    expect(textOf(withStranger)).toContain('Zoe 45')
    expect(withStranger.bonds['@zoe']).toBeUndefined()
  })
})

describe('two clients derive the same chronicle', () => {
  it('does not care what order the rows arrived in', () => {
    // The phone that sat through the market accumulated pledges from a stream of
    // market messages; the phone that opened the app an hour later got them out
    // of a SELECT with an ORDER BY on it. Those are two orders of the same
    // three rows, and a group's oldest sentence must not depend on which phone
    // is reading it, nor be rewritten the day somebody edits the ORDER BY.
    const cal = pledge('@cal', 'Cal', 30, 1)
    const server = derive(purchaseOf(1, [ANA, BEN, cal]))
    const watcher = derive(purchaseOf(1, [cal, BEN, ANA]))
    expect(JSON.stringify(watcher)).toBe(JSON.stringify(server))
  })

  it('orders the names by what people put in, with ties on actor id', () => {
    // The rule underneath the test above, asserted directly, so that "the same
    // whatever the order" cannot be satisfied by a rule that puts them in some
    // other stable order nobody chose.
    const even = [
      pledge('@ben', 'Ben', 40, 1),
      pledge('@ana', 'Ana', 40, 1),
      pledge('@cal', 'Cal', 90, 1),
    ]
    expect(textOf(derive(purchaseOf(1, even)))).toBe(
      'It was bought for 170 coins, the middle of the three. Cal put in 90, Ana 40 and Ben 40.',
    )
  })

  it('gives two clients holding equal snapshots the identical animal', () => {
    // The test the whole unit was set to satisfy. Distinct objects, distinct
    // arrays, equal contents, and the two must be byte-identical: traits and
    // memories are the chronicle, and everything else is the animal above it.
    const mine = snapshotOf(purchaseOf(1, [ANA, BEN]))
    const theirs: GroupSnapshot = {
      ...mine,
      actions: mine.actions.map((a) => ({ ...a })),
      purchase: purchaseOf(1, [{ ...BEN }, { ...ANA }]),
    }
    expect(JSON.stringify(creatureOf(theirs))).toBe(JSON.stringify(creatureOf(mine)))
  })

  it('derives the same thing twice from the same purchase', () => {
    const purchase = purchaseOf(1, [ANA, BEN])
    expect(JSON.stringify(derive(purchase))).toBe(JSON.stringify(derive(purchase)))
  })

  it('does not touch the list it was handed', () => {
    // The sort is on a copy. Handed the snapshot's own array and left to sort in
    // place, the second derivation would be reading a list the first one
    // reordered, which is how a pure function stops being one.
    //
    // SMALLEST FIRST, and the order of this fixture is the whole test. Written
    // 60, 45, 30 it was already in the order the sort wants, so sorting the
    // caller's array in place was a no-op and this passed with the copy removed.
    // Caught by sabotaging the copy and watching nothing go red.
    const rows = [pledge('@cal', 'Cal', 30, 1), BEN, ANA]
    const before = JSON.stringify(rows)
    derive(purchaseOf(1, rows))
    expect(JSON.stringify(rows)).toBe(before)
  })
})

describe('the purchase changes the chronicle and nothing else', () => {
  it('leaves every other part of the animal byte-identical', () => {
    // The doctrine test. A purchase is not something done TO the creature: it
    // pushes no pressure, puts no substance in, counts as no action, earns
    // nobody a bond, and cannot move a trait. Sabotaging any of that turns this
    // red, which is what makes the promise in express.ts checkable rather than
    // merely written down.
    const without = derive(null)
    const with_ = derive(purchaseOf(1, [ANA, BEN]))
    const rest = (creature: Creature): string =>
      JSON.stringify({ ...creature, memories: null })
    expect(rest(with_)).toBe(rest(without))
    expect(with_.actionCount).toBe(without.actionCount)
  })

  it('adds exactly one memory, at the end of the list', () => {
    const without = derive(null)
    const with_ = derive(purchaseOf(1, [ANA, BEN]))
    expect(with_.memories.length).toBe(without.memories.length + 1)
    expect(JSON.stringify(with_.memories.slice(0, -1))).toBe(JSON.stringify(without.memories))
    // Last, and it is the oldest entry here. It ties with the stage memory of a
    // creature that hatched untouched, Chronicle sorts descending on atAction
    // with a stable sort, so the later entry is drawn underneath and underneath
    // is where the older of two things belongs.
    expect(with_.memories[with_.memories.length - 1].id).toBe('p.bought')
  })

  it('derives what it always derived for a group that never saw a market', () => {
    // Every group that was live the day markets shipped. Absent must mean
    // absent: same creature, byte for byte, whether the argument is left off or
    // passed as nothing.
    const legacy = deriveCreature(genome, log, 'Nim', 30)
    expect(JSON.stringify(derive(null))).toBe(JSON.stringify(legacy))
    expect(JSON.stringify(deriveCreature(genome, log, 'Nim', 30, undefined))).toBe(
      JSON.stringify(legacy),
    )
    expect(memoryOf(legacy)).toBeNull()
  })
})

describe('what the rows have to be before they are read out', () => {
  it('leaves out coins that were on an egg the group did not buy', () => {
    // A losing row the server failed to refund is money nobody spent on this
    // animal. Read as sent it would be a name in the sentence and coins in the
    // total, which is the app stating that somebody paid for a creature they
    // voted against. The positive control is the same row on the winning egg.
    const strayed = derive(purchaseOf(1, [ANA, BEN, pledge('@cal', 'Cal', 30, 2)]))
    expect(textOf(strayed)).toBe(
      'It was bought for 105 coins, the middle of the three. Ana put in 60 and Ben 45.',
    )
    expect(textOf(strayed)).not.toContain('Cal')

    const moved = derive(purchaseOf(1, [ANA, BEN, pledge('@cal', 'Cal', 30, 1)]))
    expect(textOf(moved)).toContain('Cal 30')
    expect(textOf(moved)).toContain('135 coins')
  })

  it('leaves out a backer holding nothing', () => {
    // A pledge of zero is how somebody takes their coins back off an egg, and it
    // SETS the row to zero rather than removing it, so a zero row reaches this
    // function on a real market. The market screen already skips a backer
    // holding nothing; a chronicle that thanked them by name for nothing would
    // be worse than the screen they were skipped on. One coin is the control.
    const zero = derive(purchaseOf(1, [ANA, pledge('@cal', 'Cal', 0, 1)]))
    expect(textOf(zero)).toBe(
      'It was bought for 60 coins, the middle of the three. Ana put in all of it.',
    )

    const one = derive(purchaseOf(1, [ANA, pledge('@cal', 'Cal', 1, 1)]))
    expect(textOf(one)).toContain('Cal 1')
    expect(textOf(one)).toContain('61 coins')
  })

  it('leaves out a figure that is not a whole number of coins', () => {
    // Fractions of a coin are not a thing anybody can be shown, and a negative
    // one is money the app would be saying somebody took out. Both arrive off an
    // open socket in the same way NaN does. The control is the same backer with
    // a whole figure.
    for (const bad of [12.5, -30, Number.NaN]) {
      const text = textOf(derive(purchaseOf(1, [ANA, pledge('@cal', 'Cal', bad, 1)])))
      expect(text).not.toContain('Cal')
      expect(text).toContain('60 coins')
    }
    expect(textOf(derive(purchaseOf(1, [ANA, pledge('@cal', 'Cal', 12, 1)])))).toContain('Cal 12')
  })

  it('says nothing at all rather than saying it was bought for nothing', () => {
    // The fallback, written down beside the rule that produces it. With no row
    // left to name, the only other sentence available is "bought for 0 coins",
    // which is a false statement about the one purchase the group actually
    // remembers making. Silence is the honest answer, and the control proves the
    // silence is this rule and not the whole feature failing to run.
    expect(memoryOf(derive(purchaseOf(1, [])))).toBeNull()
    expect(memoryOf(derive(purchaseOf(1, [pledge('@ana', 'Ana', 0, 1)])))).toBeNull()
    expect(memoryOf(derive(purchaseOf(1, [pledge('@ana', 'Ana', 90, 2)])))).toBeNull()
    expect(memoryOf(derive(purchaseOf(1, [pledge('@ana', 'Ana', 90, 1)])))).not.toBeNull()
  })
})

describe('creatureOf is the door, so nobody can supply half an answer', () => {
  it('hands the derivation every field the snapshot holds', () => {
    const snapshot = snapshotOf(purchaseOf(1, [ANA, BEN]))
    expect(JSON.stringify(creatureOf(snapshot))).toBe(
      JSON.stringify(
        deriveCreature(
          snapshot.genome,
          snapshot.actions,
          snapshot.name,
          snapshot.growth,
          snapshot.purchase,
        ),
      ),
    )
  })

  it('is not satisfied by a caller who forgets one of them', () => {
    // The point of the door, asserted as a difference rather than assumed. Each
    // of these is a real call somebody has already written by hand: four
    // arguments is what both derivations in this repo passed before the purchase
    // existed, and it derives an animal with no history of being bought.
    const snapshot = snapshotOf(purchaseOf(1, [ANA, BEN]))
    const full = JSON.stringify(creatureOf(snapshot))
    const noPurchase = deriveCreature(
      snapshot.genome,
      snapshot.actions,
      snapshot.name,
      snapshot.growth,
    )
    const noGrowth = deriveCreature(snapshot.genome, snapshot.actions, snapshot.name)
    expect(JSON.stringify(noPurchase)).not.toBe(full)
    expect(JSON.stringify(noGrowth)).not.toBe(full)
  })

  it('carries a group that never went to a market straight through', () => {
    const plain = creatureOf(snapshotOf(undefined))
    expect(memoryOf(plain)).toBeNull()
    expect(JSON.stringify(plain)).toBe(JSON.stringify(deriveCreature(genome, log, 'Nim', 30)))
  })
})
