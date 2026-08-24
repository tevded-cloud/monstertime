// index.ts: the market as a person sees it.
//
// The other half of src/market/rules.ts. That file holds the numbers and the
// legality and is imported by the Durable Object; this one holds the colours
// and the English and is imported by the app alone.
//
// THE WORKER MUST NOT IMPORT THIS FILE, and it is split exactly here so that it
// never has to. An egg's colour comes from paletteFor, paletteFor is the
// renderer's own function and pulls in three.js, and three.js inside a Durable
// Object is a megabyte of geometry code shipped to answer a question about
// coins. Nothing here is re-exported from rules.ts either, so there is no
// convenience import that would quietly drag the renderer across the wall.
//
// WHY THE COLOUR COMES FROM paletteFor AND NOT FROM A TABLE. The candidate seed
// on the market screen is the seed the creature will be rolled from, so the egg
// is shown in the hide colour that creature is going to have, worked out by the
// identical call the Beastpedia and the renderer make. An egg shown in a colour
// chosen any other way would be a screen that lies to a group about the animal
// they are buying, and they would find out the moment it hatched.
//
// The words are generated rather than written because there are as many eggs as
// there are seeds. The register is src/ui/describe.ts's: concrete, understated,
// nothing a person could optimise against, and no number except a price.

import type { MarketState } from '../core/types'
import { emptySubstance } from '../dna'
import { makeRng } from '../dna/rng'
import type { Rng } from '../dna/rng'
import { paletteFor } from '../forge/materials'
import { colourName } from '../ui/describe'
import { EGG_COUNT, hatchSpeedOf, priceOf } from './rules'
import type { PledgeRefusal } from '../core/types'

// ---------------------------------------------------------------------------
// What an egg looks like
// ---------------------------------------------------------------------------

export interface EggLook {
  egg: number
  seed: string
  /** Short, and the colour is in it: "dark green, speckled". */
  name: string
  /** One line about the thing itself. Never about what it will become. */
  line: string
  /** The hide colour of the creature inside, as a CSS hex. */
  colour: string
  price: number
  hatchSpeed: number
  /** How long the wait is, said the way the other two are said, so the three
   *  read as one decision. */
  wait: string
}

/** One egg's hide, read once. The hex a swatch is painted with and the three
 *  numbers behind it come off the SAME paletteFor call, so nothing downstream
 *  can end up describing a colour that is not the one being shown. */
interface Hide {
  h: number
  s: number
  l: number
  hex: string
}

function hideOf(seed: string): Hide {
  // The identical call the Beastpedia makes, with nothing put into the creature
  // yet, because nothing has been. What this returns is the hide the animal
  // will be born with.
  const hsl = { h: 0, s: 0, l: 0 }
  const base = paletteFor(seed, emptySubstance()).base
  base.getHSL(hsl)
  return { h: hsl.h, s: hsl.s, l: hsl.l, hex: `#${base.getHexString()}` }
}

/**
 * The shells, and there are twelve because three eggs drawn from a list of
 * twelve collide about a fifth of the time. That is what eggsOnOffer nudges
 * apart: two eggs called "grey, speckled" and "grey, speckled" on the same
 * screen is the same defect as two groups getting the same creature, at the one
 * moment a group is looking hardest.
 */
const SHELLS = [
  'speckled',
  'banded',
  'freckled',
  'marbled',
  'pitted',
  'ridged',
  'dimpled',
  'streaked',
  'mottled',
  'grained',
  'chalky',
  'polished',
]

// Two lists rather than sixty written lines, so the count is six times ten and
// two groups are not reading the same sentence off the same screen.
//
// TWO SENTENCES, NOT ONE JOINED BY "and". The first draft joined them with a
// comma and an "and", and the generator immediately produced "The same weight
// the whole way round, and cool the whole way round and staying that way": two
// clauses that are each fine and are not fine together. Every generative
// surface in these projects has hit some version of that, and the cheap answer
// is to stop building a sentence out of parts. A full stop cannot collide.
const WEIGHTS = [
  'Heavier than it looks',
  'Lighter than it has any right to be',
  'Weighted toward one end',
  'The same weight all over',
  'Dense, with something solid in the middle',
  'Barely anything in the hand',
]

