// describe.ts: putting a creature into words.
//
// Everything a group's creature is has been sitting in the data since the first
// week: eight morphs, a diet, a body plan, pressures, bonds, the trait that
// locked in on a Tuesday and whose fault it was. None of it has ever been said
// out loud. The app shows you an animal and expects you to infer the rest.
//
// So this file is the other half of the payoff, and it is deliberately pure
// functions over the Creature and the Genome rather than anything that renders.
// That is not tidiness: a sentence generator is exactly the kind of thing that
// reads fine to whoever wrote it and produces "a small large creature" on the
// third seed anybody tries, and pure functions are the ones a test can hammer
// with a thousand creatures and check every string that comes out.
//
// The house rule from actions.ts applies here too, in reverse. Buttons never
// tell you the mechanics; this page never shows you a number. "Heavier than
// most" rather than bulk 0.71, because the moment a number appears somebody
// starts optimising it and the animal becomes a build.

import type { ActivityPattern, BodyPlan, Creature, Genome, Morphs, Substance } from '../core/types'
import { SUBSTANCE_AXES } from '../core/types'

// ---------------------------------------------------------------------------
// What kind of animal it is
// ---------------------------------------------------------------------------

const PLAN_NOUN: Record<BodyPlan, string> = {
  quadruped: 'a four-legged animal',
  serpent: 'a long-bodied thing with no legs at all',
  'multi-limb': 'a many-legged thing',
  biped: 'an animal that stands on two',
  winged: 'a winged animal',
  critter: 'a small scurrying thing',
  blob: 'something without a fixed shape',
}

export function planPhrase(plan: BodyPlan): string {
  return PLAN_NOUN[plan] ?? PLAN_NOUN.quadruped
}

// ---------------------------------------------------------------------------
// How big it is
// ---------------------------------------------------------------------------

/**
 * Roughly how long and how tall, in metres.
 *
 * Invented rather than derived from anything, and worth being honest about
 * that: the morphs are 0 to 1 with no units, and a fictional animal has no
 * recorded size to look up. What the numbers do carry is the ORDER, so a
 * bulkier creature really is bigger than a lighter one and an adult really is
 * bigger than a hatchling. When the bestiary's proportion bands drive the rigs,
 * this is the function that should start reading from them instead.
 */
export function sizeOf(morphs: Morphs, stage: number, plan: BodyPlan): { length: number; height: number } {
  // A hatchling is a fifth of what it will be, an adult all of it.
  const grown = 0.2 + 0.8 * (Math.max(0, Math.min(4, stage)) / 4)
  const bulk = 0.7 + morphs.bulk * 0.9

  if (plan === 'serpent') {
    const length = (1.8 + morphs.neckLength * 2.6 + morphs.tailBase * 1.4) * grown
    return { length, height: (0.1 + morphs.bulk * 0.22) * grown }
  }

  const length = (0.9 + morphs.neckLength * 0.7 + morphs.tailBase * 0.8) * bulk * grown
  const height = (0.5 + morphs.limbLength * 0.8) * bulk * grown
  return { length, height }
}

/** Metres, said the way a person would say them. */
export function metres(value: number): string {
  if (value < 1) return `${Math.round(value * 100)} cm`
  return `${value.toFixed(1)} m`
}

/** Where it sits against its own kind, in words rather than a number. */
export function bulkPhrase(bulk: number): string {
  if (bulk < 0.2) return 'slight, all edges'
  if (bulk < 0.4) return 'lean'
  if (bulk < 0.6) return 'ordinary through the middle'
  if (bulk < 0.8) return 'heavy-set'
  return 'enormously heavy for its length'
}

// ---------------------------------------------------------------------------
// What colour it is
// ---------------------------------------------------------------------------

/** Hue bands, in the order a colour wheel runs. Named the way somebody would
 *  describe an animal rather than the way a paint chart would. */
