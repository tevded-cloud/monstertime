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
//
// The balance that matters is the balance of the pool that is actually on
// screen, not of the catalogue on paper. Four variants are held back to stage
// two, and they are chosen to be a fair slice rather than a themed one: they
// cover all eight axes between them, so taking them out leaves the pool behind
// them close to even. That matters because the first traits are also the ones
// stickiness then protects, and they must not lock in against a tilted
// background.
//
// The egg is the deliberate exception to that, and it is a exception made on
// purpose. Twenty variants are held to stage one, because they are things you
// cannot do to an egg: it cannot be fed, chased round a yard, walked to the
// market or have its claws trimmed, and offering all of that to somebody
// looking at an unhatched egg made the whole tray read as nonsense. What is
// left is what you CAN do to an egg, which is sing to it, leave things beside
// it, sit with it and keep it clean and warm, and that pool leans toward
// resonance, craft, bond and stillness rather than sitting even.
//
// That lean is accepted rather than corrected. The egg is five actions long,
// no trait can express before the first growth tick at five, and an animal
// whose first week was singing and sitting SHOULD carry a little of that. The
// balance argument above still governs every pool from the hatchling on, which
// is where all but a handful of a creature's actions land.

import { PRESSURE_AXES } from '../core/types'
import type { ActionKind, ActionMethod, ActionVariant, PressureDelta } from '../core/types'
import { expand } from './catalogue'
import { FEED_SHELVES } from './shelves-feed'

