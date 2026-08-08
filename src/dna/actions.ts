// actions.ts: everything a person can do to the creature.
//
// The one hard rule in this file is that a blurb never tells you what a button
// does to the animal. A person picks "hum to it at dusk" because it sounds
// like a nice thing to do at dusk, not because they worked out that it feeds
// resonance and stillness. If the mechanics were legible the whole game would
// collapse into a stat screen with a picture on it, and the moment months
// later when somebody says "that is because you kept walking it at night"
// would never happen, because everyone would already have known.
//
// For the same reason no variant is a pure lever: every push lands on two or
// three axes, so there is no button that only does one thing and no rotation
// to optimise. Behaviour has to actually be behaviour.
//
// The pushes are also balanced across the catalogue as a whole. Summed over
// all thirty six variants each axis gets within four percent of an even share,
// which matters more than it looks: expression reads a group's lean away from
// even, so if the catalogue itself leaned toward one axis then a group that
// pressed every button equally would come out looking like specialists in
// whatever the catalogue happened to over-supply. Balanced here means a group
// that does a bit of everything genuinely reads as a group that does a bit of
// everything, and grows the plain things.

import type { ActionVariant } from '../core/types'

export const ACTION_VARIANTS: ActionVariant[] = [
  // --- feed ---------------------------------------------------------------
  {
    id: 'feed.emberfruit',
    kind: 'feed',
    label: 'ember-fruit',
    blurb: 'Split one open. It steams.',
    push: { nourish: 3, ferocity: 1, vigor: 1 },
  },
  {
    id: 'feed.riverGreens',
    kind: 'feed',
    label: 'river greens',
    blurb: 'Cold, and still dripping.',
    push: { nourish: 3, stillness: 1, roam: 1 },
  },
  {
    id: 'feed.marrowBone',
    kind: 'feed',
    label: 'a marrow bone',
    blurb: 'Heavy. It takes all evening.',
    push: { nourish: 3, ferocity: 1.5, stillness: 0.5 },
  },
  {
    id: 'feed.honeycomb',
    kind: 'feed',
    label: 'honeycomb',
    blurb: 'Sticky, and it will not share.',
    push: { nourish: 2.5, bond: 1.5, stillness: 1 },
  },
  {
    id: 'feed.saltedFish',
    kind: 'feed',
    label: 'salted fish',
    blurb: 'Kept back from the long walk home.',
    push: { nourish: 3, roam: 1.5, craft: 0.5 },
  },
  {
    id: 'feed.fromYourHand',
    kind: 'feed',
    label: 'from your own hand',
    blurb: 'Slow. It has to lean in for it.',
    push: { nourish: 2.5, bond: 2, stillness: 0.5 },
  },

  // --- train --------------------------------------------------------------
  {
    id: 'train.chaseYard',
    kind: 'train',
    label: 'chase it round the yard',
    blurb: 'You will lose. Go anyway.',
    push: { vigor: 3, roam: 1.5, bond: 0.5 },
  },
  {
    id: 'train.liftStones',
    kind: 'train',
    label: 'lift stones with it',
    blurb: 'Start with ones you can carry.',
    push: { vigor: 3, ferocity: 1.5, craft: 0.5 },
  },
  {
    id: 'train.sparPadded',
    kind: 'train',
    label: 'spar with a padded arm',
    blurb: 'Let it win once. Not twice.',
    push: { ferocity: 3, vigor: 2, bond: 0.5 },
  },
  {
    id: 'train.holdStill',
    kind: 'train',
    label: 'teach it to hold still',
    blurb: 'Count to ten out loud.',
    push: { stillness: 3, bond: 1, craft: 1 },
  },
  {
    id: 'train.climbRope',
    kind: 'train',
    label: 'send it up the rope',
    blurb: 'It gets stuck halfway the first time.',
    push: { vigor: 2.5, roam: 1.5, craft: 1 },
  },
  {
    id: 'train.standGround',
    kind: 'train',
    label: 'make it stand its ground',
    blurb: 'Do not step back first.',
    push: { ferocity: 2.5, stillness: 1.5, vigor: 1.5 },
    minStage: 2,
  },

  // --- explore ------------------------------------------------------------
  {
    id: 'explore.riverbank',
    kind: 'explore',
    label: 'the riverbank',
    blurb: 'Follow it until the water turns.',
    push: { roam: 2.5, stillness: 1.5, resonance: 1 },
  },
  {
    id: 'explore.oldQuarry',
    kind: 'explore',
    label: 'the old quarry',
    blurb: 'Everything down there says itself twice.',
    push: { roam: 2, resonance: 2, craft: 1 },
  },
  {
    id: 'explore.nightField',
    kind: 'explore',
    label: 'the night field',
    blurb: 'Nothing to see. That is the point.',
    push: { roam: 2, stillness: 2, resonance: 1 },
  },
  {
    id: 'explore.market',
    kind: 'explore',
    label: 'the market',
    blurb: 'Crowds. It will not like it at first.',
    push: { roam: 1.5, bond: 1.5, ferocity: 2 },
  },
  {
    id: 'explore.ridgeline',
    kind: 'explore',
    label: 'the ridgeline',
    blurb: 'Two hours up, ten minutes at the top.',
    push: { roam: 2.5, vigor: 2.5 },
  },
  {
    id: 'explore.burnedWood',
    kind: 'explore',
    label: 'the burned wood',
    blurb: 'Black trunks, new green underneath.',
    push: { roam: 1.5, ferocity: 2, craft: 1.5 },
    minStage: 2,
  },

  // --- sing ---------------------------------------------------------------
  {
    id: 'sing.humDusk',
    kind: 'sing',
    label: 'hum to it at dusk',
    blurb: 'Nothing with words. Just the low part.',
    push: { resonance: 3, stillness: 1.5, bond: 0.5 },
  },
  {
    id: 'sing.clapRhythm',
    kind: 'sing',
    label: 'clap a rhythm',
    blurb: 'Keep it simple enough to copy.',
    push: { resonance: 2.5, vigor: 2, craft: 0.5 },
  },
  {
    id: 'sing.sayItsName',
    kind: 'sing',
    label: 'say its name, over and over',
    blurb: 'Until it turns its head.',
    push: { resonance: 2.5, bond: 2, stillness: 0.5 },
  },
  {
    id: 'sing.whistleFar',
    kind: 'sing',
    label: 'whistle from across the field',
    blurb: 'Then wait. Do not whistle twice.',
    push: { resonance: 2, roam: 2, stillness: 1 },
  },
  {
    id: 'sing.drumFloor',
    kind: 'sing',
    label: 'drum on the floor',
    blurb: 'Palms flat. It feels it before it hears it.',
    push: { resonance: 2.5, ferocity: 1.5, vigor: 1.5 },
  },
  {
    id: 'sing.readAloud',
    kind: 'sing',
    label: 'read to it badly',
    blurb: 'It does not mind that you stumble.',
    push: { resonance: 2.5, bond: 1.5, stillness: 1 },
  },

  // --- give ---------------------------------------------------------------
  {
    id: 'give.riverStone',
    kind: 'give',
    label: 'a river stone',
    blurb: 'One that fit your hand right.',
    push: { craft: 2.5, bond: 1, stillness: 1.5 },
  },
  {
    id: 'give.crackedBell',
    kind: 'give',
    label: 'a cracked bell',
    blurb: 'Still rings. Wrong note.',
    push: { craft: 2, resonance: 2.5, bond: 0.5 },
  },
  {
    id: 'give.knottedRope',
    kind: 'give',
    label: 'a knotted rope',
    blurb: 'You tied it yourself. Badly.',
    push: { craft: 2.5, vigor: 1.5, bond: 1 },
  },
  {
    id: 'give.shedSkin',
    kind: 'give',
    label: 'a shed skin',
    blurb: 'Whole, if you were careful lifting it.',
    push: { craft: 2, ferocity: 1.5, roam: 1.5 },
  },
  {
    id: 'give.mirrorBit',
    kind: 'give',
    label: 'a bit of mirror',
    blurb: 'Tape over the sharp edge first.',
    push: { craft: 2.5, resonance: 1, ferocity: 1.5 },
  },
  {
    id: 'give.mapScrap',
    kind: 'give',
    label: 'a scrap of map',
    blurb: 'Somewhere neither of you has been.',
    push: { craft: 2, roam: 2.5, stillness: 0.5 },
    minStage: 2,
  },

  // --- tend ---------------------------------------------------------------
  {
    id: 'tend.brushDown',
    kind: 'tend',
    label: 'brush it down',
    blurb: 'Long strokes, with the grain.',
    push: { bond: 2.5, stillness: 1.5, nourish: 1 },
  },
  {
    id: 'tend.cleanScrapes',
    kind: 'tend',
    label: 'clean its scrapes',
    blurb: 'It will pull away. Hold on.',
    push: { bond: 2, nourish: 1.5, ferocity: 1.5 },
  },
  {
    id: 'tend.sitNearby',
    kind: 'tend',
    label: 'sit near it and do nothing',
    blurb: 'Bring a book if you need one.',
    push: { stillness: 3, bond: 2 },
  },
  {
    id: 'tend.trimClaws',
    kind: 'tend',
    label: 'trim its claws',
    blurb: 'Only the tips. You will know.',
    push: { craft: 2, bond: 1.5, ferocity: 1.5 },
  },
  {
    id: 'tend.freshBedding',
    kind: 'tend',
    label: 'change its bedding',
    blurb: 'Dry straw, packed loose.',
    push: { nourish: 2.5, stillness: 1.5, craft: 1 },
  },
  {
    id: 'tend.checkTeeth',
    kind: 'tend',
    label: 'check its teeth',
    blurb: 'Both hands. Be quick about it.',
    push: { ferocity: 2, bond: 1.5, vigor: 1.5 },
    minStage: 2,
  },
]