const FEELS = [
  'Warm where somebody has been holding it',
  'Cold, and it stays cold',
  'Warm on the underside and nowhere else',
  'Dry, and faintly dusty',
  'Smooth enough to slip out of a grip',
  'Rough enough to catch on a sleeve',
  'Still, and then not still',
  'Quiet unless you hold it up to your ear',
  'Dull under a light everything else is shining in',
  'Giving off nothing at all',
]

/**
 * Draw a word, stepping past anything already used on this screen.
 *
 * Stepping rather than redrawing so the answer is still decided by this egg's
 * own seed: the same three seeds in the same order always produce the same
 * three eggs, on every phone, and nobody's screen has a word another screen
 * does not.
 */
function pick(list: string[], rand: Rng, taken: Set<string>): string {
  const from = rand.int(list.length)
  for (let step = 0; step < list.length; step++) {
    const word = list[(from + step) % list.length]
    if (!taken.has(word)) {
      taken.add(word)
      return word
    }
  }
  return list[from]
}

// ---------------------------------------------------------------------------
// The colour word
// ---------------------------------------------------------------------------

// MEASURED DEFECT, AND WHY THE FIX IS NOWHERE NEAR THE COLOUR.
//
// Over 20,000 markets on the code this replaced: 36.76% of them showed two eggs
// carrying the identical colour word, 62.34% had two drawn off the same one of
// the four hide anchors in src/forge/materials.ts, and 24.59% had two whose hue,
// saturation and lightness were all inside 0.04, 0.12 and 0.07 of each other,
// which is one colour to look at on a 375px card. The shell, weight and feel
// words were already nudged apart by the taken set above and the colour word
// deliberately was not, so the one token that mattered was the one token left to
// collide: it is the first half of the name, it is what the swatch shows, it is
// what a group says out loud and it is what the sentence naming the winner uses.
//
// The colour ITSELF may not move an inch. It is the hide the creature hatches
// with, worked out by the identical paletteFor call the renderer makes, and a
// market that shows a colour the creature does not have is the one thing this
// screen may never do. So the eggs are told apart in the WORD, by saying out
// loud the true thing about them that the shared word leaves out. The rates
// above are re-measured either side of the fix in test/market/rules.test.ts.

/**
 * The hue band inside a colour word, which is its last token.
 *
 * colourName builds depth, then strength, then the band ("dark vivid red"), so
 * reading off the end gets the band. Read that way rather than recomputed ON
 * PURPOSE: the bands live in src/ui/describe.ts, and a second copy of that table
 * here is the two-engines defect this feature's own headers warn about twice,
 * agreeing right up until somebody edits one of them.
 */
function hueBand(word: string): string {
  const parts = word.split(' ')
  return parts[parts.length - 1]
}

/**
 * Below this the two eggs are the same lightness to look at, so the sentence
 * reaches for saturation instead and says that difference rather than a true
 * one nobody can see.
 *
 * 0.02 because the hide jitter moves lightness by at most 0.08 either way, so
 * two eggs inside 0.02 are in the closest eighth of the range they could be
 * drawn from. Measured over 20,000 markets: the lightness gap inside a
 * colliding band is 0.0631 at the median and 0.0251 at the tenth percentile, so
 * this is the tail and not the common case.
 */
const FLAT_LIGHTNESS = 0.02

/**
 * The colour word for each egg, decided across the three of them at once.
 *
 * GROUPED BY HUE BAND AND NOT BY THE WHOLE PHRASE, because the band is what a
 * person says. "vivid red" and "dark vivid red" are two different strings and
 * one spoken word, and a group holding a phone between them says "the red one"
 * about both. Measured over 20,000 markets: 44.84% have two eggs in one band
 * and 3.27% have all three in one, against 36.76% sharing the whole phrase, so
 * grouping on the phrase would have left a quarter of the confusion behind and
 * called the job done.
 *
 * An egg with the band to itself keeps colourName's own answer untouched, which
 * is the half of this that matters for later: that is the word the Beastpedia
 * will use for the same animal once it hatches, and the two screens naming one
 * creature differently is its own defect. Only an egg that has to be told apart
 * from a sibling trades those qualifiers for the comparative.
 *
 * The comparative is the honest one either way round: of two eggs in the same
 * band one IS darker and one IS paler, and if lightness does not separate them
 * one is duller and one is richer. Three in a band leave the middle carrying
 * the bare band, so all three words differ and none of them claims anything
 * that is not so.
 */