export const ACTION_VARIANTS: ActionVariant[] = [
  ...expand(FEED_SHELVES),
  // --- train --------------------------------------------------------------
  {
    id: 'train.chaseYard',
    category: 'running',
    kind: 'train',
    label: 'chase it round the yard',
    blurb: 'You will lose. Go anyway.',
    push: { vigor: 3, roam: 1.5, bond: 0.5 },
    minStage: 1,
  },
  {
    id: 'train.liftStones',
    category: 'strength',
    kind: 'train',
    label: 'lift stones with it',
    blurb: 'Start with ones you can carry.',
    push: { vigor: 3, ferocity: 1.5, craft: 0.5 },
    minStage: 1,
  },
  {
    id: 'train.sparPadded',
    category: 'strength',
    kind: 'train',
    label: 'spar with a padded arm',
    blurb: 'Let it win once. Not twice.',
    push: { ferocity: 3, vigor: 2, bond: 0.5 },
    minStage: 1,
  },
  {
    id: 'train.holdStill',
    category: 'discipline',
    kind: 'train',
    label: 'teach it to hold still',
    blurb: 'Count to ten out loud.',
    push: { stillness: 3, bond: 1, craft: 1 },
    minStage: 1,
  },
  {
    id: 'train.climbRope',
    category: 'running',
    kind: 'train',
    label: 'send it up the rope',
    blurb: 'It gets stuck halfway the first time.',
    push: { vigor: 2.5, roam: 1.5, craft: 1 },
    minStage: 1,
  },
  {
    id: 'train.standGround',
    category: 'discipline',
    kind: 'train',
    label: 'make it stand its ground',
    blurb: 'Do not step back first.',
    push: { ferocity: 2.5, stillness: 1.5, vigor: 1.5 },
    minStage: 2,
  },

  // --- explore ------------------------------------------------------------
  {
    id: 'explore.riverbank',
    category: 'water',
    kind: 'explore',
    label: 'the riverbank',
    blurb: 'Follow it until the water turns.',
    push: { roam: 2.5, stillness: 1.5, resonance: 1 },
    gives: { verdure: 0.8, brine: 0.4 },
    minStage: 1,
  },
  {
    id: 'explore.oldQuarry',
    category: 'high ground',
    kind: 'explore',
    label: 'the old quarry',
    blurb: 'Everything down there says itself twice.',
    push: { roam: 2, resonance: 2, craft: 1 },
    gives: { mineral: 1 },
    minStage: 1,
  },
  {
    id: 'explore.nightField',
    category: 'wild',
    kind: 'explore',
    label: 'the night field',
    blurb: 'Nothing to see. That is the point.',
    push: { roam: 2, stillness: 2, resonance: 1 },
    gives: { verdure: 0.6 },
    minStage: 1,
  },
  {
    id: 'explore.market',
    category: 'town',
    kind: 'explore',
    label: 'the market',
    blurb: 'Crowds. It will not like it at first.',
    push: { roam: 1.5, bond: 1.5, ferocity: 2 },
    gives: { ember: 0.4, brine: 0.4 },
    minStage: 1,
  },
  {
    id: 'explore.ridgeline',
    category: 'high ground',
    kind: 'explore',
    label: 'the ridgeline',
    blurb: 'Two hours up, ten minutes at the top.',
    push: { roam: 2.5, vigor: 2.5 },
    gives: { mineral: 0.8 },
    minStage: 1,
  },
  {
    id: 'explore.burnedWood',
    category: 'wild',
    kind: 'explore',
    label: 'the burned wood',
    blurb: 'Black trunks, new green underneath.',
    push: { roam: 1.5, ferocity: 2, craft: 1.5 },
    gives: { ember: 1 },
    minStage: 1,
  },

  // --- sing ---------------------------------------------------------------
  {
    id: 'sing.humDusk',
    category: 'voice',
    kind: 'sing',
    label: 'hum to it at dusk',
    blurb: 'Nothing with words. Just the low part.',
    push: { resonance: 3, stillness: 1.5, bond: 0.5 },
  },
  {
    id: 'sing.clapRhythm',
    category: 'rhythm',
    kind: 'sing',
    label: 'clap a rhythm',
    blurb: 'Keep it simple enough to copy.',
    push: { resonance: 2.5, vigor: 2, craft: 0.5 },
  },
  {
    id: 'sing.sayItsName',
    category: 'voice',
    kind: 'sing',
    label: 'say its name, over and over',
    blurb: 'Until it turns its head.',
    push: { resonance: 2.5, bond: 2, stillness: 0.5 },
    minStage: 2,
  },
  {
    id: 'sing.whistleFar',
    category: 'from far off',
    kind: 'sing',
    label: 'whistle from across the field',
    blurb: 'Then wait. Do not whistle twice.',
    push: { resonance: 2, roam: 2, stillness: 1 },
  },
  {
    id: 'sing.drumFloor',
    category: 'rhythm',
    kind: 'sing',
    label: 'drum on the floor',
    blurb: 'Palms flat. It feels it before it hears it.',
    push: { resonance: 2.5, ferocity: 1.5, vigor: 1.5 },
  },
  {
    id: 'sing.readAloud',
    category: 'voice',
    kind: 'sing',
    label: 'read to it badly',
    blurb: 'It does not mind that you stumble.',
    push: { resonance: 2.5, bond: 1.5, stillness: 1 },
  },

  // --- give ---------------------------------------------------------------
  {
    id: 'give.riverStone',
    category: 'stones',
    kind: 'give',
    label: 'a river stone',
    blurb: 'One that fit your hand right.',
    push: { craft: 2.5, bond: 1, stillness: 1.5 },
    gives: { mineral: 2 },
  },
  {
    id: 'give.crackedBell',
    category: 'made things',
    kind: 'give',
    label: 'a cracked bell',
    blurb: 'Still rings. Wrong note.',
    push: { craft: 2, resonance: 2.5, bond: 0.5 },
    gives: { mineral: 2, ember: 0.5 },
  },
  {
    id: 'give.knottedRope',
    category: 'made things',
    kind: 'give',
    label: 'a knotted rope',
    blurb: 'You tied it yourself. Badly.',
    push: { craft: 2.5, vigor: 1.5, bond: 1 },
    gives: { verdure: 1.5 },
  },
  {
    id: 'give.shedSkin',
    category: 'found things',
    kind: 'give',
    label: 'a shed skin',
    blurb: 'Whole, if you were careful lifting it.',
    push: { craft: 2, ferocity: 1.5, roam: 1.5 },
    gives: { brine: 1, mineral: 0.5 },
  },
  {
    id: 'give.mirrorBit',
    category: 'stones',
    kind: 'give',
    label: 'a bit of mirror',
    blurb: 'Tape over the sharp edge first.',
    push: { craft: 2.5, resonance: 1, ferocity: 1.5 },
    gives: { mineral: 2.5 },
  },
  {
    id: 'give.mapScrap',
    category: 'found things',
    kind: 'give',
    label: 'a scrap of map',
    blurb: 'Somewhere neither of you has been.',
    push: { craft: 2, roam: 2.5, stillness: 0.5 },
    gives: { verdure: 1, brine: 0.5 },
    minStage: 2,
  },

  // --- tend ---------------------------------------------------------------
  {
    id: 'tend.brushDown',
    category: 'washing',
    kind: 'tend',
    label: 'brush it down',
    blurb: 'Long strokes, with the grain.',
    push: { bond: 2.5, stillness: 1.5, nourish: 1 },
    minStage: 1,
  },
  {
    id: 'tend.cleanScrapes',
    category: 'washing',
    kind: 'tend',
    label: 'clean its scrapes',
    blurb: 'It will pull away. Hold on.',
    push: { bond: 2, nourish: 1.5, ferocity: 1.5 },
    minStage: 1,
  },
  {
    id: 'tend.sitNearby',
    category: 'company',
    kind: 'tend',
    label: 'sit near it and do nothing',
    blurb: 'Bring a book if you need one.',
    push: { stillness: 3, bond: 2 },
  },
  {
    id: 'tend.trimClaws',
    category: 'the body',
    kind: 'tend',
    label: 'trim its claws',
    blurb: 'Only the tips. You will know.',
    push: { craft: 2, bond: 1.5, ferocity: 1.5 },
    minStage: 1,
  },
  {
    id: 'tend.freshBedding',
    category: 'washing',
    kind: 'tend',
    label: 'change its bedding',
    blurb: 'Dry straw, packed loose.',
    push: { nourish: 2.5, stillness: 1.5, craft: 1 },
  },
  {
    id: 'tend.checkTeeth',
    category: 'the body',
    kind: 'tend',
    label: 'check its teeth',
    blurb: 'Both hands. Be quick about it.',
    push: { ferocity: 2, bond: 1.5, vigor: 1.5 },
    minStage: 1,
  },

  // The only thing anybody can do to a sleeping creature, and the only variant
  // in the catalogue carrying the flag that says so.
  //
  // Deliberately worth less than everything above it. It is the sole button on
  // screen for two evenings in five, so a group that keeps turning up while
  // theirs is down would otherwise have the whole of its character decided by
  // the one action they were allowed, and every creature raised by a group with
  // an awkward schedule would come out the same animal. Three points against
  // five says what it should say: rousing a thing is not the same as raising it.
  //
  // No minStage, and that is not an oversight. An egg sleeps too, and a stage
  // gate here would leave a group looking at a sleeping egg with nothing on the
  // tray at all, which is indistinguishable from an app that has broken.
  //
  // The axes are the three that are actually true of it: it is on its feet, it
  // did not ask to be, and somebody wanted it up. What that adds up to is then
  // decided by the manner, which is the whole point of putting this through the
  // ordinary pipeline: waking it firmly and waking it while talking to it the
  // whole time are two different things to have done to an animal.
  {
    id: 'tend.wakeIt',
    category: 'company',
    kind: 'tend',
    label: 'wake it',
    blurb: 'A hand on its side, until it shifts.',
    push: { vigor: 1.5, ferocity: 1, bond: 0.5 },
    whileAsleep: true,
  },
]

