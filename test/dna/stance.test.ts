// Gates stance.ts: the pose an idle creature holds, read off the same
// pressures the traits are read from.
//
// deriveStance takes Pressures and nothing else, so most of this file builds
// pressures directly with pushOf rather than going through a whole
// deriveCreature, which keeps each test about the one function under test. A
// handful of tests go through deriveCreature anyway, because the wiring
// between the two (does the field on Creature actually come from this
// function) is exactly the kind of thing that stays green in isolation and
// silently breaks in composition.

import { describe, expect, it } from 'vitest'
import { deriveCreature, deriveStance, emptyPressures, pushOf, rollGenome } from '../../src/dna'
import { ACTION_KINDS, PRESSURE_AXES } from '../../src/core/types'
import type { ActionRecord, Pressures, Stance } from '../../src/core/types'
import { ACTION_VARIANTS } from '../../src/dna'
import { action, committedLog, habitLog, oneButtonLog, seedFor } from '../helpers'

function pressuresFromLog(log: ActionRecord[]): Pressures {
  const pressures = emptyPressures()
  for (const row of log) {
    const push = pushOf(row.variantId, row.methodId)
    for (const axis of PRESSURE_AXES) {
      const amount = push[axis]
      if (amount !== undefined) pressures[axis] += amount
    }
  }
  return pressures
}

// Every variant in the catalogue, cycled evenly. This is the log a group that
// truly does a bit of everything would produce, and stance.ts's own header
// comment measures its lean at +0.005: comfortably under LEAN_MIN.
function evenLog(n: number): ActionRecord[] {
  const out: ActionRecord[] = []
  for (let i = 0; i < n; i++) out.push(action(i, ACTION_VARIANTS[i % ACTION_VARIANTS.length].id, 'ann'))
  return out
}

describe('deriveStance is a pure read of the pressures, and nothing else', () => {
  it('gives the same pose for the same pressures object, called twice', () => {
    const pressures = pressuresFromLog(oneButtonLog(10, 'sing.humDusk'))
    expect(deriveStance(pressures)).toBe(deriveStance(pressures))
  })

  it('gives the same pose for two different genomes fed the identical log', () => {
    // Traits and morphs are allowed to differ across genomes fed the same log,
    // because they also read the carried alleles. The pose is not supposed to:
    // it reads the pressures alone, so two groups who behaved identically must
    // be standing the same way even though they carry different alleles
    // underneath.
    const log = habitLog(80, 'train')
    const a = deriveCreature(rollGenome(seedFor(20)), log, null)
    const b = deriveCreature(rollGenome(seedFor(21)), log, null)
    expect(a.pressures).toEqual(b.pressures)
    expect(a.stance).toBe(b.stance)
  })

  it('is wired through deriveCreature exactly as calling deriveStance directly would read it', () => {
    // The seam most likely to rot quietly: deriveCreature could stop calling
    // this function, or call it on the wrong pressures object (an actor's
    // contribution instead of the group total, say), and nothing about the
    // shape of Creature would complain.
    const genome = rollGenome(seedFor(22))
    const log = habitLog(60, 'sing')
    const creature = deriveCreature(genome, log, null)
    expect(creature.stance).toBe(deriveStance(creature.pressures))
  })

  it('repeats identically on a second derivation of the same log', () => {
    const genome = rollGenome(seedFor(23))
    const log = habitLog(40, 'give')
    const first = deriveCreature(genome, log, null).stance
    const second = deriveCreature(genome, log, null).stance
    expect(second).toBe(first)
  })
})

describe('reads straight off a single obvious habit', () => {
  // One variant each, chosen so the leading axis in its push is unambiguous
  // (no other axis in the push is within striking distance of it), and picked
  // to cover every entry in STANCE_FOR at least once, including both axes that
  // answer to the same pose (nourish and craft both land on nosing; vigor and
  // ferocity both land on squaring, exercised separately below).
  const CASES: Array<{ variantId: string; want: Stance; because: string }> = [
    { variantId: 'feed.emberfruit', want: 'nosing', because: 'nourish leads (3 against 1 and 1)' },
    { variantId: 'give.riverStone', want: 'nosing', because: 'craft leads (2.5 against 1 and 1.5), the OTHER axis nosing answers to' },
    { variantId: 'train.sparPadded', want: 'squaring', because: 'ferocity leads (3 against 2 and 0.5)' },
    { variantId: 'train.liftStones', want: 'squaring', because: 'vigor leads (3 against 1.5 and 0.5), the OTHER axis squaring answers to' },
    { variantId: 'explore.riverbank', want: 'scenting', because: 'roam leads (2.5 against 1.5 and 1)' },
    { variantId: 'sing.humDusk', want: 'listening', because: 'resonance leads (3 against 1.5 and 0.5)' },
    { variantId: 'tend.brushDown', want: 'leaning', because: 'bond leads (2.5 against 1.5 and 1)' },
    { variantId: 'tend.sitNearby', want: 'curled', because: 'stillness leads (3 against 2)' },
  ]

  for (const { variantId, want, because } of CASES) {
    it(`${variantId} reads as ${want}, because ${because}`, () => {
      const pressures = pressuresFromLog(oneButtonLog(6, variantId))
      expect(deriveStance(pressures)).toBe(want)
    })
  }

  it('a group that does everything evenly is standing, and that is the honest answer, not a fallback', () => {
    const pressures = pressuresFromLog(evenLog(ACTION_VARIANTS.length * 8))
    expect(deriveStance(pressures)).toBe('standing')
  })
})

describe('the pose changes when the group changes what it does', () => {
  it('moves from one pose to a genuinely different one when a group swaps habits', () => {
    const genome = rollGenome(seedFor(24))
    const trained = deriveCreature(genome, habitLog(80, 'train'), null).stance
    const sung = deriveCreature(genome, habitLog(80, 'sing'), null).stance
    expect(trained).toBe('squaring')
    expect(sung).toBe('listening')
    expect(trained).not.toBe(sung)
  })
})

describe('a population of realistic groups spreads across more than one pose', () => {
  // Committed logs at a spread of shares, crossed with every kind, stand in for
  // "realistic groups": some lean lightly, some are one-button households. This
  // is the sweep the histogram below is measured over, and the histogram is a
  // finding worth reporting on its own, not just a pass/fail.
  const SHARES = [0.6, 0.75, 0.9, 1.0]

  it('reaches at least half the catalogue of poses rather than collapsing onto one or two', () => {
    const histogram: Record<string, number> = {}
    let n = 0
    for (const kind of ACTION_KINDS) {
      for (const share of SHARES) {
        const pressures = pressuresFromLog(committedLog(200, kind, share))
        const stance = deriveStance(pressures)
        histogram[stance] = (histogram[stance] ?? 0) + 1
        n++
      }
    }
    // Reported rather than hidden: a pose this sweep never reaches is dead
    // content, and that is a real finding about the catalogue, not a reason to
    // loosen this test.
    // eslint-disable-next-line no-console
    console.log('stance histogram over committed groups (kind x share):', JSON.stringify(histogram), 'n =', n)

    const distinctPoses = Object.keys(histogram).length
    expect(distinctPoses).toBeGreaterThanOrEqual(4)

    const worst = Math.max(...Object.values(histogram))
    expect(worst / n).toBeLessThan(0.8)
  })
})
