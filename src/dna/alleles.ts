// alleles.ts: the pool of everything a creature could ever grow, and the draw
// that decides which slice of it a particular group is allowed to grow.
//
// The catalogue is deliberately much larger than any one creature can express.
// A group carries two to four alleles per locus out of seven or eight, so
// "what my creature became" is a real draw from a real pool rather than a
// dressed up switch on a stat. Two groups who behave identically still end up
// with different animals, because they were never offered the same options.
//
// Each allele answers to a pressure shape. The shapes are meant to read as
// obvious in hindsight and invisible in advance: heavy ornament grows on a
// creature that was fed well and left alone, blades grow on one that was
// worked and pushed. A handful of alleles want opposing axes at once (bond and
// ferocity, roam and stillness). Those are the ones worth talking about,
// because a group only reaches them by genuinely mixed behaviour, not by
// picking one button and leaning on it.

import { LOCI } from '../core/types'
import type { Allele, AlleleId, Genome, Locus } from '../core/types'
import { makeRng } from './rng'

// The draw weight is not part of the shared contract, because nothing outside
// this file has any business knowing how likely an allele was. It lives on the
// draft and is stripped before the catalogue is published.
interface AlleleDraft extends Allele {
  weight: number
}

// Roughly: 1.0 is the plain option a lot of creatures have, 0.5 is uncommon,
// 0.25 is rare, 0.12 is the one somebody screenshots.
const COMMON = 1
const UNCOMMON = 0.5
const RARE = 0.25
const STRIKING = 0.12

