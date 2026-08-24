// The egg market, as arithmetic, gated.
//
// rules.ts is the half of the market the worker trusts with real money: the
// server calls it before writing a row, and it is the ONE place a price, a
// refusal or a resolution is decided. If it disagrees with itself under load
// nobody notices in a demo, because a demo is one person clicking one button.
// It shows up as a group's coins not adding up months later, which is the
// shape of bug this suite exists to make impossible to ship.
//
// The house rule from test/dna/tree.test.ts applies here even harder, because
// this is money rather than genetics: a claim is stated over a population, not
// one seed or one tidy example, and where a rate is measured the number goes
// in a comment next to the threshold it is checked against.
//
// TWO RULES MOVED UNDER THIS FILE AND EIGHT TESTS WERE REWRITTEN AGAINST THE
// NEW TRUTH RATHER THAN RESTORED. A pledge now SETS the figure on an egg
// instead of adding a row to it, because lowering one used to be a withdrawal
// followed by a smaller pledge and the gap between the two could push a
// DIFFERENT egg into the lead and fund it, buying a group a creature nobody
// chose by way of somebody dragging a slider down. And the plain egg is flat
// at 75 instead of 40 + 35 per member, because at two claimed members the old
// figure was 110 against a purse of 100: a group of two whose second person
// claimed and never came back could not afford ANY egg, ever, with nothing on
// screen saying why. Every test below that describes the old shape now
// describes the new one, and the old shapes are named where they were, so the
// next reader is not left guessing whether a property was dropped or moved.

import { describe, expect, it } from 'vitest'
import {
  CLAIMED_PREFIX,
  EGG_COUNT,
  EGG_ENDS,
  GRANDFATHERED_HATCH_SPEED,
  STARTING_PURSE,
  atMarket,
  checkPledge,
  checkWithdrawal,
  hatchAdjusted,
  hatchSpeedOf,
  isClaimedMember,
  isEggIndex,
  leadingEgg,
  pledgedBy,
  priceOf,
  purseOf,
  resolutionOf,
  shortfallOf,
  totalsOf,
  withPledge,
  withWithdrawal,
} from '../../src/market/rules'
import { eggsOnOffer } from '../../src/market/index'
import { emptySubstance, rollGenome } from '../../src/dna'
import { paletteFor, seededRandom } from '../../src/forge/materials'
import { colourName } from '../../src/ui/describe'
import type { GroupSnapshot, MarketState, PerEgg, Pledge } from '../../src/core/types'
import { seedFor } from '../helpers'

// ---------------------------------------------------------------------------
// A seeded, deterministic RNG for the randomised sequences below. Not
// src/dna/rng: that stream is the genetics' own and mixing a test's random
// walk into it would be exactly the "two engines" mistake this file exists to
// catch elsewhere. Math.random would make a failing run unreproducible, which
// is worse than useless for money.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function candidatesFor(base: number): [string, string, string] {
  return [seedFor(base), seedFor(base + 1), seedFor(base + 2)]
}

/**
 * A market with nothing on it yet.
 *
 * Local, and it is local because rules.ts no longer exports an openMarket for
 * it to call. That function described itself as "the one place a market is
 * born" and was never called from one: the Durable Object assembles its
 * MarketState inline in marketNow(), and the only callers this export ever had
 * were the thirty odd in this file, which is a birth site kept alive by the
 * tests written against it. It is deleted rather than kept, so what is left is
 * a fixture that is honestly a fixture. If marketNow() is ever pointed at a
 * shared constructor, this is the line that should start calling it.
 */
function emptyMarket(candidates: [string, string, string], claimed: number): MarketState {
  return { candidates, claimed, pledges: [] }
}

function pledge(actorId: string, egg: number, coins: number, at = 0): Pledge {
  return { actorId, actorName: actorId, egg, coins, at }
}

/** Every row this person has on this egg. There should never be more than one
 *  of them now, and asserting the COUNT is how that is said as a shape rather
 *  than as a sum: three rows adding to the right number pass every total in
 *  this file and are the state the old additive model left behind. */
function rowsFor(market: MarketState, actorId: string, egg: number): Pledge[] {
  return market.pledges.filter((p) => p.actorId === actorId && p.egg === egg)
}

function onlyOn(egg: number, coins: number): PerEgg {
  const out: PerEgg = [0, 0, 0]
  out[egg] = coins
  return out
}

// ---------------------------------------------------------------------------
// Who may spend
// ---------------------------------------------------------------------------

describe('who may spend', () => {
  it('marks exactly the ids the server issues to a claimed member', () => {
    expect(CLAIMED_PREFIX).toBe('@')
    expect(isClaimedMember('@abc123')).toBe(true)
    expect(isClaimedMember('abc123')).toBe(false)
    expect(isClaimedMember('')).toBe(false)
  })

  it('checks the prefix, not the presence, of the mark', () => {
    // A browser-typed id could easily contain an '@' somewhere without being
    // the server's own. isClaimedMember has to ask "starts with", not "has
    // one anywhere", or a self-asserted actorId becomes spendable again,
    // which is the exact forgery the passcode system exists to close off.
    expect(isClaimedMember('guest-@nonymous')).toBe(false)
    expect(isClaimedMember('e@')).toBe(false)
  })

  it('gives an unclaimed visitor nothing to spend, not zero as an error', () => {
    const market = emptyMarket(candidatesFor(1), 3)
    const purse = purseOf(market, 'visitor')
    expect(purse.coins).toBe(0)
    expect(purse.pledged).toBe(0)
    expect(purse.onEgg).toEqual([0, 0, 0])
  })
})

// ---------------------------------------------------------------------------
// Which shape of group is being looked at
// ---------------------------------------------------------------------------