const HUES: { upTo: number; name: string }[] = [
  { upTo: 0.04, name: 'red' },
  { upTo: 0.09, name: 'rust' },
  { upTo: 0.13, name: 'amber' },
  { upTo: 0.19, name: 'ochre' },
  { upTo: 0.26, name: 'olive' },
  { upTo: 0.42, name: 'green' },
  { upTo: 0.52, name: 'sea-green' },
  { upTo: 0.58, name: 'teal' },
  { upTo: 0.7, name: 'blue' },
  { upTo: 0.79, name: 'violet' },
  { upTo: 0.88, name: 'plum' },
  { upTo: 0.96, name: 'wine' },
  { upTo: 1.01, name: 'red' },
]

export function colourName(h: number, s: number, l: number): string {
  if (s < 0.08) return l > 0.6 ? 'off-white' : l < 0.25 ? 'near-black' : 'grey'
  const hue = ((h % 1) + 1) % 1
  const base = HUES.find((band) => hue < band.upTo)?.name ?? 'red'
  const depth = l < 0.3 ? 'dark ' : l > 0.68 ? 'pale ' : ''
  const strength = s > 0.62 ? 'vivid ' : s < 0.22 ? 'muted ' : ''
  return `${depth}${strength}${base}`.trim()
}

// ---------------------------------------------------------------------------
// What it is made of
// ---------------------------------------------------------------------------

const SUBSTANCE_NOUN: Record<string, string> = {
  ember: 'ember-fruit and things that grew in the heat',
  verdure: 'green things and river weed',
  brine: 'salt and what comes out of cold water',
  mineral: 'stone, bone and hard things',
}

/** What it has mostly been fed, or null if it has never been given anything. */
export function dietPhrase(substance: Substance): string | null {
  let total = 0
  let best: string | null = null
  let bestValue = 0
  for (const axis of SUBSTANCE_AXES) {
    const v = Math.max(0, substance[axis])
    total += v
    if (v > bestValue) {
      bestValue = v
      best = axis
    }
  }
  if (total <= 0 || best === null) return null

  const share = bestValue / total
  const noun = SUBSTANCE_NOUN[best] ?? best
  // A creature fed one thing and a creature fed a bit of everything are
  // different animals, and the sentence should say which it is met.
  if (share > 0.75) return `almost entirely ${noun}`
  if (share > 0.45) return `mostly ${noun}`
  return `a bit of everything, ${noun} more than the rest`
}

// ---------------------------------------------------------------------------
// What it is like
// ---------------------------------------------------------------------------

const AXIS_TRAIT: Record<string, string> = {
  nourish: 'well fed and slow to worry',
  vigor: 'never still for long',
  roam: 'always facing the door',
  resonance: 'listens for you before it sees you',
  craft: 'turns things over and keeps the good ones',
  bond: 'wants somebody within reach',
  ferocity: 'meets things head on',
  stillness: 'happiest doing nothing at all',
}

/**
 * Its temperament, from the group's own behaviour.
 *
 * Read as a LEAN rather than a total, the same way expression reads it: a group
 * that does everything equally has no lean and should get the sentence that
 * says so, rather than whichever axis happened to be fractionally ahead.
 */
export function temperament(creature: Creature): string {
  const axes = Object.entries(creature.pressures) as [string, number][]
  let total = 0
  for (const [, v] of axes) total += Math.max(0, v)
  if (total <= 0) return 'nothing has happened to it yet, so it is not like anything in particular'

  const even = total / axes.length
  const sorted = [...axes].sort((a, b) => b[1] - a[1])
  const [topAxis, topValue] = sorted[0]
  // Two thirds again over an even share before a lean is a lean at all.
  if (topValue < even * 1.66) return 'a bit of everything, and settled with it'

  const first = AXIS_TRAIT[topAxis] ?? 'hard to put a word to'
  const [secondAxis, secondValue] = sorted[1]
  if (secondValue < even * 1.3) return first
  return `${first}, and ${AXIS_TRAIT[secondAxis] ?? 'hard to put a word to'}`
}

// ---------------------------------------------------------------------------
// When it is awake
// ---------------------------------------------------------------------------

