// alleles.ts: the pool of everything a creature could ever grow, and the draw
// that decides which slice of it a particular group is allowed to grow.
//
// The catalogue is deliberately much larger than any one creature can express.
// A group carries a slice of each locus rather than all of it, so "what my
// creature became" is a real draw from a real pool rather than a dressed up
// switch on a stat. Two groups who behave identically still end up with
// different animals, because they were never offered the same options. How big
// that slice is is not stated anywhere in this file's prose, because it is the
// single most delicate number in the module and prose goes stale: see rollGenome
// for what the draw actually does and why each part of it is the size it is.
//
// Each allele answers to a pressure shape. The shapes are meant to read as
// obvious in hindsight and invisible in advance: heavy ornament grows on a
// creature that was fed well and left alone, blades grow on one that was
// worked and pushed. A handful of alleles want opposing axes at once (bond and
// ferocity, roam and stillness). Those are the ones worth talking about,
// because a group only reaches them by genuinely mixed behaviour, not by
// picking one button and leaning on it.
//
// Every locus answers to every axis. That is a rule, not an accident: a locus
// with nothing that responds to, say, craft is a locus that stays bare forever
// for a group whose whole habit is bringing the creature things, and being
// permanently bald in one place is not a reading of a group's behaviour, it is
// a hole in this file. The bare hide was the worst of them, because a hide
// with nothing on it renders as plain, so the group that sang the most got the
// dullest skin on the biggest surface of the animal.

import { LOCI, PRESSURE_AXES } from '../core/types'
import type { Allele, AlleleId, Genome, Locus, PressureDelta } from '../core/types'
import { ACTION_VARIANTS } from './actions'
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
    id: 'horn.liftKnobs',
    locus: 'horn',
    label: 'lift-knobs',
    affinity: { vigor: 2, bond: 1.5 },
    threshold: 9,
    minStage: 1,
    weight: UNCOMMON,
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
    id: 'horn.tallyHorns',
    locus: 'horn',
    label: 'tally horns',
    affinity: { bond: 2, craft: 1.5 },
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
    id: 'ear.butterLobes',
    locus: 'ear',
    label: 'butter lobes',
    affinity: { nourish: 2, bond: 1 },
    threshold: 4,
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
    id: 'ear.shellEars',
    locus: 'ear',
    label: 'shell ears',
    affinity: { resonance: 2, stillness: 1 },
    threshold: 5,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'ear.wickTips',
    locus: 'ear',
    label: 'wick-tips',
    affinity: { craft: 2, resonance: 1 },
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
    id: 'ear.foldedTin',
    locus: 'ear',
    label: 'folded tin',
    affinity: { craft: 2, bond: 1 },
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
    id: 'wing.harvestFolds',
    locus: 'wing',
    label: 'harvest folds',
    affinity: { nourish: 2, bond: 1.5 },
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
    id: 'wing.roostCloak',
    locus: 'wing',
    label: 'a roost cloak',
    affinity: { bond: 2, stillness: 1.5 },
    threshold: 10,
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
    id: 'wing.oarSpans',
    locus: 'wing',
    label: 'oar spans',
    affinity: { vigor: 2, roam: 1.5 },
    threshold: 11,
    minStage: 1,
    weight: UNCOMMON,
  },
  {
    id: 'wing.cleaverWings',
    locus: 'wing',
    label: 'cleaver wings',
    affinity: { ferocity: 2, vigor: 1.5 },
    threshold: 24,
    minStage: 2,
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
    id: 'tail.lapCurl',
    locus: 'tail',
    label: 'a lap curl',
    affinity: { bond: 2, stillness: 1.5 },
    threshold: 4,
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
    id: 'tail.dustBanner',
    locus: 'tail',
    label: 'a dust banner',
    affinity: { roam: 2, vigor: 1 },
    threshold: 6,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'tail.clubTail',
    locus: 'tail',
    label: 'a club tail',
    affinity: { ferocity: 2, bond: 1 },
    threshold: 11,
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
    id: 'spine.larderHump',
    locus: 'spine',
    label: 'a larder hump',
    affinity: { nourish: 2, stillness: 1 },
    threshold: 4,
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
    id: 'spine.handholds',
    locus: 'spine',
    label: 'handholds',
    affinity: { bond: 2, vigor: 1.5 },
    threshold: 10,
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
    id: 'hide.deepFelt',
    locus: 'hide',
    label: 'a deep felt',
    affinity: { stillness: 2, bond: 1 },
    threshold: 5,
    minStage: 1,
    weight: COMMON,
  },
  {
    id: 'hide.drumHide',
    locus: 'hide',
    label: 'a drum hide',
    affinity: { resonance: 2, vigor: 1 },
    threshold: 6,
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
    id: 'eye.honeyRings',
    locus: 'eye',
    label: 'honey rings',
    affinity: { nourish: 2, stillness: 1.5 },
    threshold: 4,
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
    id: 'eye.quickWhites',
    locus: 'eye',
    label: 'quick whites',
    affinity: { vigor: 2, bond: 1 },
    threshold: 10,
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
    id: 'eye.weatherEyes',
    locus: 'eye',
    label: 'weather eyes',
    affinity: { roam: 2, resonance: 1 },
    threshold: 10,
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
    id: 'aura.someoneComing',
    locus: 'aura',
    label: 'the feeling of somebody arriving',
    affinity: { bond: 2, nourish: 1.5 },
    threshold: 5,
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
    id: 'aura.coldAirOffIt',
    locus: 'aura',
    label: 'cold air coming off it',
    affinity: { roam: 2, vigor: 1 },
    threshold: 6,
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

// ---------------------------------------------------------------------------
// Shape maths
// ---------------------------------------------------------------------------

// This lives here rather than in express.ts, where reading a creature happens,
// because the draw and the reading have to use the identical comparison. The
// draw below promises that a genome holds an answer to whatever its group turns
// into. That promise is worth nothing unless "answers" means exactly what
// expression means by it, and two copies of this arithmetic would drift. The
// drift would surface as a creature that is bare in a place nobody can explain.

const EVEN_SHARE = 1 / PRESSURE_AXES.length

// Centred shares: how far each axis sits above or below an even spread. This is
// what makes every comparison in the module a lean rather than a volume, and it
// is why a group that presses every button equally reads as having no
// preference at all.
export function centredShape(values: number[]): number[] {
  let total = 0
  for (let i = 0; i < values.length; i++) total += values[i]
  const shape = new Array<number>(values.length)
  if (total <= 0) {
    for (let i = 0; i < values.length; i++) shape[i] = 0
    return shape
  }
  for (let i = 0; i < values.length; i++) shape[i] = values[i] / total - EVEN_SHARE
  return shape
}

export function shapeOfDelta(delta: PressureDelta): number[] {
  const values = new Array<number>(PRESSURE_AXES.length)
  for (let i = 0; i < PRESSURE_AXES.length; i++) values[i] = delta[PRESSURE_AXES[i]] ?? 0
  return centredShape(values)
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    aa += a[i] * a[i]
    bb += b[i] * b[i]
  }
  if (aa <= 0 || bb <= 0) return 0
  return dot / (Math.sqrt(aa) * Math.sqrt(bb))
}

