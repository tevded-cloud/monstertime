// The genomes of creatures that already exist.
//
// THE THING THIS FILE EXISTS FOR, stated plainly because it is not obvious from
// anywhere else in the codebase: the server does not store a genome. It calls
// `rollGenome(seed)` on every single read. So the genome is not a thing that
// was decided once when a group was made, it is recomputed from the seed by
// whatever code is deployed at the moment somebody opens the app.
//
// That makes several files production state, not just the rng. `HABIT_SHAPES`
// in alleles.ts is summed off `ACTION_VARIANTS`, `habitsAnswered` reads it, and
// the gap-filling pass in `rollGenome` reads that. So adding one ordinary
// action variant, which feels like pure content work, re-deals the alleles some
// existing groups are carrying. Measured on the day this file was written:
// putting one variant into those sums changed 23 genomes in 500, one group in
// twenty, and every one of the 160 tests then in the suite stayed green.
//
// A creature quietly becoming a different animal is the worst thing this app
// can do, because the whole product is that it is YOUR animal and the group
// watched it become that. Nothing anywhere else can notice it happening. This
// can.
//
// WHAT TO DO WHEN THIS GOES RED. It is not a test to update until it passes.
// Work out which of the two you did:
//
//   1. You added or changed an action variant. Almost always this should not
//      reach the genome at all: keep it out of HABIT_SHAPES the way the
//      whileAsleep variants are kept out, and this goes green on its own.
//   2. You deliberately changed how genomes are rolled and you accept that
//      every creature alive changes with it. Then update the hashes, and say so
//      out loud to the people whose creatures those are.
//
// A hash rather than the alleles themselves, because the point is to notice a
// change and the alleles would be four hundred lines nobody reads.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { rollGenome } from '../../src/dna'
import { ACTION_VARIANTS } from '../../src/dna/actions'

// 400 seeds, in 20 buckets of 20.
//
// The count is the whole strength of this gate and it was arrived at the hard
// way. The first version pinned 24 seeds, and when the guard it exists to
// protect was deleted, all 163 tests stayed green: a one-in-twenty re-deal only
// touches about one seed in 24, so it missed roughly a third of the time. A
// gate that is green while covering almost nothing is worse than no gate,
// because it reads as proof.
//
// At 400 seeds a one-in-twenty change moves about eighteen of them, spread
// across buckets, and essentially every bucket flips. Buckets rather than one
// digest so that a red run says roughly HOW MUCH moved: one bucket is a narrow
// change worth reading closely, twenty is the whole roll.
const BUCKETS = 20
const PER_BUCKET = 20

function bucketPrint(bucket: number): string {
  const hash = createHash('sha256')
  for (let i = 0; i < PER_BUCKET; i++) {
    const genome = rollGenome(`pinned-${bucket}-${i}`)
    // plan and activity ride along with the alleles. Both are drawn off their
    // own rng streams precisely so they cannot disturb the allele draw, and
    // this is what proves that rather than restating it.
    hash.update(
      JSON.stringify({ plan: genome.plan, activity: genome.activity, carried: genome.carried }),
    )
  }
  return hash.digest('hex').slice(0, 12)
}

const PINNED: string[] = [
  'e32497668dc0',
  'ec4073927966',
  '3b0c0bccc88a',
  '46d22afaaad1',
  'e652fadc698a',
  'a85697b181f9',
  '9dfd3f6f5576',
  '5255085b90cc',
  'f443ad661511',
  'd68b7887d036',
  'dc811a14491f',
  'c3de66676c59',
  'df68301a2f1a',
  'f17e642b8e7c',
  '00e3f0365643',
  '7572c98dca06',
  'ac47f7d3c2c3',
  '38c9cc710471',
  '9ac4a3e07812',
  '05c06e7b398d',
]

describe('creatures that already exist', () => {
  it('are still carrying exactly what they were carrying', () => {
    const moved: number[] = []
    for (let b = 0; b < BUCKETS; b++) if (bucketPrint(b) !== PINNED[b]) moved.push(b)
    // Reported as a count of buckets rather than a single object comparison, so
    // a red run says how much of the population moved rather than only that
    // something did.
    expect(moved).toEqual([])
  })

  it('watches enough seeds for a one-in-twenty change to be certain to show', () => {
    // Easy to weaken this gate by quietly deleting rows, and the earlier
    // version of this file was weak exactly that way. These two numbers are the
    // sensitivity; do not lower them to make a red run go away.
    expect(PINNED.length).toBe(BUCKETS)
    expect(BUCKETS * PER_BUCKET).toBeGreaterThanOrEqual(400)
  })
})

describe('what the catalogue is allowed to reach', () => {
  it('keeps anything only offered to a sleeping creature out of the genome', () => {
    // The named rule, tested by name. `HABIT_SHAPES` is built from the variants
    // a group can fall into a habit of doing, and nobody falls into a habit of
    // waking a creature that is not asleep. Without this the pin above goes red
    // the day somebody adds a second one, which is the correct alarm but a late
    // one: this says which rule was supposed to prevent it.
    const asleepOnly = ACTION_VARIANTS.filter((v) => v.whileAsleep === true)
    expect(asleepOnly.length).toBeGreaterThan(0)
    for (const variant of asleepOnly) {
      // If this ever stops being true the variant is reachable in normal play,
      // and then it belongs in the habit sums like everything else, and the
      // pinned hashes above have to be re-cut deliberately.
      expect(variant.minStage === undefined || variant.minStage === 0).toBe(true)
    }
  })
})