const BY_ID = new Map<string, ActionVariant>(
  ACTION_VARIANTS.map((variant) => [variant.id, variant]),
)

export function variantById(id: string): ActionVariant | undefined {
  return BY_ID.get(id)
}

/**
 * What is on the tray, given how grown it is and whether it is asleep.
 *
 * The two states offer disjoint sets rather than one being the other plus
 * something. Waking a creature that is already awake is not an action anybody
 * would want, and leaving it on the tray would put a button there that does
 * nothing but push pressure around, which is the definition of a lever.
 *
 * Defaulted rather than required so that every caller written before sleep
 * existed still asks the question it was asking.
 */
export function availableVariants(stage: number, asleep = false): ActionVariant[] {
  return ACTION_VARIANTS.filter(
    (variant) =>
      (variant.minStage ?? 0) <= stage && (variant.whileAsleep === true) === asleep,
  )
}

/**
 * Whether this may be done to a creature that is asleep.
 *
 * The server's sleep gate calls this one function and nothing else, and that is
 * a rule with a scar behind it. This app already shipped a pairing check that
 * was never wired up, with two tests that passed the whole time because a
 * different rule, the stage gate, refused the same message first. A negative
 * test goes green the moment ANYTHING refuses, so the refuser has to have a
 * name a test can call directly. This is that name.
 *
 * An id nobody recognises answers false, which is a refusal, and that is the
 * right way round: `act` has already turned unknown variants away by the time
 * anything asks this, so the only way to arrive here with one is through a code
 * path nobody has thought about yet.
 */