// Affinity shapes never change, so they are built once. Lazily rather than at
// module load, so importing an allele id from the Worker does not cost the
// whole catalogue's worth of arithmetic on a cold start.
const AFFINITY_SHAPES = new Map<AlleleId, number[]>()

export function affinityShape(allele: Allele): number[] {
  let shape = AFFINITY_SHAPES.get(allele.id)
  if (shape === undefined) {
    shape = shapeOfDelta(allele.affinity)
    AFFINITY_SHAPES.set(allele.id, shape)
  }
  return shape
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

// The directions a group can actually end up pointing.
//
// A genome has to hold an answer to the group it belongs to, and what a group
// can become is not this file's to decide: it is decided by the buttons. So the
// habit directions are summed off the action catalogue rather than written down
// here, and a variant added there widens what a genome has to answer to without
// anybody having to remember to come back and edit a list. A group that leans on
// one kind of action for months points very close to one of these; a group that
// mixes points somewhere between them, where the answers to both sides still
// apply. Genomes are drawn once and stored, so changing the catalogue never
// reshapes a creature that already exists.
const HABIT_SHAPES: number[][] = (() => {
  const totals = new Map<string, PressureDelta>()
  for (const variant of ACTION_VARIANTS) {
    const total: PressureDelta = totals.get(variant.kind) ?? {}
    for (const axis of PRESSURE_AXES) {
      const push = variant.push[axis]
      if (push !== undefined) total[axis] = (total[axis] ?? 0) + push
    }
    totals.set(variant.kind, total)
  }
  return [...totals.values()].map(shapeOfDelta)
})()

// How close an allele has to sit to a habit before it counts as an answer to
// it. Comfortably above the mark where expression stops calling something an
// answer at all, and far enough above the way this space behaves at rest: the
// median allele scores -0.14 against a habit picked at random, because centred
// shapes make unrelated things negative rather than zero.
const COVER_MIN = 0.12

const COVERAGE = new Map<AlleleId, boolean[]>()

function habitsAnswered(allele: Allele): boolean[] {
  let answered = COVERAGE.get(allele.id)
  if (answered === undefined) {
    const shape = affinityShape(allele)
    answered = HABIT_SHAPES.map((habit) => cosine(habit, shape) >= COVER_MIN)
    COVERAGE.set(allele.id, answered)
  }
  return answered
}

// How many alleles the core of a locus is drawn at, before anything is added to
// close a gap. Small on purpose. Every extra one raises the odds that a group
// happens to carry the single best answer to whatever it becomes, and the best
// answer always wins its locus, so a fat draw is what makes two committed groups
// grow the same eight traits.
const CORE_MIN = 2
const CORE_SPAN = 2

// The ceiling on core plus gap-filling. This is the knob the whole thing turns
// on, and it was measured rather than picked. Holding everything else here as
// it is, and counting groups that spend nine actions in ten on one kind of
// action: at three, 35% of them still have a locus that never grows anything,
// and the largest identical set of eight traits across 5000 one-button groups
// is 15. At four, 8% and 93. At five, under 1% and 257. Five buys the last of
// the bare loci by handing every committed group the same eight traits, which
// is the trade that was made last time and had to be undone. Four is where both
// numbers are good at once.
const CARRIED_CAP = 4

// Anything already answered by something carried is discounted to this, rather
// than to nothing: two answers to the same lean is a real genome, and sometimes
// the second is the demanding version of the first that the group grows into
// years later.
const SPREAD_FLOOR = 0.2

// How much of the locus a candidate has left unanswered, as a draw multiplier.
// A pick that points somewhere nothing carried points is worth its full weight;
// one that points where the genome already points is worth the floor.
function spreadFactor(allele: Allele, chosen: Allele[]): number {
  const shape = affinityShape(allele)
  let nearest = 0
  for (const taken of chosen) {
    const overlap = cosine(shape, affinityShape(taken))
    if (overlap > nearest) nearest = overlap
  }
  const spread = 1 - nearest
  return spread > SPREAD_FLOOR ? spread : SPREAD_FLOOR
}

// Draw the creature's potential. This runs once per group, at creation, and the
// result is the only thing besides the action log that the server keeps.
//
// Three passes, each answering a different question.
//
// The core is a small spread draw: one allele that can express at hatchling so
// no slot is guaranteed bare through the early game, then a couple more, each
// discounted if it points where the genome already points. Small is the whole
// point. The best match at a locus wins that locus outright, so the odds two
// groups grow the same trait are the odds they both carry that one allele, and
// a wide draw hands it to nearly everybody.
//
// The second pass closes gaps. For each habit a group could fall into, in an
// order this genome shuffles for itself, if nothing carried answers it the draw
// reaches for something that does. That is what stops a group being permanently
// bare somewhere for the crime of committing to one thing. Two details in it
// matter more than they look. It reaches only into what can express at
// hatchling, so the answer it hands over is one the group can actually reach
// rather than a striking allele they will never pay for. And it picks flat
// among the alleles that answer, ignoring how common they are, because
// weighting it would hand every group the same common answer and put the
// convergence straight back. The pass is capped, so it fills gaps rather than
// filling the locus.
//
// The last is one allele the creature cannot grow yet. Without it a genome made
// mostly of gap-filling is all hatchling parts, and a group that keeps going
// for a year has nothing left to become.
export function rollGenome(seed: string): Genome {
  const rng = makeRng(seed)
  const carried = {} as Record<Locus, AlleleId[]>

  for (const locus of LOCI) {
    const pool = ALLELES.filter((allele) => allele.locus === locus)
    const early = pool.filter((allele) => allele.minStage <= 1)
    const core = CORE_MIN + rng.int(CORE_SPAN)

    const chosen: Allele[] = []
    chosen.push(early[rng.weighted(early.map(weightOf))])
    const rest = pool.filter((allele) => allele.id !== chosen[0].id)

    while (chosen.length < core && rest.length > 0) {
      const index = rng.weighted(
        rest.map((allele) => weightOf(allele) * spreadFactor(allele, chosen)),
      )
      chosen.push(rest[index])
      rest.splice(index, 1)
    }

    const order: number[] = []
    for (let i = 0; i < HABIT_SHAPES.length; i++) order.push(i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1)
      const held = order[i]
      order[i] = order[j]
      order[j] = held
    }
    for (const habit of order) {
      if (chosen.length >= CARRIED_CAP) break
      let answered = false
      for (const taken of chosen) {
        if (habitsAnswered(taken)[habit]) {
          answered = true
          break
        }
      }
      if (answered) continue
      const answers = rest.filter(
        (allele) => allele.minStage <= 1 && habitsAnswered(allele)[habit],
      )
      if (answers.length === 0) continue
      // Flat weights on purpose, and drawn through weighted rather than int so
      // that a locus with a single answer still spends the same draw and the
      // sequence does not depend on how the catalogue happens to be shaped.
      const picked = answers[rng.weighted(answers.map(() => 1))]
      chosen.push(picked)
      rest.splice(rest.indexOf(picked), 1)
    }

    const later = rest.filter((allele) => allele.minStage >= 2)
    if (later.length > 0) {
      const index = rng.weighted(
        later.map((allele) => weightOf(allele) * spreadFactor(allele, chosen)),
      )
      chosen.push(later[index])
    }

    // Sorted so the stored genome is canonical: draw order carries no
    // information and would only be one more thing that could disagree
    // between two machines.
    chosen.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    carried[locus] = chosen.map((allele) => allele.id)
  }

  return { seed, carried }
}