const BY_ID = new Map<string, ActionVariant>(
  ACTION_VARIANTS.map((variant) => [variant.id, variant]),
)

export function variantById(id: string): ActionVariant | undefined {
  return BY_ID.get(id)
}

export function availableVariants(stage: number): ActionVariant[] {
  return ACTION_VARIANTS.filter((variant) => (variant.minStage ?? 0) <= stage)
}

// How each variant reads inside a remembered sentence, phrased as a habit
// rather than a single event, because memories are written about the weeks
// somebody kept doing a thing. Kept out of ActionVariant on purpose: the
// button copy is written to the person about to act, and this is written about
// them afterwards, so the two want different words.
export const VARIANT_MEMORY: Record<string, string> = {
  'feed.emberfruit': 'splitting ember-fruit for it',
  'feed.riverGreens': 'bringing it river greens',
  'feed.marrowBone': 'leaving marrow bones out',
  'feed.honeycomb': 'feeding it honeycomb',
  'feed.saltedFish': 'carrying salted fish back for it',
  'feed.fromYourHand': 'feeding it by hand',

  'train.chaseYard': 'chasing it round the yard',
  'train.liftStones': 'getting it to lift stones',
  'train.sparPadded': 'sparring with it',
  'train.holdStill': 'making it hold still',
  'train.climbRope': 'sending it up the rope',
  'train.standGround': 'making it stand its ground',

  'explore.riverbank': 'walking it along the river',
  'explore.oldQuarry': 'taking it down to the quarry',
  'explore.nightField': 'walking it out into the night field',
  'explore.market': 'taking it through the market',
  'explore.ridgeline': 'hauling it up the ridge',
  'explore.burnedWood': 'taking it into the burned wood',

  'sing.humDusk': 'humming to it at dusk',
  'sing.clapRhythm': 'clapping rhythms at it',
  'sing.sayItsName': 'saying its name over and over',
  'sing.whistleFar': 'whistling for it from across the field',
  'sing.drumFloor': 'drumming on the floor for it',
  'sing.readAloud': 'reading to it',

  'give.riverStone': 'bringing it river stones',
  'give.crackedBell': 'leaving cracked bells with it',
  'give.knottedRope': 'giving it knotted rope',
  'give.shedSkin': 'collecting shed skins for it',
  'give.mirrorBit': 'leaving bits of mirror with it',
  'give.mapScrap': 'slipping it scraps of maps',

  'tend.brushDown': 'brushing it down',
  'tend.cleanScrapes': 'cleaning its scrapes',
  'tend.sitNearby': 'sitting near it doing nothing',
  'tend.trimClaws': 'trimming its claws',
  'tend.freshBedding': 'changing its bedding',
  'tend.checkTeeth': 'checking its teeth',
}