function colourWords(hides: Hide[]): string[] {
  const plain = hides.map((hide) => colourName(hide.h, hide.s, hide.l))
  const bands = plain.map(hueBand)
  const out = plain.slice()

  for (const band of new Set(bands)) {
    const group: number[] = []
    for (let i = 0; i < bands.length; i++) if (bands[i] === band) group.push(i)
    if (group.length < 2) continue

    const light = (i: number): number => hides[i].l
    const strong = (i: number): number => hides[i].s
    const spread = (read: (i: number) => number): number => {
      const values = group.map(read)
      return Math.max(...values) - Math.min(...values)
    }
    // TIES ARE NOT RARE HERE AND THE FIRST VERSION OF THIS WAS WRONG ABOUT
    // THAT. jitter() in src/forge/materials.ts clamps lightness into
    // [0.12, 0.86] and saturation into [0.08, 0.92], so every hide whose anchor
    // was nudged past a stop lands EXACTLY on it, and dark hides pile up on
    // 0.12 by the thousand. Two eggs sitting on the clamp have the same
    // lightness to the bit, and "darker" said about one of them is not a
    // qualifier, it is a false statement about the animal a group is buying.
    // Caught on its first run by the honesty test in test/market/rules.test.ts,
    // at l 0.12 against l 0.12, and caught because that test reads the WORD this
    // returns and re-derives none of the rule that produced it.
    //
    // So the axis has to separate every egg in the group and not merely have a
    // wide-looking spread across it.
    const separates = (read: (i: number) => number): boolean =>
      new Set(group.map(read)).size === group.length

    // Lightness first, because it is what a person picks up fastest off two
    // swatches the size of a thumbnail, and saturation when lightness either
    // does not separate them or separates them by nothing worth saying.
    const onLight = separates(light) && (spread(light) >= FLAT_LIGHTNESS || !separates(strong))
    const read = onLight ? light : strong
    // AND WHEN NEITHER AXIS SEPARATES THEM, NOTHING IS SAID. Two eggs equal to
    // the bit in both lightness and saturation have no true comparative between
    // them, and the fallback has to be the plain word from colourName even
    // though that leaves two eggs sharing it. A screen naming them the same is
    // the defect this whole function exists to remove; a screen calling one of
    // them darker when it is not is a screen lying about the creature, which is
    // worse, and this refuses rather than reaching. Measured below, in the test
    // that counts what is left.
    if (!separates(read)) continue

    const order = group.slice().sort((a, b) => read(a) - read(b))
    out[order[0]] = `${onLight ? 'darker' : 'duller'} ${band}`
    out[order[order.length - 1]] = `${onLight ? 'paler' : 'richer'} ${band}`
    // Three in one band leave the middle carrying the bare band and claiming
    // nothing, which is the only word left that is both different from the
    // other two and true.
    for (let k = 1; k < order.length - 1; k++) out[order[k]] = band
  }
  return out
}

function look(
  seed: string,
  egg: number,
  claimed: number,
  hide: Hide,
  word: string,
  taken: Set<string>,
): EggLook {
  // A stream of its own, named, and never the one the genetics runs on. The
  // forge keeps its own generator for exactly this reason and says so in
  // materials.ts: a stream shared with the roll means editing a word list moves
  // what creatures carry. Naming the seed 'egg:' keeps this one somewhere the
  // roll will never be.
  const rand = makeRng('egg:' + seed)

  const shell = pick(SHELLS, rand, taken)
  const weight = pick(WEIGHTS, rand, taken)
  const feel = pick(FEELS, rand, taken)

  return {
    egg,
    seed,
    name: `${word}, ${shell}`,
    line: `${weight}. ${feel}.`,
    colour: hide.hex,
    price: priceOf(egg, claimed),
    hatchSpeed: hatchSpeedOf(egg),
    wait: waitPhrase(hatchSpeedOf(egg)),
  }
}