/**
 * The shape of its rest, one sentence per pattern.
 *
 * Written from what src/dna/sleep.ts actually does and not from what the three
 * words mean in a dictionary, and the difference matters. That file gives the
 * creature a day of its own that is SHORTER than a solar one, so its hours slide
 * backwards against the wall clock every calendar day. A diurnal creature here
 * is therefore not a thing that sleeps at night: it is a thing that sleeps at
 * the far end of its own day, and its own day is not ours. A sentence promising
 * "it sleeps through the night" would be false for most of any given week, and a
 * page that tells a group something they can check and disprove in two evenings
 * is worse than a page that says nothing.
 *
 * So what is claimed here is only what survives the drift: how many times it
 * goes down, how long it stays down, and where in its own cycle that falls. Two
 * of the three read alike on purpose. They ARE alike once the phase has walked,
 * and inventing a difference to make three distinct sentences would be writing
 * fiction about a timetable anybody can watch.
 */
const RESTING: Record<ActivityPattern, string> = {
  diurnal: 'It sleeps once and sleeps long, at the far end of its own day.',
  nocturnal: 'It sleeps once and sleeps long, through the middle of its own day.',
  crepuscular:
    'It sleeps twice and never for long, so it is never down for much of a stretch and never up for much of one either.',
}

// The half that is true of all three, and the half worth knowing. A group that
// does not have this sentence works out on its own that the creature is asleep
// at odd hours and concludes the app is broken; a group that has it starts
// keeping track, which is the whole of what its hours are for.
const WALKING =
  'Its day runs shorter than yours, so its hours walk: whatever time it was up yesterday, it is up a little earlier today.'

export function hoursPhrase(activity: ActivityPattern): string {
  const resting = RESTING[activity]
  // A genome restored out of localStorage can have been written before sleep
  // existed, and then it carries no pattern at all however firmly the type says
  // it must. Half the paragraph is true of all three patterns and stays true
  // here; the other half would be a guess at which of the three this animal
  // turned out to be, and a specimen report does not guess.
  return resting === undefined ? WALKING : `${resting} ${WALKING}`
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

/**
 * How long until it is up, in the roundest terms that are still useful.
 *
 * Rounded hard, and not to be tidy. An exact countdown would be a stopwatch on
 * the one part of this app that is supposed to be an animal keeping its own
 * hours, and a group timing their evening to the minute against it is a group
 * optimising a schedule instead of living around one. Round enough to plan the
 * evening, too round to set a timer by.
 *
 * A number that cannot be read reads as soon rather than as never: a device with
 * a mangled clock should send somebody back to the app, not away from it.
 */
export function wakingPhrase(until: number): string {
  if (!Number.isFinite(until) || until <= 5 * MINUTE_MS) return 'any minute now'
  if (until < 55 * MINUTE_MS) return `in about ${Math.round(until / MINUTE_MS / 5) * 5} minutes`
  // Skipped straight past "in about 1 hours", which is the sentence this band
  // exists to prevent.
  if (until < 100 * MINUTE_MS) return 'in about an hour'
  return `in about ${Math.round(until / HOUR_MS)} hours`
}

/** How old it is, said in growth rather than in hours, because hours are not
 *  what a creature here is made of. */
export function agePhrase(creature: Creature): string {
  const done = creature.actionCount
  if (done === 0) return 'nothing has been done to it yet'
  if (done === 1) return 'one thing has happened to it'
  return `${done} things have happened to it`
}

// ---------------------------------------------------------------------------
// The whole entry
// ---------------------------------------------------------------------------

export interface Entry {
  kind: string
  size: string
  build: string
  colour: string
  diet: string | null
  temperament: string
  // When it keeps its hours. The only line on the page that comes off the
  // genome alone rather than off anything the group did, which is right: nobody
  // chose this and nobody can change it.
  hours: string
  age: string
}

export function describe(
  creature: Creature,
  genome: Genome,
  hide: { h: number; s: number; l: number },
): Entry {
  const size = sizeOf(creature.morphs, creature.stage, genome.plan)
  return {
    kind: planPhrase(genome.plan),
    size:
      genome.plan === 'serpent'
        ? `${metres(size.length)} long`
        : `${metres(size.length)} long, ${metres(size.height)} at the shoulder`,
    build: bulkPhrase(creature.morphs.bulk),
    colour: colourName(hide.h, hide.s, hide.l),
    diet: dietPhrase(creature.substance),
    temperament: temperament(creature),
    hours: hoursPhrase(genome.activity),
    age: agePhrase(creature),
  }
}
