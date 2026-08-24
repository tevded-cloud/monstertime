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
// left is what you CAN do to an egg, which is sing to it, leave a few things
// beside it, sit with it and keep its place clean and warm. That pool leans
// toward resonance, craft, bond and stillness rather than sitting even.
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
import { TRAIN_SHELVES } from './shelves-train'
import { EXPLORE_SHELVES } from './shelves-explore'
import { SING_SHELVES } from './shelves-sing'
import { GIVE_SHELVES } from './shelves-give'
import { TEND_SHELVES } from './shelves-tend'

export const ACTION_VARIANTS: ActionVariant[] = [
  ...expand(FEED_SHELVES),
  ...expand(TRAIN_SHELVES),
  ...expand(EXPLORE_SHELVES),
  ...expand(SING_SHELVES),
  ...expand(GIVE_SHELVES),
  ...expand(TEND_SHELVES),
  // --- tend ---------------------------------------------------------------
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
    past: 'woke it up',
    memory: 'waking it up',
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
  'feed.fromYourHand': 'shared part of the meal with it',
}

export function pastTense(variantId: string, byYou: boolean): string | null {
  if (byYou) {
    const mine = VARIANT_PAST_YOU[variantId]
    if (mine !== undefined) return mine
  }
  // The item's own line first. The two tables below are what is left of the
  // original thirty-six, kept because their keys are in real logs; everything
  // added since carries its prose beside it in the shelf files, where a missing
  // one is a compile error rather than a fallback to the button label. That
  // fallback is how "You strawberries." reached a screen.
  const own = variantById(variantId)?.past
  if (own !== undefined) return own
  return VARIANT_PAST[variantId] ?? null
}

/** How a habit reads in the chronicle. Same rule: the item first, then what is
 *  left of the original tables. */
export function memoryOf(variantId: string): string | null {
  return variantById(variantId)?.memory ?? VARIANT_MEMORY[variantId] ?? null
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
  { id: 'train.tired', kind: 'train', label: 'until tired', push: { vigor: 1 } },

  { id: 'explore.leading', kind: 'explore', label: 'leading the way', push: { craft: 1 } },
  { id: 'explore.following', kind: 'explore', label: 'letting it lead', push: { roam: 1 } },
  { id: 'explore.carried', kind: 'explore', label: 'carried the whole way', push: { bond: 1 } },

  { id: 'sing.close', kind: 'sing', label: 'up close', push: { bond: 1 } },
  { id: 'sing.across', kind: 'sing', label: 'from across the room', push: { roam: 1 } },
  { id: 'sing.underBreath', kind: 'sing', label: 'barely aloud', push: { resonance: 1 } },

  { id: 'give.leftOut', kind: 'give', label: 'left beside it', push: { stillness: 1 } },
  { id: 'give.hidden', kind: 'give', label: 'hidden first, so it hunts', push: { craft: 1 } },
  { id: 'give.fuss', kind: 'give', label: 'with a great fuss', push: { resonance: 1 } },

  { id: 'tend.quickly', kind: 'tend', label: 'quickly', push: { vigor: 1 } },
  { id: 'tend.talking', kind: 'tend', label: 'talking to it the whole time', push: { resonance: 1 } },
  { id: 'tend.firmly', kind: 'tend', label: 'deliberately', push: { ferocity: 1 } },
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
  if (variant === undefined || method === null) return false
  if (variant.kind !== method.kind) return false
  // AND the item's own list, when it has one. Manners hang off the kind, so
  // every singing manner was offered for every singing item and "whistle from
  // across the field" was offered "up close" and "from across the room" at the
  // same time. An item that already contains a manner narrows the set; absent,
  // the whole kind is fair game, which is the ordinary case.
  //
  // Read here rather than at the tray, because the tray is not the only thing
  // that asks: the server calls this before it writes a row, and a pairing the
  // catalogue does not contain would be replayed forever by every client.
  return variant.methods === undefined || variant.methods.includes(method.id)
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