const DRAFTS: AlleleDraft[] = [
  // --- horn ---------------------------------------------------------------
  {
    id: 'horn.hushBuds',
    locus: 'horn',
    label: 'hush-buds',
    affinity: { stillness: 2, bond: 1 },
    threshold: 3,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'horn.emberCrest',
    locus: 'horn',
    label: 'ember-crest',
    affinity: { nourish: 2, ferocity: 1 },
    threshold: 5,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'horn.lanternHorn',
    locus: 'horn',
    label: 'lantern horn',
    affinity: { resonance: 2, craft: 1.5 },
    threshold: 10,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'horn.windCut',
    locus: 'horn',
    label: 'a wind-cut pair',
    affinity: { roam: 2, vigor: 1.5 },
    threshold: 11,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'horn.thornCrown',
    locus: 'horn',
    label: 'thorn crown',
    affinity: { ferocity: 2, vigor: 1.5 },
    threshold: 22,
    minStage: 2,
    weight: UNCOMMON,
  },
  {
    id: 'horn.saltSpiral',
    locus: 'horn',
    label: 'salt spiral',
    affinity: { roam: 2, craft: 1.5 },
    threshold: 24,
    minStage: 2,
    weight: UNCOMMON,
  },
  {
    id: 'horn.riverPolished',
    locus: 'horn',
    label: 'river-polished nubs',
    affinity: { roam: 2, stillness: 2 },
    threshold: 70,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'horn.glassAntlers',
    locus: 'horn',
    label: 'glass antlers',
    affinity: { craft: 2, stillness: 1.5, resonance: 1.5 },
    threshold: 85,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'horn.duelRack',
    locus: 'horn',
    label: 'a duelling rack',
    affinity: { ferocity: 2, bond: 2 },
    threshold: 200,
    minStage: 4,
    weight: STRIKING,
  },

  // --- ear ----------------------------------------------------------------
  {
    id: 'ear.velvetDrops',
    locus: 'ear',
    label: 'velvet drops',
    affinity: { bond: 2, nourish: 1 },
    threshold: 3,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'ear.notchedPair',
    locus: 'ear',
    label: 'a notched pair',
    affinity: { ferocity: 2, roam: 1 },
    threshold: 5,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'ear.bellCups',
    locus: 'ear',
    label: 'bell cups',
    affinity: { resonance: 2, roam: 1.5 },
    threshold: 10,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'ear.flatSet',
    locus: 'ear',
    label: 'flat-set ears',
    affinity: { stillness: 2, ferocity: 1.5 },
    threshold: 12,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'ear.stormFans',
    locus: 'ear',
    label: 'storm fans',
    affinity: { roam: 2, vigor: 1.5 },
    threshold: 22,
    minStage: 2,
    weight: UNCOMMON,
  },
  {
    id: 'ear.mothEars',
    locus: 'ear',
    label: 'moth ears',
    affinity: { resonance: 2, stillness: 2 },
    threshold: 72,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'ear.pinnedSlits',
    locus: 'ear',
    label: 'pinned-back slits',
    affinity: { vigor: 2, ferocity: 1.5, stillness: 1.5 },
    threshold: 90,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'ear.listeningFronds',
    locus: 'ear',
    label: 'listening fronds',
    affinity: { resonance: 2, bond: 2, stillness: 1.5 },
    threshold: 190,
    minStage: 4,
    weight: STRIKING,
  },

  // --- wing ---------------------------------------------------------------
  {
    id: 'wing.vestigialBuds',
    locus: 'wing',
    label: 'vestigial buds',
    affinity: { stillness: 2, nourish: 1.5 },
    threshold: 4,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'wing.humLoops',
    locus: 'wing',
    label: 'hum-loops',
    affinity: { resonance: 2, vigor: 1 },
    threshold: 6,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'wing.paperKites',
    locus: 'wing',
    label: 'paper kites',
    affinity: { craft: 2, roam: 1.5 },
    threshold: 9,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'wing.gullSpars',
    locus: 'wing',
    label: 'gull spars',
    affinity: { roam: 2, ferocity: 1.5 },
    threshold: 11,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'wing.beetleShells',
    locus: 'wing',
    label: 'beetle shells',
    affinity: { craft: 2, stillness: 1.5 },
    threshold: 26,
    minStage: 2,
    weight: UNCOMMON,
  },
  {
    id: 'wing.ashSails',
    locus: 'wing',
    label: 'ash sails',
    affinity: { roam: 2, ferocity: 1.5 },
    threshold: 75,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'wing.nightSpan',
    locus: 'wing',
    label: 'a night span',
    affinity: { roam: 2, resonance: 2 },
    threshold: 88,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'wing.tetherWings',
    locus: 'wing',
    label: 'tether wings',
    affinity: { bond: 2, roam: 2 },
    threshold: 195,
    minStage: 4,
    weight: STRIKING,
  },

  // --- tail ---------------------------------------------------------------
  {
    id: 'tail.anchorTail',
    locus: 'tail',
    label: 'an anchor tail',
    affinity: { nourish: 2, stillness: 1.5 },
    threshold: 3,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'tail.whipcord',
    locus: 'tail',
    label: 'a whipcord tail',
    affinity: { vigor: 2, ferocity: 1.5 },
    threshold: 5,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'tail.braided',
    locus: 'tail',
    label: 'a braided tail',
    affinity: { craft: 2, bond: 1.5 },
    threshold: 10,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'tail.rattleTail',
    locus: 'tail',
    label: 'a rattle tail',
    affinity: { resonance: 2, vigor: 1.5 },
    threshold: 12,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'tail.milestoneRings',
    locus: 'tail',
    label: 'milestone rings',
    affinity: { roam: 2, nourish: 1 },
    threshold: 25,
    minStage: 2,
    weight: UNCOMMON,
  },
  {
    id: 'tail.lanternTip',
    locus: 'tail',
    label: 'a lantern tip',
    affinity: { resonance: 2, craft: 1.5 },
    threshold: 74,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'tail.quietFan',
    locus: 'tail',
    label: 'a quiet fan',
    affinity: { stillness: 2, resonance: 1.5 },
    threshold: 80,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'tail.forkedRudder',
    locus: 'tail',
    label: 'a forked rudder',
    affinity: { roam: 2, vigor: 1.5, craft: 1.5 },
    threshold: 185,
    minStage: 4,
    weight: STRIKING,
  },

  // --- spine --------------------------------------------------------------
  {
    id: 'spine.mossRidge',
    locus: 'spine',
    label: 'a moss ridge',
    affinity: { stillness: 2, resonance: 1.5 },
    threshold: 3,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'spine.travelKnuckles',
    locus: 'spine',
    label: 'travel knuckles',
    affinity: { roam: 2, ferocity: 1.5 },
    threshold: 5,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'spine.songComb',
    locus: 'spine',
    label: 'a song comb',
    affinity: { resonance: 2, bond: 1.5 },
    threshold: 9,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'spine.pegBack',
    locus: 'spine',
    label: 'a peg-back',
    affinity: { craft: 2, stillness: 1.5 },
    threshold: 11,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'spine.kilnPlates',
    locus: 'spine',
    label: 'kiln plates',
    affinity: { craft: 2, ferocity: 1.5 },
    threshold: 26,
    minStage: 2,
    weight: UNCOMMON,
  },
  {
    id: 'spine.giftSpurs',
    locus: 'spine',
    label: 'gift spurs',
    affinity: { craft: 2, bond: 1.5, nourish: 1 },
    threshold: 70,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'spine.bladeRow',
    locus: 'spine',
    label: 'a blade row',
    affinity: { vigor: 2, ferocity: 2 },
    threshold: 92,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'spine.stillnessBloom',
    locus: 'spine',
    label: 'a stillness bloom',
    affinity: { stillness: 2, resonance: 2 },
    threshold: 175,
    minStage: 4,
    weight: STRIKING,
  },
  {
    id: 'spine.warSaddle',
    locus: 'spine',
    label: 'a war saddle',
    affinity: { ferocity: 2, bond: 2 },
    threshold: 210,
    minStage: 4,
    weight: STRIKING,
  },

  // --- hide ---------------------------------------------------------------
  {
    id: 'hide.tallowGloss',
    locus: 'hide',
    label: 'a tallow gloss',
    affinity: { nourish: 2, stillness: 1.5 },
    threshold: 3,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'hide.roadDust',
    locus: 'hide',
    label: 'road dust',
    affinity: { roam: 2, vigor: 1.5 },
    threshold: 5,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'hide.thumbworn',
    locus: 'hide',
    label: 'thumb-worn velvet',
    affinity: { bond: 2, craft: 1.5 },
    threshold: 10,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'hide.travelCoat',
    locus: 'hide',
    label: 'a travel coat',
    affinity: { nourish: 2, roam: 1.5 },
    threshold: 12,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'hide.brineArmour',
    locus: 'hide',
    label: 'brine armour',
    affinity: { ferocity: 2, nourish: 1.5 },
    threshold: 26,
    minStage: 2,
    weight: UNCOMMON,
  },
  {
    id: 'hide.kilnScale',
    locus: 'hide',
    label: 'kiln scale',
    affinity: { craft: 2, ferocity: 1.5 },
    threshold: 72,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'hide.stormPelt',
    locus: 'hide',
    label: 'a storm pelt',
    affinity: { vigor: 2, roam: 1.5, resonance: 1 },
    threshold: 86,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'hide.lacquerCase',
    locus: 'hide',
    label: 'a lacquer case',
    affinity: { craft: 2, stillness: 1.5, bond: 1.5 },
    threshold: 180,
    minStage: 4,
    weight: STRIKING,
  },
  {
    id: 'hide.scarLattice',
    locus: 'hide',
    label: 'a scar lattice',
    affinity: { ferocity: 2, vigor: 1.5, bond: 1.5 },
    threshold: 205,
    minStage: 4,
    weight: STRIKING,
  },

  // --- eye ----------------------------------------------------------------
  {
    id: 'eye.milkVeil',
    locus: 'eye',
    label: 'a milk veil',
    affinity: { stillness: 2, resonance: 1 },
    threshold: 3,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'eye.coalPins',
    locus: 'eye',
    label: 'coal pins',
    affinity: { ferocity: 2, vigor: 1.5 },
    threshold: 5,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'eye.lampGold',
    locus: 'eye',
    label: 'lamp gold',
    affinity: { bond: 2, nourish: 1.5 },
    threshold: 9,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'eye.workbenchEyes',
    locus: 'eye',
    label: 'workbench eyes',
    affinity: { craft: 2, bond: 1.5 },
    threshold: 11,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'eye.splitPupils',
    locus: 'eye',
    label: 'split pupils',
    affinity: { craft: 2, ferocity: 1.5 },
    threshold: 27,
    minStage: 2,
    weight: UNCOMMON,
  },
  {
    id: 'eye.riverGlass',
    locus: 'eye',
    label: 'river glass',
    affinity: { roam: 2, resonance: 1.5 },
    threshold: 70,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'eye.duskLamps',
    locus: 'eye',
    label: 'dusk lamps',
    affinity: { resonance: 2, stillness: 1.5 },
    threshold: 82,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'eye.farSightRings',
    locus: 'eye',
    label: 'far-sight rings',
    affinity: { roam: 2, stillness: 2 },
    threshold: 170,
    minStage: 4,
    weight: STRIKING,
  },
  {
    id: 'eye.witnessEyes',
    locus: 'eye',
    label: 'witness eyes',
    affinity: { bond: 2, resonance: 1.5, craft: 1.5 },
    threshold: 200,
    minStage: 4,
    weight: STRIKING,
  },

  // --- aura ---------------------------------------------------------------
  {
    id: 'aura.hearthWarm',
    locus: 'aura',
    label: 'a hearth warmth',
    affinity: { nourish: 2, craft: 1.5 },
    threshold: 4,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'aura.stormSmell',
    locus: 'aura',
    label: 'the smell of a coming storm',
    affinity: { vigor: 2, ferocity: 1.5 },
    threshold: 5,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'aura.workshopDust',
    locus: 'aura',
    label: 'workshop dust',
    affinity: { craft: 2, vigor: 1 },
    threshold: 10,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'aura.answeredQuiet',
    locus: 'aura',
    label: 'an answered quiet',
    affinity: { resonance: 2, bond: 1.5 },
    threshold: 12,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'aura.quietRoom',
    locus: 'aura',
    label: 'a quiet-room hush',
    affinity: { stillness: 2, bond: 1.5 },
    threshold: 25,
    minStage: 2,
    weight: UNCOMMON,
  },
  {
    id: 'aura.lowHum',
    locus: 'aura',
    label: 'a low hum',
    affinity: { resonance: 2, stillness: 1.5 },
    threshold: 72,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'aura.ironOnTheAir',
    locus: 'aura',
    label: 'iron on the air',
    affinity: { ferocity: 2, craft: 1.5 },
    threshold: 88,
    minStage: 3,
    weight: RARE,
  },
  {
    id: 'aura.tideChange',
    locus: 'aura',
    label: 'a tide change',
    affinity: { roam: 2, resonance: 1.5, vigor: 1.5 },
    threshold: 180,
    minStage: 4,
    weight: STRIKING,
  },
  {
    id: 'aura.heldBreath',
    locus: 'aura',
    label: 'a held breath',
    affinity: { stillness: 2, ferocity: 2 },
    threshold: 198,
    minStage: 4,
    weight: STRIKING,
  },
]