describe('atMarket', () => {
  function fakeGroupSnapshot(): GroupSnapshot {
    // A real genome rather than a stub, so this is a GroupSnapshot the rest
    // of the app would actually accept, not a shape that only satisfies the
    // compiler.
    return {
      groupId: 'g-real',
      createdAt: 0,
      name: null,
      handle: null,
      genome: rollGenome(seedFor(1)),
      actions: [],
      growth: 0,
      pace: 1,
    }
  }

  it('is false for a group that already has its creature', () => {
    expect(atMarket(fakeGroupSnapshot())).toBe(false)
  })

  it('is true for a group still choosing its egg', () => {
    const snapshot = { groupId: 'g-market', createdAt: 0, handle: null, market: emptyMarket(candidatesFor(2), 2) }
    expect(atMarket(snapshot)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The guard every wire-supplied egg index goes through
// ---------------------------------------------------------------------------

describe('isEggIndex', () => {
  it('accepts exactly 0, 1 and 2', () => {
    for (let egg = 0; egg < EGG_COUNT; egg++) expect(isEggIndex(egg)).toBe(true)
  })

  it('rejects everything a socket could actually hand it', () => {
    const bad: unknown[] = [-1, 3, 1.5, -0.5, NaN, Infinity, -Infinity, '1', null, undefined, true, [], {}]
    for (const value of bad) expect(isEggIndex(value)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// What the three eggs cost
// ---------------------------------------------------------------------------

describe('what the three eggs cost', () => {
  const CLAIMED_SWEEP = [1, 2, 3, 4, 5, 6, 8, 12, 20, 35, 50, 100]

  it('is always a whole number of coins, at every headcount tested', () => {
    for (const claimed of CLAIMED_SWEEP) {
      for (let egg = 0; egg < EGG_COUNT; egg++) expect(Number.isInteger(priceOf(egg, claimed))).toBe(true)
    }
  })

  it('keeps plain cheaper than middle cheaper than fine at every headcount tested', () => {
    // Walked over the three indices and asked priceOf directly, which is what
    // the market screen and the worker both do. It used to read the prices out
    // of eggTerms(claimed), and that call was the only caller eggTerms had
    // anywhere: a helper whose entire reason to exist was one line of one test,
    // wearing a doc comment that named the screen and the server as its
    // callers. Both of them ask priceOf.
    for (const claimed of CLAIMED_SWEEP) {
      const [plain, middle, fine] = [0, 1, 2].map((egg) => priceOf(egg, claimed))
      expect(plain).toBeLessThan(middle)
      expect(middle).toBeLessThan(fine)
    }
  })

  it('floors a fractional or missing headcount to one claimed member, never to zero', () => {
    for (let egg = 0; egg < EGG_COUNT; egg++) {
      expect(priceOf(egg, 1)).toBe(priceOf(egg, 0))
      expect(priceOf(egg, 1)).toBe(priceOf(egg, 0.5))
      expect(priceOf(egg, 1)).toBe(priceOf(egg, -8))
      expect(priceOf(egg, 2)).toBe(priceOf(egg, 2.9))
    }
  })

  it('falls back to the cheapest egg for a mangled index rather than throwing or paying nothing', () => {
    // The belt on top of checkPledge's braces. Nothing on the wire should
    // reach here without going through isEggIndex first, but a price is a
    // number a screen always has to show, so a bad index degrades to a real
    // price instead of NaN or an exception reaching a render.
    const bad: number[] = [-1, 3, 1.7, NaN]
    for (const value of bad) {
      expect(priceOf(value, 4)).toBe(priceOf(0, 4))
      expect(hatchSpeedOf(value)).toBe(hatchSpeedOf(0))
    }
  })

  it('holds the plain egg flat at every headcount and scales only the other two', () => {
    // The deadlock fix, pinned. Measured across the sweep: the plain egg is 75
    // at 1 claimed member and 75 at 100 of them, while the middle runs 105 to
    // 5055 and the fine 125 to 5570. It used to be 40 + 35 per member, which
    // is 110 from two members up: a group of two whose second person claimed
    // and then never came back could not afford ANY egg, ever, because
    // claiming raised the price and brought money that never arrived.
    for (const claimed of CLAIMED_SWEEP) {
      expect(priceOf(0, claimed)).toBe(priceOf(0, 1))
      expect(priceOf(0, claimed)).toBe(75)
    }
    for (const claimed of CLAIMED_SWEEP) {
      for (const egg of [1, 2]) {
        expect(priceOf(egg, claimed + 1)).toBeGreaterThan(priceOf(egg, claimed))
      }
    }
  })

  it('never lets a friend joining make any egg less affordable to the group', () => {
    // The property that actually matters, and it is about the gap rather than
    // about the price on its own. Claiming brings a whole purse of 100 and
    // adds at most 55 to any price, so what the group holds minus what an egg
    // costs can only ever widen. The old shape of this test asserted a
    // strictly positive price delta, which is a stand-in for this and is now
    // false for the plain egg by design: its delta is exactly 0 at every
    // headcount, which leaves it exactly as affordable rather than more so,
    // and that is still on the correct side of the line this test draws.
    for (const claimed of [1, 2, 3, 5, 9, 20, 60]) {
      for (let egg = 0; egg < EGG_COUNT; egg++) {
        const before = claimed * STARTING_PURSE - priceOf(egg, claimed)
        const after = (claimed + 1) * STARTING_PURSE - priceOf(egg, claimed + 1)
        expect(after).toBeGreaterThan(before)
        // And no egg ever gets CHEAPER as people arrive, which is the other
        // half of the same idea: a group that could not afford one would be
        // better off waiting for a joiner than pledging, and waiting is the
        // one thing this screen must never reward.
        const delta = priceOf(egg, claimed + 1) - priceOf(egg, claimed)
        expect(delta).toBeGreaterThanOrEqual(0)
        expect(delta).toBeLessThan(STARTING_PURSE)
      }
    }
  })

  it('lets one member buy the plain egg on their own, at every headcount, on purpose', () => {
    // Deliberate, and the reason it is the CHEAP egg this is true of. One
    // person can always get a stuck group moving, and it costs the group the
    // slowest hatch of the three to take that way out. Measured: 75 against a
    // purse of 100 at every headcount in the sweep, so the answer never turns
    // on how many people have claimed.
    for (const claimed of CLAIMED_SWEEP) {
      expect(priceOf(0, claimed)).toBeLessThanOrEqual(STARTING_PURSE)
    }
    expect(hatchSpeedOf(0)).toBeLessThan(hatchSpeedOf(1))
    expect(hatchSpeedOf(0)).toBeLessThan(hatchSpeedOf(2))
  })

  it('keeps the two better eggs out of reach of any single purse at every headcount', () => {
    // What stops one person buying the group's PICK of the three on their own,
    // which is the guard the whole feature exists for. The plain egg is
    // deliberately not in this list: somebody who jumps the gun gets the
    // cheapest and slowest, never their choice. Measured at one claimed
    // member, where these are at their lowest: the middle is 105 and the fine
    // is 125, clear of a single purse by 5 and 25, and both only rise.
    for (const claimed of CLAIMED_SWEEP) {
      for (const egg of [1, 2]) expect(priceOf(egg, claimed)).toBeGreaterThan(STARTING_PURSE)
    }
  })

  it('keeps the dearest egg out of reach of any single purse from four claimed members up', () => {
    // The specific property the locked brief names: nothing stops one person
    // outvoting the rest of a group of four or more, because nobody can fund
    // the fine egg out of one purse.
    for (const claimed of [4, 5, 6, 8, 10, 16, 40]) {
      expect(priceOf(2, claimed)).toBeGreaterThan(STARTING_PURSE)
    }
  })

  it('gives the dearest egg the fastest hatch and the cheapest the slowest, in mint order', () => {
    expect(hatchSpeedOf(0)).toBeLessThan(hatchSpeedOf(1))
    expect(hatchSpeedOf(1)).toBeLessThan(hatchSpeedOf(2))
  })

  it('sets the middle egg at exactly the speed a grandfathered group carries', () => {
    // The whole reason a group that predates the market moves by nothing:
    // it reads as GRANDFATHERED_HATCH_SPEED, and that has to be the same
    // number the middle egg sells, or "grandfathered" and "bought the
    // middle egg" would quietly stop meaning the same wait.
    expect(hatchSpeedOf(1)).toBe(GRANDFATHERED_HATCH_SPEED)
  })
})

// ---------------------------------------------------------------------------
// How long the egg stage lasts, adjusted for what was bought
// ---------------------------------------------------------------------------

describe('hatchAdjusted', () => {
  it('leaves a grandfathered creature exactly where it was, across a swept population', () => {
    // The defect the contract agent found and fixed in itself: written as
    // plain + EGG_ENDS - hatchesAt, this moved a grandfathered creature by a
    // floating point crumb. The fix computes the offset first so it is
    // exactly zero at speed 1. Swept here rather than trusted from the
    // report, because "it was fixed" and "it stays fixed" are different
    // claims and only the second one is a test.
    const rand = mulberry32(7)
    const values = [0, EGG_ENDS, EGG_ENDS - 1e-9, EGG_ENDS + 1e-9, 1e6]
    for (let i = 0; i < 5000; i++) values.push(rand() * 200 - 20)
    // A sweep of uniform random doubles passes on this exact regression even
    // WITHOUT the fix: verified separately, 0 mismatches in 200,000 uniform
    // samples against the buggy plain + EGG_ENDS - hatchesAt. The bug only
    // shows on the kind of bit pattern real division produces (growth is
    // elapsed time times a rate that is itself a division, GROWTH_PER_MS in
    // the worker), so it is swept for here on purpose: 286 mismatches in
    // 6123 division-shaped values above the hatch point, against the same
    // buggy formula, confirmed before this sweep was written.
    for (const d of [3, 6, 7, 11, 13, 0.75, 1.5, 2.4]) {
      for (let k = -50; k < 250; k++) values.push(k / d)
    }
    for (const plain of values) expect(hatchAdjusted(plain, 1)).toBe(plain)
  })

  it('meets itself at the boundary with no step', () => {
    for (const speed of [0.75, 1, 1.5, 2.4]) {
      const hatchesAt = EGG_ENDS / speed
      const justBelow = hatchAdjusted(hatchesAt - 1e-6, speed)
      const atOrAbove = hatchAdjusted(hatchesAt, speed)
      expect(Math.abs(justBelow - atOrAbove)).toBeLessThan(1e-4)
    }
  })

  it('scales below the hatch point and shifts by a constant above it', () => {
    const speed = 1.5
    const hatchesAt = EGG_ENDS / speed
    expect(hatchAdjusted(hatchesAt / 2, speed)).toBeCloseTo((hatchesAt / 2) * speed, 9)
    const above = hatchesAt + 10
    const offset = EGG_ENDS - hatchesAt
    expect(hatchAdjusted(above, speed)).toBeCloseTo(above + offset, 9)
  })

  it('treats a missing or mangled speed as "as it was", never as faster', () => {
    for (const bad of [0, -1, NaN, -Infinity]) expect(hatchAdjusted(42, bad)).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// Reading a market
// ---------------------------------------------------------------------------

describe('reading a market from its pledge list', () => {
  it('sums each egg from the pledges rather than from anything stored', () => {
    let market = emptyMarket(candidatesFor(10), 4)
    market = withPledge(market, pledge('@a', 0, 30))
    market = withPledge(market, pledge('@b', 0, 20))
    market = withPledge(market, pledge('@c', 1, 15))
    expect(totalsOf(market)).toEqual([50, 15, 0])
  })

  it('ignores a pledge with a corrupted egg index instead of letting it poison a total', () => {
    // Nothing in this file can write a pledge with a bad egg index through
    // checkPledge, but a row already in storage from a bug or a future
    // change should not be trusted blindly either.
    let market = emptyMarket(candidatesFor(11), 4)
    market = withPledge(market, pledge('@a', 0, 10))
    market = { ...market, pledges: [...market.pledges, pledge('@bad', 9, 500)] }
    expect(totalsOf(market)).toEqual([10, 0, 0])
  })

  it('breaks a tie toward the lower, cheaper index, so two screens cannot disagree', () => {
    let market = emptyMarket(candidatesFor(12), 4)
    market = withPledge(market, pledge('@a', 2, 40))
    market = withPledge(market, pledge('@b', 0, 40))
    expect(totalsOf(market)[0]).toBe(totalsOf(market)[2])
    expect(leadingEgg(market)).toBe(0)
  })

  it('never lets shortfall go negative once an egg is overshot', () => {
    let market = emptyMarket(candidatesFor(13), 2)
    const price = priceOf(0, 2)
    market = withPledge(market, pledge('@a', 0, price + 25))
    expect(shortfallOf(market, 0)).toBe(0)
  })

  it('reports the exact gap for an egg nowhere near funded', () => {
    let market = emptyMarket(candidatesFor(14), 2)
    market = withPledge(market, pledge('@a', 1, 10))
    expect(shortfallOf(market, 1)).toBe(priceOf(1, 2) - 10)
  })
})

// ---------------------------------------------------------------------------
// A pledge SETS a figure. It does not add one.
// ---------------------------------------------------------------------------

describe('a pledge sets a figure rather than adding one', () => {
  it('keeps exactly one row per person per egg however many times they change their mind', () => {
    // The old shape of this test topped a pledge up three times and checked
    // that a withdrawal cleared all three rows, because a stranded second row
    // was still counted toward the egg's total, still missing from its
    // owner's purse, and invisible to both of them. There are no longer three
    // rows to strand: the second pledge replaces the first, so the defect
    // cannot be built. Asserted as the row COUNT and not only as the total,
    // because three rows adding to the right number pass every sum in this
    // file.
    const actor = '@topper'
    let market = emptyMarket(candidatesFor(54), 3)
    market = withPledge(market, pledge(actor, 0, 20, 111))
    market = withPledge(market, pledge(actor, 0, 15, 222))
    market = withPledge(market, pledge(actor, 0, 7, 333))
    expect(rowsFor(market, actor, 0)).toHaveLength(1)
    expect(pledgedBy(market, actor)[0]).toBe(7)
    expect(purseOf(market, actor).coins).toBe(STARTING_PURSE - 7)
    // The same row, not a fresh one wearing the same name. The list is the
    // record of how the group got here and somebody adjusting their figure has
    // not just arrived, so the timestamp is the one they first moved at.
    expect(rowsFor(market, actor, 0)[0].at).toBe(111)
    market = withWithdrawal(market, actor, 0)
    expect(rowsFor(market, actor, 0)).toHaveLength(0)
    expect(purseOf(market, actor).coins).toBe(STARTING_PURSE)
    expect(checkWithdrawal(market, actor, 0)).toBe('nothing-pledged')
  })

  it('does not move somebody to the back of the queue for changing their figure', () => {
    // Who moved first is the only thing the order of this list records, and a
    // market screen that can say it is worth more than a shorter list.
    let market = emptyMarket(candidatesFor(55), 3)
    market = withPledge(market, pledge('@first', 0, 10, 1))
    market = withPledge(market, pledge('@second', 0, 10, 2))
    market = withPledge(market, pledge('@first', 0, 40, 3))
    expect(market.pledges.map((p) => p.actorId)).toEqual(['@first', '@second'])
    expect(market.pledges[0].coins).toBe(40)
    expect(market.pledges[0].at).toBe(1)
  })

  it('replaces only the row for the same person and the same egg', () => {
    // The narrow version of the same rule: one person on two eggs is two
    // rows, and two people on one egg is two rows. Only the pair matches.
    let market = emptyMarket(candidatesFor(56), 3)
    market = withPledge(market, pledge('@a', 0, 10))
    market = withPledge(market, pledge('@a', 1, 20))
    market = withPledge(market, pledge('@b', 0, 30))
    expect(market.pledges).toHaveLength(3)
    market = withPledge(market, pledge('@a', 0, 40))
    expect(market.pledges).toHaveLength(3)
    expect(pledgedBy(market, '@a')).toEqual([40, 20, 0])
    expect(pledgedBy(market, '@b')).toEqual([30, 0, 0])
    expect(totalsOf(market)).toEqual([70, 20, 0])
  })

  it('takes coins back off an egg when the figure is set to zero, with no ghost left behind', () => {
    // Zero is the whole of "I have changed my mind" on the wire now, and it
    // is the only message a slider ever needs to send. What must not survive
    // it is a row still counted toward the egg.
    const actor = '@zeroer'
    let market = emptyMarket(candidatesFor(57), 3)
    market = withPledge(market, pledge(actor, 1, 60, 9))
    expect(checkPledge(market, actor, 1, 0)).toBeNull()
    market = withPledge(market, pledge(actor, 1, 0, 10))
    expect(pledgedBy(market, actor)[1]).toBe(0)
    expect(totalsOf(market)[1]).toBe(0)
    expect(purseOf(market, actor).coins).toBe(STARTING_PURSE)
    expect(checkWithdrawal(market, actor, 1)).toBe('nothing-pledged')
  })
})

// ---------------------------------------------------------------------------
// Resolution: fires exactly when the leader reaches its price
// ---------------------------------------------------------------------------

/**
 * Put exactly `target` coins on one egg, spread over as many claimed members
 * as it takes, with every step run past checkPledge first.
 *
 * Written because no single purse can fund the middle or the fine egg at any
 * headcount, so a boundary test that put the whole price on one person was
 * asserting against a market no group could ever reach. Each person sets one
 * figure once, which is what the wire now carries.
 */
function fundTo(market: MarketState, egg: number, target: number): MarketState {
  let out = market
  let left = target
  let i = 0
  while (left > 0) {
    const actor = `@f${i}`
    const amount = left > STARTING_PURSE ? STARTING_PURSE : left
    expect(checkPledge(out, actor, egg, amount)).toBeNull()
    out = withPledge(out, pledge(actor, egg, amount, i))
    left -= amount
    i++
  }
  expect(totalsOf(out)[egg]).toBe(target)
  return out
}

describe('resolutionOf', () => {
  it('stays null one coin short of the price, and fires exactly at it, in both directions', () => {
    // The boundary a market lives or dies on. Checked from both sides rather
    // than trusting a single ">=" reads correctly, and across several
    // (egg, headcount) pairs so this is not one lucky arithmetic coincidence.
    // Prices under test: 75, 155, 235, 75 and 510.
    const cases: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
      [0, 8],
      [2, 8],
    ]
    for (const [egg, claimed] of cases) {
      const price = priceOf(egg, claimed)
      let market = emptyMarket(candidatesFor(20 + egg * 10 + claimed), claimed)
      market = fundTo(market, egg, price - 1)
      expect(resolutionOf(market)).toBeNull()
      // The last coin arrives the only way the wire can send it: the person
      // who moved last SETS their figure to one more than it was. Adding a
      // second row for the same person and egg is not a move that exists.
      const last = market.pledges[market.pledges.length - 1]
      expect(checkPledge(market, last.actorId, egg, last.coins + 1)).toBeNull()
      market = withPledge(market, pledge(last.actorId, egg, last.coins + 1, last.at))
      const resolution = resolutionOf(market)
      expect(resolution).not.toBeNull()
      expect(resolution?.egg).toBe(egg)
      expect(resolution?.spent).toBe(price)
      expect(resolution?.seed).toBe(market.candidates[egg])
      expect(resolution?.hatchSpeed).toBe(hatchSpeedOf(egg))
    }
  })

  it('never resolves an egg that is merely fully funded but not in front', () => {
    // Decision 2 working as designed: the money on the table is the vote, and
    // a funded egg that nobody wants more than another still waits. Not a
    // bug, but it is the property a naive "any egg at its price" check would
    // get wrong, so it is asserted here rather than only in the report.
    let market = emptyMarket(candidatesFor(30), 4)
    const plainPrice = priceOf(0, 4)
    market = withPledge(market, pledge('@a', 0, plainPrice))
    market = withPledge(market, pledge('@b', 1, plainPrice + 5))
    expect(leadingEgg(market)).toBe(1)
    expect(resolutionOf(market)).toBeNull()
  })

  it('spends exactly what is on the winning egg, overshoot included', () => {
    let market = emptyMarket(candidatesFor(31), 2)
    const price = priceOf(0, 2)
    market = withPledge(market, pledge('@a', 0, price + 17))
    expect(resolutionOf(market)?.spent).toBe(price + 17)
  })

  it('REPORTED DEFECT: lowering a figure on the leading egg still buys a different egg outright', () => {
    // FOUND BY THE MONEY WALK BELOW, NOT WRITTEN FROM THE SPEC, and it is the
    // half of the slider defect that making pledges absolute did not close.
    //
    // Deleting the intermediate state removed the case where a withdrawal
    // stood alone on the wire for a moment. It did not remove the mechanism
    // underneath it: resolutionOf asks which egg is IN FRONT and then whether
    // that egg is funded, so an egg sitting quietly above its own price while
    // a dearer egg leads is a purchase waiting for the leader to fall back.
    // Anybody lowering their figure on the leader fires it, checkPledge
    // answers null because the move is legitimate in every other way, and the
    // group gets a creature nobody chose. It is milder than what was fixed
    // (the coins that buy it were put on that egg deliberately, by people who
    // wanted it) and it is the same irreversible ending.
    //
    // The flat plain egg makes it far easier to reach. At 40 + 35 per member
    // the plain egg needed 216 on it before it could be lying in wait at five
    // claimed members; flat at 75 it needs 76.
    //
    // Pinned rather than asserted-away so it is visible in the one file that
    // is meant to know where the money is. DELETE THIS TEST when rules.ts
    // stops doing it: going red here is the correct signal that it was fixed.
    let market = emptyMarket(candidatesFor(32), 5)
    expect(priceOf(0, 5)).toBe(75)
    expect(priceOf(1, 5)).toBe(305)
    market = withPledge(market, pledge('@a', 0, 91))
    market = withPledge(market, pledge('@b', 0, 100))
    market = withPledge(market, pledge('@c', 1, 100))
    market = withPledge(market, pledge('@d', 1, 100))
    // Nothing is bought: the plain egg is past its price and the middle egg is
    // in front, which is the group wanting the middle one more.
    expect(totalsOf(market)).toEqual([191, 200, 0])
    expect(leadingEgg(market)).toBe(1)
    expect(resolutionOf(market)).toBeNull()

    // @c takes their coins off the egg they were backing. One message, no
    // intermediate state, and nobody touched the plain egg.
    expect(checkPledge(market, '@c', 1, 0)).toBeNull()
    market = withPledge(market, pledge('@c', 1, 0))

    const bought = resolutionOf(market)
    expect(bought?.egg).toBe(0)
    // And they paid 116 over the price of it, because the plain egg's total
    // was never checked against its price on any step it was not leading.
    expect(bought?.spent).toBe(191)
    expect((bought?.spent ?? 0) - priceOf(0, 5)).toBe(116)
  })
})

// ---------------------------------------------------------------------------
// checkPledge / checkWithdrawal: the refusal order is closed
// ---------------------------------------------------------------------------

describe('why a pledge is refused, and in what order', () => {
  it('answers closed first, even when every other reason also applies', () => {
    let market = emptyMarket(candidatesFor(40), 2)
    const price = priceOf(0, 2)
    market = withPledge(market, pledge('@a', 0, price))
    expect(resolutionOf(market)).not.toBeNull()
    // An unclaimed actor, a bad egg and a fractional coin count, all at once,
    // against a market that is already settled.
    expect(checkPledge(market, 'nobody', 99, 1.5)).toBe('closed')
  })

  it('answers unclaimed before it looks at the egg or the sum', () => {
    const market = emptyMarket(candidatesFor(41), 2)
    expect(checkPledge(market, 'nobody', 99, -3)).toBe('unclaimed')
  })

  it('answers no-such-egg before it looks at whether the sum makes sense', () => {
    const market = emptyMarket(candidatesFor(42), 2)
    expect(checkPledge(market, '@member', 99, -3)).toBe('no-such-egg')
  })

  it('answers not-a-sum for a fractional or negative amount, and lets zero through', () => {
    const market = emptyMarket(candidatesFor(43), 2)
    // 1000.5 is both non-integer and far past any purse; not-a-sum has to
    // win, or the app would show "too poor" for a typed-in decimal, which is
    // the wrong correction to ask somebody to make.
    expect(checkPledge(market, '@member', 0, 1000.5)).toBe('not-a-sum')
    expect(checkPledge(market, '@member', 0, -5)).toBe('not-a-sum')
    expect(checkPledge(market, '@member', 0, -0.5)).toBe('not-a-sum')
    expect(checkPledge(market, '@member', 0, NaN)).toBe('not-a-sum')
    expect(checkPledge(market, '@member', 0, Infinity)).toBe('not-a-sum')
    expect(checkPledge(market, '@member', 0, -Infinity)).toBe('not-a-sum')
    // Zero is a real answer and not a refusal, which is the half of this test
    // that changed. A pledge SETS the figure on an egg, so zero is how
    // somebody takes theirs back off it. Refusing it made coming down a
    // withdrawal followed by a smaller pledge, and the market between those
    // two messages could push a different egg into the lead and fund it.
    expect(checkPledge(market, '@member', 0, 0)).toBeNull()
  })

  it('answers too-poor last, once everything else about the request is legitimate', () => {
    const market = emptyMarket(candidatesFor(44), 2)
    expect(checkPledge(market, '@member', 0, STARTING_PURSE + 1)).toBe('too-poor')
    expect(checkPledge(market, '@member', 0, STARTING_PURSE)).toBeNull()
  })

  it('mirrors the same ordering for a withdrawal', () => {
    let market = emptyMarket(candidatesFor(45), 2)
    const price = priceOf(0, 2)
    const settled = withPledge(market, pledge('@a', 0, price))
    expect(checkWithdrawal(settled, 'nobody', 99)).toBe('closed')
    expect(checkWithdrawal(market, 'nobody', 99)).toBe('unclaimed')
    expect(checkWithdrawal(market, '@member', 99)).toBe('no-such-egg')
    expect(checkWithdrawal(market, '@member', 0)).toBe('nothing-pledged')
    market = withPledge(market, pledge('@member', 0, 10))
    expect(checkWithdrawal(market, '@member', 0)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The two ways of taking coins off an egg, and what the second one costs
// ---------------------------------------------------------------------------

/**
 * A market with a random legal spread of pledges on it, built the only way the
 * wire can build one: every figure set once, each move run past checkPledge
 * first and dropped if it is refused.
 *
 * The two dearer eggs only, for the reason the deep money walk gives further
 * down: the plain egg is 75 flat, so any walk allowed to touch it settles in a
 * handful of steps and never builds a market with several people's coins spread
 * over several eggs, which is the only state where this comparison says
 * anything.
 *
 * A move that would settle the market is skipped rather than stopped on. Both
 * ways of taking coins back answer 'closed' on a settled market, so a trial that
 * ended in a purchase would have contributed nothing to compare and would have
 * gone red on the first assertion instead: found that way, at trial 0.
 */
function spreadMarket(rngSeed: number, actorCount: number): { market: MarketState; actors: string[] } {
  const rand = mulberry32(rngSeed)
  const actors = Array.from({ length: actorCount }, (_, i) => `@s${rngSeed}-${i}`)
  let market = emptyMarket(candidatesFor(7000 + rngSeed * 3), actorCount)
  for (let step = 0; step < 24; step++) {
    const actor = actors[Math.floor(rand() * actorCount)]
    const egg = [1, 2][Math.floor(rand() * 2)]
    const amount = Math.floor(rand() * (STARTING_PURSE + 1))
    if (checkPledge(market, actor, egg, amount) !== null) continue
    const next = withPledge(market, pledge(actor, egg, amount, step))
    if (resolutionOf(next) === null) market = next
  }
  return { market, actors }
}

describe('a withdrawal and a pledge of zero', () => {
  it('leave a market every reader in rules.ts cannot tell apart, over a swept population', () => {
    // WHY THIS IS HERE: it is the evidence for deleting the `withdraw` message,
    // and it is stated as an equality rather than as an argument. The handler in
    // worker/monstertime.ts keeps that message alive for clients already
    // installed on people's phones, which cannot be true, because the market
    // screen and the message were built in the same unit and neither has been
    // deployed. The screen that exists sends a pledge of zero. So the question
    // that decides whether the path can go is whether the two states differ
    // anywhere a person can see, and this asks every reader in the file rather
    // than the two or three a spot check would pick.
    //
    // Measured over the population below: 60 markets, 454 (actor, egg) pairs
    // holding coins, and every one of them read identically by totalsOf,
    // pledgedBy, purseOf, leadingEgg, shortfallOf, resolutionOf, checkPledge and
    // checkWithdrawal, for every actor and every egg.
    let compared = 0
    for (let trial = 0; trial < 60; trial++) {
      const actorCount = 2 + (trial % 7) // sweeps 2..8
      const { market, actors } = spreadMarket(900 + trial, actorCount)
      // Every trial is an OPEN market with coins on it. A settled one refuses
      // both moves with 'closed' and would agree for the wrong reason, which is
      // the negative-test trap this file has paid for elsewhere.
      expect(resolutionOf(market)).toBeNull()
      expect(totalsOf(market)[1] + totalsOf(market)[2]).toBeGreaterThan(0)
      for (const actor of actors) {
        for (let egg = 0; egg < EGG_COUNT; egg++) {
          if (pledgedBy(market, actor)[egg] <= 0) continue
          // Both moves are legitimate on this market, which is what makes the
          // comparison one about outcomes rather than about refusals.
          expect(checkWithdrawal(market, actor, egg)).toBeNull()
          expect(checkPledge(market, actor, egg, 0)).toBeNull()
          const pulled = withWithdrawal(market, actor, egg)
          // A LATER TIMESTAMP ON PURPOSE. Setting a figure keeps the row's
          // original `at`, so the zeroed row is the one that person first moved
          // at either way, and passing a different one here proves the two
          // states are compared on what they mean and not on what was handed in.
          const zeroed = withPledge(market, pledge(actor, egg, 0, 9999))
          compared++

          expect(totalsOf(zeroed)).toEqual(totalsOf(pulled))
          expect(leadingEgg(zeroed)).toBe(leadingEgg(pulled))
          expect(resolutionOf(zeroed)).toEqual(resolutionOf(pulled))
          for (const who of actors) {
            expect(pledgedBy(zeroed, who)).toEqual(pledgedBy(pulled, who))
            expect(purseOf(zeroed, who)).toEqual(purseOf(pulled, who))
          }
          for (let e = 0; e < EGG_COUNT; e++) {
            expect(shortfallOf(zeroed, e)).toBe(shortfallOf(pulled, e))
            for (const who of actors) {
              expect(checkWithdrawal(zeroed, who, e)).toBe(checkWithdrawal(pulled, who, e))
              for (const coins of [0, 1, 25, STARTING_PURSE]) {
                expect(checkPledge(zeroed, who, e, coins)).toBe(checkPledge(pulled, who, e, coins))
              }
            }
          }
        }
      }
    }
    // The population is big enough to mean something, said with the margin out
    // loud: 454 pairs measured against 100, clear by 354.
    expect(compared).toBeGreaterThan(100)
  })

  it('differ by exactly one row, holding nothing, which is the whole of what removal costs', () => {
    // The other half of the same claim, and it has to be said or the test above
    // reads as "the two are identical", which is false. A withdrawal removes the
    // row; a pledge of zero leaves it there holding nothing. Everything that
    // reads a market skips it, the market screen skips a backer holding nothing,
    // and the purchase memory in src/dna/express.ts drops any pledge that is not
    // a whole number of coins above zero, so the surviving row reaches no
    // sentence anybody reads. Stated positively rather than as an absence: this
    // is the row, and this is what is in it.
    const actor = '@leaver'
    let market = emptyMarket(candidatesFor(7500), 3)
    market = withPledge(market, pledge(actor, 1, 40, 5))
    market = withPledge(market, pledge('@other', 1, 10, 6))

    const pulled = withWithdrawal(market, actor, 1)
    const zeroed = withPledge(market, pledge(actor, 1, 0, 9999))
    expect(pulled.pledges).toHaveLength(1)
    expect(zeroed.pledges).toHaveLength(2)
    expect(rowsFor(pulled, actor, 1)).toHaveLength(0)
    expect(rowsFor(zeroed, actor, 1)).toHaveLength(1)
    expect(rowsFor(zeroed, actor, 1)[0].coins).toBe(0)
    // And the row keeps the moment they first moved, not the moment they left,
    // which is the one place the two states hold different bytes.
    expect(rowsFor(zeroed, actor, 1)[0].at).toBe(5)

    // The only answer the withdrawal path gives that a zero pledge does not, and
    // it is the reason the message is worth a sentence before it goes: asked to
    // take back coins that are not there, checkWithdrawal says so and a pledge of
    // nothing onto an empty egg is simply allowed. No screen can reach either
    // one, because nothing on any screen sends a withdrawal.
    expect(checkWithdrawal(pulled, actor, 1)).toBe('nothing-pledged')
    expect(checkPledge(pulled, actor, 1, 0)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Nobody can pledge more than they hold
// ---------------------------------------------------------------------------

describe('nobody can pledge more than they hold', () => {
  it('refuses a pledge on one egg once earlier pledges on OTHER eggs used up the purse', () => {
    const actor = '@spender'
    let market = emptyMarket(candidatesFor(50), 3)
    market = withPledge(market, pledge(actor, 0, 60))
    market = withPledge(market, pledge(actor, 1, 40))
    expect(purseOf(market, actor).coins).toBe(0)
    expect(checkPledge(market, actor, 2, 1)).toBe('too-poor')
  })

  it('refuses one coin past the purse however the coins are spread across the three eggs', () => {
    const actor = '@spreader'
    let market = emptyMarket(candidatesFor(51), 3)
    market = withPledge(market, pledge(actor, 0, 33))
    market = withPledge(market, pledge(actor, 1, 33))
    market = withPledge(market, pledge(actor, 2, 33))
    expect(purseOf(market, actor).coins).toBe(STARTING_PURSE - 99)
    // What may go on egg 0 is what they hold PLUS what is already on it,
    // because setting a figure only spends the difference. Read as an
    // addition, this same move asks for 34 out of a purse of 1 and is refused,
    // which is how somebody who had put everything on one egg used to be told
    // they were too poor to spend money they had already spent on the very
    // thing they were spending it on.
    expect(checkPledge(market, actor, 0, 34)).toBeNull()
    expect(checkPledge(market, actor, 0, 35)).toBe('too-poor')
    market = withPledge(market, pledge(actor, 0, 34))
    expect(pledgedBy(market, actor)).toEqual([34, 33, 33])
    expect(purseOf(market, actor).coins).toBe(0)
    // Broke: every rise anywhere is refused, standing still is allowed
    // because it spends nothing, and coming down is always allowed.
    expect(checkPledge(market, actor, 1, 34)).toBe('too-poor')
    expect(checkPledge(market, actor, 1, 33)).toBeNull()
    expect(checkPledge(market, actor, 1, 0)).toBeNull()
  })

  it('frees exactly the right balance when a pledge is moved from one egg to another', () => {
    // Moving is one message down and one up now, not a withdrawal followed by
    // a re-pledge. The old shape of this test walked through the intermediate
    // state deliberately, and that state is the one that could buy a group an
    // animal nobody chose, so it is gone rather than guarded.
    //
    // Egg 1 rather than egg 0: the plain egg is 75 flat, so a whole purse on
    // it settles the market and every check after that answers 'closed'.
    const actor = '@mover'
    let market = emptyMarket(candidatesFor(52), 3)
    market = withPledge(market, pledge(actor, 1, STARTING_PURSE))
    expect(purseOf(market, actor).coins).toBe(0)
    expect(checkPledge(market, actor, 2, 1)).toBe('too-poor')
    expect(checkPledge(market, actor, 1, 0)).toBeNull()
    market = withPledge(market, pledge(actor, 1, 0))
    expect(purseOf(market, actor).coins).toBe(STARTING_PURSE)
    expect(pledgedBy(market, actor)[1]).toBe(0)
    // And no ghost of the old figure is left counting toward the egg's total,
    // which is the half a purse check on its own would not see.
    expect(totalsOf(market)[1]).toBe(0)
    expect(checkPledge(market, actor, 2, STARTING_PURSE)).toBeNull()
  })

  it('does not let a partial withdrawal on one egg refund coins still committed elsewhere', () => {
    const actor = '@partial'
    let market = emptyMarket(candidatesFor(53), 3)
    market = withPledge(market, pledge(actor, 0, 50))
    market = withPledge(market, pledge(actor, 1, 50))
    market = withWithdrawal(market, actor, 0)
    expect(purseOf(market, actor).coins).toBe(50)
    expect(checkPledge(market, actor, 2, 51)).toBe('too-poor')
    expect(checkPledge(market, actor, 2, 50)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Losing pledges return in full; the winner's are spent exactly
// ---------------------------------------------------------------------------

/**
 * What a correct server does the instant a market resolves: give back every
 * coin on the two eggs that did not win. rules.ts exposes no single "resolve"
 * call because the state that results (a group WITH a seed) is not a
 * MarketState any more, so a refund is simulated here with the same
 * withWithdrawal a live pledge screen uses to let somebody change their mind.
 * If this drifts from what the worker actually does at resolution, that is a
 * worker bug to find, not a reason to change this helper.
 */
function refundLosers(market: MarketState, winner: number): MarketState {
  let settled = market
  const actors = new Set(market.pledges.map((p) => p.actorId))
  for (const actor of actors) {
    for (let egg = 0; egg < EGG_COUNT; egg++) {
      if (egg !== winner && pledgedBy(settled, actor)[egg] > 0) settled = withWithdrawal(settled, actor, egg)
    }
  }
  return settled
}

describe("losing pledges return in full, the winner's are spent exactly", () => {
  it('returns every coin on the losing eggs and leaves only the winner behind', () => {
    let market = emptyMarket(candidatesFor(60), 4)
    market = withPledge(market, pledge('@a', 1, 5))
    market = withPledge(market, pledge('@b', 2, 12))
    market = withPledge(market, pledge('@a', 2, 8))
    const price = priceOf(0, 4)
    market = withPledge(market, pledge('@a', 0, 20))
    market = withPledge(market, pledge('@b', 0, price - 20))
    const resolution = resolutionOf(market)
    expect(resolution?.egg).toBe(0)

    const settled = refundLosers(market, 0)
    expect(totalsOf(settled)).toEqual([price, 0, 0])
    // @a had 5 on the loser and 20 on the winner: only the 20 is gone.
    expect(purseOf(settled, '@a').coins).toBe(STARTING_PURSE - 20)
    // @b had all of it on the winner, so nothing came back.
    expect(purseOf(settled, '@b').coins).toBe(STARTING_PURSE - (price - 20))
  })

  it('conserves money exactly across a resolution with several losing pledges from several people', () => {
    let market = emptyMarket(candidatesFor(61), 5)
    const actors = ['@a', '@b', '@c', '@d', '@e']
    // Everybody puts a little on the two losers first.
    for (const [i, actor] of actors.entries()) {
      market = withPledge(market, pledge(actor, 1, 3 + i))
      market = withPledge(market, pledge(actor, 2, 2 + i))
    }
    const price = priceOf(0, 5)
    // Then fund the plain egg to exactly its price, taken from each person in
    // turn out of whatever they have left after the losing pledges above.
    // Derived from priceOf rather than written down: a hard-coded split makes
    // this a test of one price, and it is meant to be a test of conservation.
    // Each share is that person's whole figure on this egg, set once, since a
    // second pledge from the same person would replace the first.
    let placed = 0
    for (const actor of actors) {
      const left = price - placed
      if (left <= 0) break
      const canSpend = purseOf(market, actor).coins
      const amount = left < canSpend ? left : canSpend
      if (amount <= 0) continue
      expect(checkPledge(market, actor, 0, amount)).toBeNull()
      market = withPledge(market, pledge(actor, 0, amount))
      placed += amount
    }
    expect(placed).toBe(price)

    const resolution = resolutionOf(market)
    expect(resolution).not.toBeNull()
    if (resolution === null) return
    const settled = refundLosers(market, resolution.egg)
    const heldAfter = actors.reduce((sum, a) => sum + purseOf(settled, a).coins, 0)
    expect(heldAfter + resolution.spent).toBe(actors.length * STARTING_PURSE)
  })
})

// ---------------------------------------------------------------------------
// MONEY IS CONSERVED
// ---------------------------------------------------------------------------

/**
 * CONFIRMED DEFECT, AND THE REASON THIS WALK IS REBUILT RATHER THAN EDITED.
 *
 * The walk that stood here asserted, after every step, that held coins plus
 * coins on the table equalled what the claimed members brought in. That is an
 * algebraic identity and not a property: purseOf is DEFINED as STARTING_PURSE
 * minus that actor's pledges, summed over exactly the rows totalsOf sums, so
 * the two sides are the same subtraction written twice and cannot disagree for
 * any pledge list whatsoever. Verified: it stayed green with the too-poor rule
 * deleted from checkPledge outright, and stayed green with actors holding
 * hundreds of coins less than nothing. The most important test in the file
 * could not fail, and the money a person would actually notice missing was
 * never being counted.
 *
 * It also could not have caught an illegal move, because the amount it drew
 * was taken from the purse it then checked against, so checkPledge was asked
 * only questions it was always going to say yes to.
 *
 * What it does now:
 *
 *   - proposes amounts drawn from PAST the purse, runs each through
 *     checkPledge, and REFUSES the illegal ones instead of applying them, so
 *     the rule is the thing under test rather than the generator
 *   - re-derives every actor's committed total straight from the raw pledge
 *     rows, independently of purseOf and pledgedBy, and makes the two readings
 *     agree, so a defect inside either cannot hide behind the other
 *   - asserts no actor ever holds fewer than zero coins, and nobody's total
 *     across the three eggs ever passes their purse
 *   - asserts at most one row per person per egg, which is what "a pledge
 *     sets" means said as a shape rather than as a sum
 *   - after resolution, asserts the winning egg's backers paid exactly what
 *     was on it, that it covered the price, and that every loser got every
 *     coin back
 */
interface WalkTally {
  resolved: boolean
  steps: number
  applied: number
  withdrawn: number
  tooPoor: number
  otherRefusals: number
  /** What the winning egg's backers paid above its price, or 0 if the walk
   *  never resolved. Reported rather than only bounded, because the first
   *  version of this walk asserted the overshoot was under one purse and the
   *  population disproved it in 48 trials. See the characterisation test above
   *  for what the counterexample turned out to be. */
  overshoot: number
}

/** One actor's committed coins, summed straight off the rows rather than
 *  through purseOf or pledgedBy. The independent reading: the identity that
 *  made the old walk unfailable was purseOf and totalsOf sharing a summation,
 *  so the check below owns its own. */
function rawPledged(market: MarketState, actorId: string): number {
  let sum = 0
  for (const p of market.pledges) if (p.actorId === actorId) sum += p.coins
  return sum
}

function runMoneyWalk(rngSeed: number, actorCount: number, steps: number, eggs: number[]): WalkTally {
  const rand = mulberry32(rngSeed)
  const actors = Array.from({ length: actorCount }, (_, i) => `@w${rngSeed}-${i}`)
  let market = emptyMarket(candidatesFor(1000 + rngSeed * 7), actorCount)
  const tally: WalkTally = {
    resolved: false,
    steps: 0,
    applied: 0,
    withdrawn: 0,
    tooPoor: 0,
    otherRefusals: 0,
    overshoot: 0,
  }

  const assertSound = (m: MarketState) => {
    let onTable = 0
    for (const actor of actors) {
      const raw = rawPledged(m, actor)
      // Nobody's total across all three eggs ever passes their purse.
      expect(raw).toBeLessThanOrEqual(STARTING_PURSE)
      const purse = purseOf(m, actor)
      // The two readings of the same fact, made to agree.
      expect(purse.pledged).toBe(raw)
      expect(purse.coins).toBe(STARTING_PURSE - raw)
      // Nobody ever holds less than nothing.
      expect(purse.coins).toBeGreaterThanOrEqual(0)
      onTable += raw
    }
    const totals = totalsOf(m)
    expect(totals[0] + totals[1] + totals[2]).toBe(onTable)
    const seen = new Set<string>()
    for (const p of m.pledges) {
      const key = `${p.actorId}:${p.egg}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      expect(Number.isInteger(p.coins)).toBe(true)
      expect(p.coins).toBeGreaterThanOrEqual(0)
    }
  }

  assertSound(market)

  for (let step = 0; step < steps; step++) {
    if (resolutionOf(market) !== null) break
    tally.steps++
    const actor = actors[Math.floor(rand() * actorCount)]
    const egg = eggs[Math.floor(rand() * eggs.length)]
    if (rand() < 0.2) {
      if (checkWithdrawal(market, actor, egg) === null) {
        market = withWithdrawal(market, actor, egg)
        tally.withdrawn++
      }
    } else {
      // Drawn from past a whole purse on purpose, so a fair share of these
      // moves are illegal and have to be turned away. A generator that only
      // ever proposes affordable amounts never asks the rules anything.
      const amount = Math.floor(rand() * (STARTING_PURSE + 21))
      const refusal = checkPledge(market, actor, egg, amount)
      if (refusal === null) {
        market = withPledge(market, pledge(actor, egg, amount, step))
        tally.applied++
      } else if (refusal === 'too-poor') {
        tally.tooPoor++
      } else {
        tally.otherRefusals++
      }
    }
    assertSound(market)
  }

  const resolution = resolutionOf(market)
  if (resolution !== null) {
    tally.resolved = true
    const price = priceOf(resolution.egg, actorCount)
    const stakes = new Map(actors.map((a) => [a, pledgedBy(market, a)[resolution.egg]]))
    const settled = refundLosers(market, resolution.egg)
    let paid = 0
    for (const actor of actors) {
      const stake = stakes.get(actor) ?? 0
      // Every coin on a losing egg is back and not one coin more: what this
      // person is left holding is their whole purse minus exactly what they
      // had behind the egg that won.
      expect(purseOf(settled, actor).coins).toBe(STARTING_PURSE - stake)
      paid += stake
    }
    expect(paid).toBe(resolution.spent)
    expect(totalsOf(settled)).toEqual(onlyOn(resolution.egg, resolution.spent))
    // The backers covered the price, and never paid more than the group has.
    //
    // The bound written here first was "the overshoot is under one purse,
    // because the step before it the egg was short and one person can raise a
    // total by at most 100". The population disproved it at 116 on the first
    // run, and the counterexample is the defect pinned above: the egg that
    // wins need not be the egg that just moved, so its total can have been
    // sitting past its price for any number of steps.
    expect(paid).toBeGreaterThanOrEqual(price)
    expect(paid).toBeLessThanOrEqual(actorCount * STARTING_PURSE)
    tally.overshoot = paid - price
  }
  return tally
}

describe('MONEY IS CONSERVED', () => {
  it('holds after every applied move and every refused one, over the three eggs, group sizes 2 through 8', () => {
    const TRIALS = 48
    const STEPS = 200
    let resolved = 0
    let tooPoor = 0
    let applied = 0
    let worstOvershoot = 0
    for (let trial = 0; trial < TRIALS; trial++) {
      const actorCount = 2 + (trial % 7) // sweeps 2..8
      const tally = runMoneyWalk(trial, actorCount, STEPS, [0, 1, 2])
      if (tally.resolved) resolved++
      tooPoor += tally.tooPoor
      applied += tally.applied
      if (tally.overshoot > worstOvershoot) worstOvershoot = tally.overshoot
    }
    // Measured across the whole population, not one trial: 48 of 48 resolved,
    // 715 pledges applied, 524 turned away as too-poor, and the worst
    // overshoot on a winning egg was 137 coins (see the reported defect in
    // resolutionOf above, which is where an overshoot that size comes from).
    // Resolution is quick here because the plain egg is 75 flat and one person
    // can close it on their own, which is exactly why the deeper walk below
    // leaves that egg out.
    expect(resolved).toBeGreaterThan(TRIALS / 2) // 48 measured against 24, clear by 24
    expect(applied).toBeGreaterThan(300) // 715 measured, clear by 415
    // The number that says the too-poor rule was exercised rather than merely
    // present. This is the assertion that goes red on its own the moment the
    // rule stops refusing anything, and it is stated with room: a walk that
    // drifted a little would not trip it, a walk that stopped refusing would.
    expect(tooPoor).toBeGreaterThan(200) // 524 measured, clear by 324
    // Recorded rather than bounded tightly. Per-trial the payment is already
    // checked against the group's whole money inside the walk.
    expect(worstOvershoot).toBeLessThan(8 * STARTING_PURSE)
  })

  it('holds across long walks on the two eggs no single purse can buy', () => {
    // A second population, and the reason it exists is the flat plain egg: at
    // 75 it is inside one purse, so any walk allowed to touch it settles
    // within a handful of steps and never builds a market with several
    // people's coins spread over several eggs. The middle and the fine need
    // more than one purse at every headcount, which is where the too-poor
    // rule actually lives, so the deep state is built over those two.
    const TRIALS = 40
    const STEPS = 400
    let resolved = 0
    let tooPoor = 0
    let steps = 0
    let worstOvershoot = 0
    for (let trial = 0; trial < TRIALS; trial++) {
      const actorCount = 2 + (trial % 7) // sweeps 2..8
      const tally = runMoneyWalk(500 + trial, actorCount, STEPS, [1, 2])
      if (tally.resolved) resolved++
      tooPoor += tally.tooPoor
      steps += tally.steps
      if (tally.overshoot > worstOvershoot) worstOvershoot = tally.overshoot
    }
    // Measured across the population: 22 of 40 resolved, 10,922 steps taken,
    // 3286 too-poor refusals and a worst overshoot of 51. That refusal count
    // is six times what the all-three-eggs walk reaches, which is the whole
    // point of running this second one.
    //
    // Resolution asserted at a QUARTER and not at half, with the margin said
    // out loud: 22 of 40 sits only two clear of half, and a threshold a
    // harmless change can trip is a threshold somebody eventually deletes.
    // Whether a trial resolves here is mostly group size, not luck: two people
    // over the middle egg need 155 of their 200, while eight need 455 of 800
    // spread the same way, and a random walk rarely lines eight people up.
    expect(resolved).toBeGreaterThan(TRIALS / 4) // 22 measured against 10, clear by 12
    expect(steps).toBeGreaterThan(4000) // 10,922 measured, clear by 6922
    expect(tooPoor).toBeGreaterThan(1200) // 3286 measured, clear by 2086
    expect(worstOvershoot).toBeLessThan(8 * STARTING_PURSE)
  })
})

// ---------------------------------------------------------------------------
// Each egg is shown in the colour it will actually hatch as
// ---------------------------------------------------------------------------

/**
 * One egg's hide, read here rather than taken off the EggLook.
 *
 * EggLook used to carry an `hsl` field and this suite used to read it. Nothing
 * else ever did: it was computed for every egg on every market screen and had
 * no reader on any player path, which is the shape of dead code this repo has
 * already shipped twice. Reading it here instead is also the better test, for
 * the reason rawPledged exists further up this file: the assertions below are
 * about the colour AGREEING with paletteFor, and a reading handed over by the
 * thing under test cannot disagree with itself.
 */
function hideOf(seed: string): { h: number; s: number; l: number; hex: string } {
  const hsl = { h: 0, s: 0, l: 0 }
  const base = paletteFor(seed, emptySubstance()).base
  base.getHSL(hsl)
  return { h: hsl.h, s: hsl.s, l: hsl.l, hex: `#${base.getHexString()}` }
}

/**
 * Which of the four hide anchors this seed was drawn off.
 *
 * The first draw of paletteForSeed's own stream, repeated here rather than
 * exported, because what is wanted is the anchor INDEX and materials.ts has no
 * reason to hand that out to anybody. Coupled to that one line by construction:
 * if the anchor draw there moves, this reads the wrong number and the anchor
 * rate below moves with it, which is a visible failure rather than a silent one.
 */
function anchorOf(seed: string): number {
  const rand = seededRandom('palette:' + seed)
  return Math.floor(rand() * 4) % 4
}

/** The half of an egg's name before the comma, which is the colour half. */
function colourWordOf(name: string): string {
  return name.split(',')[0]
}

/** The hue band inside a colour word, which is always its last token, whether
 *  the word came from colourName ("dark vivid red") or from the market's own
 *  comparative ("paler red"). */
function bandOf(word: string): string {
  const parts = word.split(' ')
  return parts[parts.length - 1]
}

const COMPARATIVES = ['darker', 'paler', 'duller', 'richer']

function comparativeIn(word: string): string | null {
  const first = word.split(' ')[0]
  return COMPARATIVES.includes(first) ? first : null
}

// eggLook IS GONE AND THESE TESTS ASK eggsOnOffer INSTEAD. It went the way
// openMarket and eggTerms went earlier in this file: nothing on a player's path
// called it, the app draws its three cards from eggsOnOffer (src/ui/Market.tsx),
// no screen has ever shown one egg on its own, and the only callers it had
// anywhere were the five here. The previous note in this spot said exactly that
// and then kept it anyway, which is how the other two survived as long as they
// did.
//
// Three of the five had a real property in them and now state it over the path a
// person is actually on: the same market described twice is described the same
// way, the price and the hatch speed are rules.ts's own, and an egg's colour
// comes from its candidate seed and not from where it sits or how many people
// have claimed. The fourth, "a lone egg never carries a comparative", is a
// statement about colourWords and is asserted 41,413 times over further down, in
// "keeps the Beastpedia's own word for every egg that has its hue band to
// itself", so it is not restated here in a weaker form.
describe('eggsOnOffer', () => {
  it('is the identical price and hatch speed rules.ts would give the same egg', () => {
    // The one thing worth re-checking here even though index.ts only calls
    // through: this is exactly the seam the last fleet lost a feature on, a
    // number agreeing between two files until one of them was edited. A
    // direct comparison catches a re-implementation, not just a typo.
    const market = emptyMarket(candidatesFor(70), 6)
    for (const look of eggsOnOffer(market)) {
      expect(look.price).toBe(priceOf(look.egg, market.claimed))
      expect(look.hatchSpeed).toBe(hatchSpeedOf(look.egg))
    }
  })

  it('is deterministic: the same market always produces the same three looks', () => {
    // Asked of the whole screen rather than of one egg, which is the stronger
    // claim as well as the reachable one: the colour words are decided across
    // the three at once and the shell, weight and feel words are drawn against a
    // shared taken set, so this is where a stray bit of ambient state would
    // show up.
    for (let i = 0; i < 40; i++) {
      const market = emptyMarket(candidatesFor(2000 + i * 3), 5)
      expect(JSON.stringify(eggsOnOffer(market))).toBe(JSON.stringify(eggsOnOffer(market)))
    }
  })

  it('always gives three eggs on one screen three different full names', () => {
    // Structural, not probabilistic: pick() steps around a taken set of at
    // least 12 shells for 3 draws, so a collision here can only mean the
    // dedup got lost, not bad luck. Asserted as a hard invariant across a
    // population rather than trusted from one screen.
    const TRIALS = 300
    let allDistinct = 0
    for (let i = 0; i < TRIALS; i++) {
      const market = emptyMarket(candidatesFor(3000 + i * 3), 4)
      const names = eggsOnOffer(market).map((e) => e.name)
      if (new Set(names).size === 3) allDistinct++
    }
    expect(allDistinct).toBe(TRIALS)
  })

  it("derives an egg's colour from its own candidate seed alone, not from its index or the headcount", () => {
    // The same seed put in the cheapest slot of a market of two and in the
    // dearest slot of a market of nine, with two different seeds either side of
    // it both times. The swatch is the hide the creature hatches with, so it may
    // not move for where the egg sits on the screen or for how many people have
    // claimed, and it may not move for who its neighbours are: the colour WORD
    // is decided across the three, and the colour itself never is.
    const seed = seedFor(5000)
    const first = eggsOnOffer(emptyMarket([seed, seedFor(5001), seedFor(5002)], 2))
    const last = eggsOnOffer(emptyMarket([seedFor(5003), seedFor(5004), seed], 9))
    expect(first[0].colour).toBe(last[2].colour)
    expect(first[0].colour).toBe(hideOf(seed).hex)
  })
})

// ---------------------------------------------------------------------------
// THREE EGGS, THREE COLOUR WORDS, AND THE SAME THREE COLOURS AS BEFORE
// ---------------------------------------------------------------------------

/**
 * How close two hides have to be to read as one colour on a 375px card.
 *
 * Hue, saturation and lightness all inside these, which is a band and not a
 * distance because that is the shape of the thing: two eggs a long way apart in
 * hue are two colours however close their lightness is. Chosen by sweeping and
 * pinning where the rate stops moving fast: 0.035/0.12/0.07 gives 22.39%,
 * 0.04/0.12/0.07 gives 24.59%, 0.04/0.12/0.08 gives 26.68%, over the same 20,000
 * markets. The middle one is the figure quoted below.
 */
const ONE_COLOUR: [number, number, number] = [0.04, 0.12, 0.07]

function readsAsOneColour(
  a: { h: number; s: number; l: number },
  b: { h: number; s: number; l: number },
): boolean {
  // Hue wraps, so red at 0.99 and red at 0.01 are 0.02 apart and not 0.98.
  const dh = Math.abs(((((a.h - b.h) % 1) + 1.5) % 1) - 0.5)
  return dh < ONE_COLOUR[0] && Math.abs(a.s - b.s) < ONE_COLOUR[1] && Math.abs(a.l - b.l) < ONE_COLOUR[2]
}

const COLOUR_TRIALS = 20_000

/** The three eggs of one market, with the hide behind each read independently
 *  and the word colourName ALONE would have given it, which is the word the
 *  market carried before the comparatives went in. */
function marketColours(i: number): {
  words: string[]
  plain: string[]
  bands: string[]
  hides: { h: number; s: number; l: number; hex: string }[]
  colours: string[]
} {
  const market = emptyMarket(candidatesFor(100000 + i * 3), 4)
  const eggs = eggsOnOffer(market)
  const hides = market.candidates.map(hideOf)
  const plain = hides.map((hide) => colourName(hide.h, hide.s, hide.l))
  return {
    words: eggs.map((e) => colourWordOf(e.name)),
    plain,
    bands: plain.map(bandOf),
    hides,
    colours: eggs.map((e) => e.colour),
  }
}

describe('three eggs are never called the same colour', () => {
  it('gives the three eggs three different colour words, where a third of markets used to give two of them one word', () => {
    // THE CONFIRMED DEFECT AND ITS FIX, BOTH COUNTED IN THE SAME LOOP, so this
    // test states what was wrong as well as what is right and cannot be read as
    // a rule that was always true.
    //
    // Measured over 20,000 markets. Before: 7351 of them, 36.76%, showed two
    // eggs carrying the identical colour word. After: 0. The word is the load
    // bearing half of the name, so this was two eggs that a group could not
    // tell apart out loud at the one moment they are looking hardest.
    //
    // Zero is structural rather than lucky. Two eggs in one hue band are given
    // a comparative apiece and three are given two and a bare band, so within a
    // band the words differ by construction, and across bands they differ
    // because the bands do.
    //
    // THE ONE PATH THAT COULD PUT A NUMBER BACK IN HERE is colourWords refusing
    // to speak: two eggs equal to the bit in both lightness and saturation have
    // no true comparative between them, so they keep colourName's plain words
    // and may share one. That refusal did not fire once in these 20,000
    // markets, and this counter is where it would show up if the palette ever
    // starts producing hides that close together.
    let identical = 0
    let identicalPlain = 0
    for (let i = 0; i < COLOUR_TRIALS; i++) {
      const { words, plain } = marketColours(i)
      if (new Set(words).size < 3) identical++
      if (new Set(plain).size < 3) identicalPlain++
    }
    expect(identical).toBe(0)
    // And the defect is still there in colourName's own answer, which is what
    // makes the fix worth its lines. Bounded loosely on both sides on purpose:
    // near zero would mean the palette or the hue bands had moved far enough
    // that this feature is solving a problem that no longer exists, and that is
    // a change to look at rather than to absorb quietly.
    expect(identicalPlain).toBeGreaterThan(4000) // 7351 measured, clear by 3351
    expect(identicalPlain).toBeLessThan(14000) // 7351 measured, clear by 6649
  })

  it('did not move a single colour to do it', () => {
    // THE ONE THING THIS SCREEN MAY NEVER DO. The swatch is the hide the
    // creature hatches with, and a market that shows a colour the creature does
    // not have is a screen lying to a group about the animal they are buying,
    // which they find out about the moment it hatches. So the fix went into the
    // words and nowhere near paletteFor, and this is the assertion that says so:
    // every one of the 60,000 swatches is the exact hex paletteFor gives that
    // seed, character for character.
    //
    // The two rates underneath are the ones a colour change WOULD have moved,
    // pinned so that a later "small palette tidy" cannot pass through here
    // unnoticed. Measured over the same 20,000 markets: 12,468 of them (62.34%)
    // have two eggs off the same one of the four hide anchors, and 4917
    // (24.59%) have two close enough to read as one colour. Both are properties
    // of src/forge/materials.ts and neither moved by a single market.
    let swatches = 0
    let sameAnchor = 0
    let oneColour = 0
    let oneColourAndOneWord = 0
    for (let i = 0; i < COLOUR_TRIALS; i++) {
      const { words, hides, colours } = marketColours(i)
      for (let k = 0; k < 3; k++) if (colours[k] === hides[k].hex) swatches++
      const market = emptyMarket(candidatesFor(100000 + i * 3), 4)
      if (new Set(market.candidates.map(anchorOf)).size < 3) sameAnchor++
      let close = false
      for (let a = 0; a < 3; a++) {
        for (let b = a + 1; b < 3; b++) if (readsAsOneColour(hides[a], hides[b])) close = true
      }
      if (close) {
        oneColour++
        if (new Set(words).size < 3) oneColourAndOneWord++
      }
    }
    expect(swatches).toBe(COLOUR_TRIALS * 3)
    expect(sameAnchor).toBe(12468) // 62.34%, and it is exact because nothing here touches colour
    expect(oneColour).toBe(4917) // 24.59%, likewise
    // The half of that which the words CAN fix, and did. 3635 of those 4917
    // markets, 18.18% of all of them, used to show two eggs that looked like one
    // colour AND were called the same thing. Now none of them are: two eggs can
    // still be near enough to one another to need looking at twice, and a person
    // reading the cards is now told which is which.
    expect(oneColourAndOneWord).toBe(0)
  })

  it("keeps the Beastpedia's own word for every egg that has its hue band to itself", () => {
    // Why the comparative replaces the word rather than being bolted onto every
    // egg: this is the word the creature's entry will use once it hatches, and
    // two screens naming one animal differently is its own defect. Measured over
    // 20,000 markets: 41,413 of the 60,000 eggs, 69.02%, have their band to
    // themselves, and all 41,413 carry colourName's answer unchanged. Only an
    // egg that actually has to be told apart from a sibling trades its
    // qualifiers for the comparative.
    let alone = 0
    let agreeing = 0
    for (let i = 0; i < COLOUR_TRIALS; i++) {
      const { words, plain, bands } = marketColours(i)
      for (let k = 0; k < 3; k++) {
        if (bands.filter((b) => b === bands[k]).length > 1) continue
        alone++
        if (words[k] === plain[k]) agreeing++
        // And an egg with nobody to compare against never carries a comparative,
        // which is the other half of the same rule: the word claims a sibling
        // exists, so it may only appear where one does.
        expect(comparativeIn(words[k])).toBeNull()
      }
    }
    expect(alone).toBe(41413)
    expect(agreeing).toBe(alone)
  })

  it('only ever says darker, paler, duller or richer in the direction that is actually true', () => {
    // THE HONESTY GATE, and it is written against the CLAIM rather than against
    // the rule that produced it. It does not re-derive which axis index.ts chose
    // or which order it sorted on: it reads the word the market actually put on
    // the card and checks the thing that word says about the hide. A test that
    // re-ran the algorithm would agree with a broken algorithm, which is how a
    // grounded value gets wired backwards and stays green.
    //
    // IT EARNED THAT ON ITS FIRST RUN. jitter() in src/forge/materials.ts clamps
    // lightness into [0.12, 0.86], so hides nudged past the stop land exactly on
    // it and two eggs can share a lightness to the bit. The first version of
    // colourWords picked its axis on the spread across the whole group, called
    // the lower of two eggs sitting on 0.12 the darker one, and this went red at
    // "expected 0.12 to be less than 0.12". A test that had re-derived the rule
    // would have made the same mistake twice and passed.
    //
    // Measured over 20,000 markets: 8967 of them (44.84%) put a comparative on
    // at least one egg, 653 (3.27%) had all three eggs in one band, and 0 of the
    // resulting claims pointed the wrong way.
    let markets = 0
    let claims = 0
    let bare = 0
    for (let i = 0; i < COLOUR_TRIALS; i++) {
      const { words, hides, bands } = marketColours(i)
      let used = false
      for (let k = 0; k < 3; k++) {
        const said = comparativeIn(words[k])
        const shared = bands.filter((b) => b === bands[k]).length > 1
        if (said === null) {
          // Either colourName's own answer, where this egg has its band to
          // itself, or the bare band with no claim attached to it, where three
          // eggs share one and the middle has nothing to be the darker of.
          if (shared) {
            bare++
            expect(words[k]).toBe(bands[k])
          }
          continue
        }
        used = true
        claims++
        expect(bandOf(words[k])).toBe(bands[k])
        for (let other = 0; other < 3; other++) {
          if (other === k || bands[other] !== bands[k]) continue
          if (said === 'darker') expect(hides[k].l).toBeLessThan(hides[other].l)
          if (said === 'paler') expect(hides[k].l).toBeGreaterThan(hides[other].l)
          if (said === 'duller') expect(hides[k].s).toBeLessThan(hides[other].s)
          if (said === 'richer') expect(hides[k].s).toBeGreaterThan(hides[other].s)
        }
      }
      if (used) markets++
    }
    expect(markets).toBe(8967) // 44.84%
    expect(claims).toBe(2 * markets) // exactly two per band that collided, never one
    expect(bare).toBe(653) // 3.27%: three eggs in one band, and the middle claims nothing
  })

  it('names a difference big enough to be worth naming, and says how big when it is not', () => {
    // The residual, stated rather than hidden. A comparative is true whatever
    // the gap, and a gap of 0.0003 in lightness is true and invisible. The axis
    // is picked to make this as large as it can honestly be: lightness unless
    // the eggs are inside 0.02 of each other on it or sitting on the same clamp
    // stop, in which case saturation, which fires on 1998 of the 8967 colliding
    // bands (22.28%).
    //
    // Measured over 20,000 markets, the gap the word names: 0.0003 at the
    // smallest, 0.0057 at the first percentile, 0.0251 at the tenth and 0.0631
    // at the median, against a jitter that spans 0.16 in lightness and 0.24 in
    // saturation. So the typical comparative names about a third of the whole
    // range and the worst one names nothing anybody can see. That worst case
    // cannot be fixed from this file: it is two eggs the palette drew almost on
    // top of each other, and moving either of them is the one thing forbidden
    // here. What the word still buys in that case is a name a group can say.
    const gaps: number[] = []
    for (let i = 0; i < COLOUR_TRIALS; i++) {
      const { words, hides, bands } = marketColours(i)
      for (const band of new Set(bands)) {
        const group: number[] = []
        for (let k = 0; k < 3; k++) if (bands[k] === band) group.push(k)
        if (group.length < 2) continue
        const said = group.map((k) => comparativeIn(words[k])).filter((c) => c !== null)
        const onLight = said.includes('darker') || said.includes('paler')
        const read = (k: number): number => (onLight ? hides[k].l : hides[k].s)
        const values = group.map(read)
        gaps.push(Math.max(...values) - Math.min(...values))
      }
    }
    gaps.sort((a, b) => a - b)
    const at = (q: number): number => gaps[Math.floor(q * (gaps.length - 1))]
    // The median, with the margin said out loud rather than left to a bare pass:
    // 0.0631 measured against 0.03, clear by 0.0331.
    expect(at(0.5)).toBeGreaterThan(0.03)
    // And the tail is recorded rather than bounded near where it sits, because
    // where it sits is a property of the palette and not of this file. 0.0057
    // measured at the first percentile.
    expect(at(0.01)).toBeGreaterThan(0.001)
    expect(gaps.length).toBe(8967)
  })
})