export function allowedWhileAsleep(variantId: string): boolean {
  const variant = variantById(variantId)
  return variant !== undefined && variant.whileAsleep === true
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
  'feed.fromYourHand': 'sharing its meals with it',

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
  'tend.wakeIt': 'waking it up',
}

/**
 * One thing somebody just did, as a finished sentence.
 *
 * A third phrasing, and it earns its place. `label` is the button, written to
 * the person about to press it, so it is a thing ("a marrow bone") or an
 * instruction ("sit near it and do nothing"). VARIANT_MEMORY is written about
 * weeks of behaviour, so it is a gerund ("leaving marrow bones out"). Neither
 * is a sentence about one event, and pasting them into one gave the line that
 * was actually on screen: "Teddy gave it something. a marrow bone." A verb per
 * kind plus a label cannot fix that, because the labels are not all the same
 * part of speech, so the verb is written out per variant.
 *
 * Past tense, no full stop, no name: the caller puts "Teddy" or "You" in front.
 */
export const VARIANT_PAST: Record<string, string> = {
  'feed.emberfruit': 'split an ember-fruit for it',
  'feed.riverGreens': 'brought it river greens',
  'feed.marrowBone': 'left out a marrow bone',
  'feed.honeycomb': 'fed it honeycomb',
  'feed.saltedFish': 'carried salted fish back for it',
  'feed.fromYourHand': 'shared what they were eating',

  'train.chaseYard': 'chased it round the yard',
  'train.liftStones': 'got it lifting stones',
  'train.sparPadded': 'sparred with it',
  'train.holdStill': 'made it hold still',
  'train.climbRope': 'sent it up the rope',
  'train.standGround': 'made it stand its ground',

  'explore.riverbank': 'walked it along the river',
  'explore.oldQuarry': 'took it down to the quarry',
  'explore.nightField': 'walked it out into the night field',
  'explore.market': 'took it through the market',
  'explore.ridgeline': 'hauled it up the ridge',
  'explore.burnedWood': 'took it into the burned wood',

  'sing.humDusk': 'hummed to it',
  'sing.clapRhythm': 'clapped a rhythm at it',
  'sing.sayItsName': 'said its name over and over',
  'sing.whistleFar': 'whistled for it from across the field',
  'sing.drumFloor': 'drummed on the floor for it',
  'sing.readAloud': 'read to it',

  'give.riverStone': 'brought it a river stone',
  'give.crackedBell': 'left a cracked bell with it',
  'give.knottedRope': 'gave it a knotted rope',
  'give.shedSkin': 'brought it a shed skin',
  'give.mirrorBit': 'left a bit of mirror with it',
  'give.mapScrap': 'slipped it a scrap of a map',

  'tend.brushDown': 'brushed it down',
  'tend.cleanScrapes': 'cleaned its scrapes',
  'tend.sitNearby': 'sat near it doing nothing',
  'tend.trimClaws': 'trimmed its claws',
  'tend.freshBedding': 'changed its bedding',
  'tend.checkTeeth': 'checked its teeth',
  'tend.wakeIt': 'woke it up',
}

/**
 * The same thing, said to the person who did it. Only the handful of variants
 * whose third person form carries "their" need their own line; everything else
 * reads correctly after "You" already.
 */
const VARIANT_PAST_YOU: Record<string, string> = {
  'feed.fromYourHand': 'shared what you were eating',
}

export function pastTense(variantId: string, byYou: boolean): string | null {
  if (byYou) {
    const mine = VARIANT_PAST_YOU[variantId]
    if (mine !== undefined) return mine
  }
  return VARIANT_PAST[variantId] ?? null
}