// THERE WAS AN eggLook(seed, egg, claimed) HERE, DESCRIBED AS "one egg on its
// own, for anywhere that has a seed and no market around it". There was nowhere.
// The market screen draws its three cards from eggsOnOffer, no screen in this
// app has ever shown a single egg, and its only callers were the five in
// test/market/rules.test.ts. That makes it the third export in this one feature
// kept alive by the tests written against it, after eggTerms and openMarket in
// rules.ts, and the rule those two set is that a thing is wired or it is gone.
//
// NOTHING IT SAID IS LOST. Its own doc claimed the property worth having, that a
// lone egg carries colourName's plain answer and never a comparative, and that
// is a statement about colourWords rather than about eggLook: it is asserted
// over the 41,413 eggs that have their hue band to themselves, through
// eggsOnOffer, in the same test file. The two tests that used to say it one egg
// at a time now ask the three-egg path, which is the path a person is on.
//
// WHAT IT WOULD TAKE TO GET IT BACK: a screen that shows one egg by itself. If
// one ever arrives it wants exactly these three lines, hideOf then look() with
// colourName's own word and an empty taken set, because an egg with no sibling
// has nothing to be darker than.

/**
 * The three, in mint order, sharing one set of words between them.
 *
 * The set is what stops the market screen describing two eggs the same way. It
 * is threaded through the three deliberately rather than each egg being asked
 * on its own: an egg's COLOUR is its own and cannot be nudged, because the
 * colour is the creature, but which word is put next to it can be.
 *
 * Every hide is read before any of them is named, because the colour word now
 * depends on the other two. Reading them first also means paletteFor is called
 * exactly once per egg, as it was when look() did it itself.
 */
export function eggsOnOffer(market: MarketState): EggLook[] {
  const hides: Hide[] = []
  for (let egg = 0; egg < EGG_COUNT; egg++) hides.push(hideOf(market.candidates[egg]))
  const words = colourWords(hides)

  const taken = new Set<string>()
  const out: EggLook[] = []
  for (let egg = 0; egg < EGG_COUNT; egg++) {
    out.push(look(market.candidates[egg], egg, market.claimed, hides[egg], words[egg], taken))
  }
  return out
}

// ---------------------------------------------------------------------------
// The words for everything else
// ---------------------------------------------------------------------------

/**
 * How long this one keeps a group waiting.
 *
 * Comparative rather than measured, and that is the line this app draws: what a
 * group is buying is a term of the purchase, like the price, so they are told
 * it. How many hours it is, and the fact that there is a multiplier at all,
 * are mechanics, and a group told the hours would be a group timing the thing
 * instead of raising it.
 */
export function waitPhrase(hatchSpeed: number): string {
  if (hatchSpeed < 1) return 'the longest wait of the three'
  if (hatchSpeed > 1) return 'the shortest wait of the three'
  return 'a middling wait'
}

/**
 * What to say when a pledge does not happen.
 *
 * Here rather than on the server, because these are the only sentences in the
 * feature and they belong beside the other ones. The server sends the reason
 * and never the words: a client matching on English is a client that breaks the
 * day somebody rewrites a line.
 */
export function refusalLine(reason: PledgeRefusal): string {
  switch (reason) {
    case 'closed':
      return 'That was settled while you were deciding.'
    case 'unclaimed':
      return 'Claim your place in the group before you spend anything.'
    case 'no-such-egg':
      return 'That is not one of the three.'
    case 'not-a-sum':
      return 'Coins go in whole ones.'
    case 'too-poor':
      return 'You do not have that many coins.'
    case 'nothing-pledged':
      return 'You have nothing on that one to take back.'
  }
}