// Published without the weight, so no consumer can accidentally build UI that
// tells a person how lucky they were.
export const ALLELES: Allele[] = DRAFTS.map((draft) => ({
  id: draft.id,
  locus: draft.locus,
  label: draft.label,
  affinity: draft.affinity,
  threshold: draft.threshold,
  minStage: draft.minStage,
}))

const BY_ID = new Map<AlleleId, Allele>(ALLELES.map((allele) => [allele.id, allele]))
const WEIGHTS = new Map<AlleleId, number>(DRAFTS.map((draft) => [draft.id, draft.weight]))

export function alleleById(id: AlleleId): Allele | undefined {
  return BY_ID.get(id)
}

function weightOf(allele: Allele): number {
  return WEIGHTS.get(allele.id) ?? RARE
}

// Draw the creature's potential. This runs once per group, at creation, and
// the result is the only thing besides the action log that the server keeps.
//
// Two rules matter here. Every locus gets at least one allele that can express
// at hatchling, so no slot is guaranteed to stay bare through the whole early
// game. And the draw is weighted, so the striking alleles are genuinely scarce:
// a group that ends up carrying a war saddle still has to earn it with the
// right behaviour, and most groups never carried it in the first place.
export function rollGenome(seed: string): Genome {
  const rng = makeRng(seed)
  const carried = {} as Record<Locus, AlleleId[]>

  for (const locus of LOCI) {
    const pool = ALLELES.filter((allele) => allele.locus === locus)
    const early = pool.filter((allele) => allele.minStage <= 1)
    const wanted = 2 + rng.int(3)

    const chosen: Allele[] = []
    const firstIndex = rng.weighted(early.map(weightOf))
    chosen.push(early[firstIndex])

    const rest = pool.filter((allele) => allele.id !== chosen[0].id)
    while (chosen.length < wanted && rest.length > 0) {
      const index = rng.weighted(rest.map(weightOf))
      chosen.push(rest[index])
      rest.splice(index, 1)
    }

    // Sorted so the stored genome is canonical: draw order carries no
    // information and would only be one more thing that could disagree
    // between two machines.
    chosen.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    carried[locus] = chosen.map((allele) => allele.id)
  }

  return { seed, carried }
}