// --- how, as opposed to what ------------------------------------------------
//
// Three per kind, one point each, spread across different axes on purpose.
//
// The spread is the whole balance argument. Handing a thing over leans bond,
// leaving it out leans stillness, throwing it leans vigor; a group that uses
// all three evenly has said nothing, and a group that always hands things over
// has said something real about itself. Nobody balanced these leaves one by
// one, which is the only way this survives being twenty times longer.
//
// One point rather than three, also on purpose. What goes into the creature
// should still matter more than the manner of it, or the item list collapses
// back into decoration on six buttons.
//
// Nothing here touches nourish. That axis is what an item IS, and no way of
// handing something over makes it more food than it was.
export const ACTION_METHODS: ActionMethod[] = [
  { id: 'feed.byHand', kind: 'feed', label: 'by hand', push: { bond: 1 } },
  { id: 'feed.inABowl', kind: 'feed', label: 'in a bowl', push: { stillness: 1 } },
  { id: 'feed.thrown', kind: 'feed', label: 'thrown for it to catch', push: { vigor: 1 } },

  { id: 'train.hard', kind: 'train', label: 'hard', push: { ferocity: 1 } },
  { id: 'train.patiently', kind: 'train', label: 'patiently', push: { stillness: 1 } },
  { id: 'train.tired', kind: 'train', label: 'until it is tired', push: { vigor: 1 } },

  { id: 'explore.leading', kind: 'explore', label: 'leading the way', push: { craft: 1 } },
  { id: 'explore.following', kind: 'explore', label: 'letting it lead', push: { roam: 1 } },
  { id: 'explore.carried', kind: 'explore', label: 'carried the whole way', push: { bond: 1 } },

  { id: 'sing.close', kind: 'sing', label: 'up close', push: { bond: 1 } },
  { id: 'sing.across', kind: 'sing', label: 'from across the room', push: { roam: 1 } },
  { id: 'sing.underBreath', kind: 'sing', label: 'under your breath', push: { resonance: 1 } },

  { id: 'give.leftOut', kind: 'give', label: 'left where it will find it', push: { stillness: 1 } },
  { id: 'give.hidden', kind: 'give', label: 'hidden first, so it hunts', push: { craft: 1 } },
  { id: 'give.fuss', kind: 'give', label: 'with a great fuss', push: { resonance: 1 } },

  { id: 'tend.quickly', kind: 'tend', label: 'quickly', push: { vigor: 1 } },
  { id: 'tend.talking', kind: 'tend', label: 'talking to it the whole time', push: { resonance: 1 } },
  { id: 'tend.firmly', kind: 'tend', label: 'firmly', push: { ferocity: 1 } },
]

const METHOD_BY_ID = new Map(ACTION_METHODS.map((m) => [m.id, m]))

export function methodById(id: string): ActionMethod | null {
  return METHOD_BY_ID.get(id) ?? null
}

/** The methods offered for one kind, in catalogue order. */
export function methodsForKind(kind: ActionKind): ActionMethod[] {
  return ACTION_METHODS.filter((m) => m.kind === kind)
}

/** The categories inside one kind, in the order their first item appears. */
export function categoriesForKind(kind: ActionKind): string[] {
  const seen: string[] = []
  for (const v of ACTION_VARIANTS) {
    if (v.kind === kind && !seen.includes(v.category)) seen.push(v.category)
  }
  return seen
}

/**
 * Whether a method may be attached to a variant.
 *
 * Kind-matched rather than free, so nothing can arrive off the wire claiming it
 * fed the creature firmly. The check runs on the server before an action is
 * written and again here before a push is composed, because a stored row that
 * fails it would change what the creature is on every future replay.
 */
export function methodFits(variantId: string, methodId: string): boolean {
  const variant = variantById(variantId)
  const method = methodById(methodId)
  return variant !== undefined && method !== null && variant.kind === method.kind
}

/**
 * What one action actually pushed: the item, plus the manner if one was given.
 *
 * The single place the two halves meet. Everything that reads a push, the
 * expression pass and every measurement over the catalogue, goes through here,
 * so there is no way to add methods to one and forget the other.
 */
export function pushOf(variantId: string, methodId?: string): PressureDelta {
  const variant = variantById(variantId)
  if (variant === undefined) return {}
  if (methodId === undefined || !methodFits(variantId, methodId)) return variant.push
  const method = methodById(methodId)
  if (method === null) return variant.push
  // Walked in the catalogue's own axis order rather than the object's, because
  // key order is an engine detail and two clients disagreeing about it would
  // add these in different orders and drift apart in the last bit.
  const out: PressureDelta = { ...variant.push }
  for (const axis of PRESSURE_AXES) {
    const amount = method.push[axis]
    if (amount === undefined) continue
    out[axis] = (out[axis] ?? 0) + amount
  }
  return out
}
