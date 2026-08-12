// rules.ts: the egg market, as arithmetic.
//
// A group is made with no seed and three candidate eggs. The members put coins
// behind the one they want, the pledging IS the vote, and the moment the egg in
// front reaches its price it is bought: its seed becomes the group's seed and
// every coin on the other two goes back to whoever put it there. Everything in
// that sentence that is a number or a rule is in this file, and it is called by
// the Durable Object and by the app.
//
// ONE COPY, WITH THE ARGUMENTS REQUIRED. The last fleet lost a working feature
// to a rule that existed twice: the server and the app each held their own idea
// of the same number, agreed for a while, and then quietly did not, with every
// test green. So nothing here takes a default, nothing here is optional, and no
// caller is ever in a position to supply half of an answer. A price is
// priceOf(egg, claimed) or it does not exist.
//
// NOT IN src/dna, on purpose. That folder is gated by test/dna/purity.test.ts
// and holds the genetics, and none of this is genetics: no roll here can reach
// rollGenome and no egg has a genome until it is bought. But the discipline
// that gate exists to enforce is kept anyway, because a price is computed on
// two engines that have to agree: everything below is built from addition,
// subtraction, multiplication and division, which are the four IEEE 754
// requires to be correctly rounded, and the prices themselves are integers.
//
// NO ENGLISH IN THIS FILE. What a person reads is src/market/index.ts, which
// needs the palette and therefore needs three.js. Keeping the two apart is what
// lets the worker import this half without dragging a renderer into a Durable
// Object. The worker imports '../src/market/rules' and never '../src/market'.

import { stageOfGrowth } from '../dna'
import type {
  GroupView,
  MarketSnapshot,
  MarketState,
  PerEgg,
  Pledge,
  PledgeRefusal,
  Purse,
} from '../core/types'

// ---------------------------------------------------------------------------
// Who is allowed to spend
// ---------------------------------------------------------------------------

/**
 * The mark of somebody who holds a place in the group.
 *
 * The same prefix the Durable Object puts on an actorId it issued itself, and
 * it lives here rather than there because both sides now need to ask the
 * question: the server refuses a pledge from anybody else, and the app has to
 * know whether to offer the buttons at all. A second '@' typed into the app
 * would be a rule that agrees with the server until one of them is edited.
 *
 * An id without it was typed by a browser, so coins on one would be coins
 * anybody can mint by clearing their local storage. That is the whole reason
 * only claimed members may pledge, and it is what makes the passcode load
 * bearing rather than decorative.
 */
export const CLAIMED_PREFIX = '@'

export function isClaimedMember(actorId: string): boolean {
  return actorId.startsWith(CLAIMED_PREFIX)
}

/** Whether this group is still at the market. The one place the question is
 *  asked, so the app and the server cannot answer it differently. */
export function atMarket(view: GroupView): view is MarketSnapshot {
  return 'market' in view
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * What a member has, once, for claiming their place.
 *
 * A hundred because every price below is then readable as a share of one
 * person: the plain egg for a pair is 110, which is a bit over half of each of
 * them, and nobody has to be told what a coin is worth.
 *
 * There is no other source of money in this unit and no ledger anywhere. A
 * purse is this number minus what that person has on the table, worked out from
 * the pledge list every time it is asked. Jobs and selling arrive later and
 * will want a stored balance; until they do, a stored one would be a
 * subtraction kept in two places for no gain.
 */
export const STARTING_PURSE = 100

export const EGG_COUNT = 3

/** Whether a number off the wire names one of the three. Every path that takes
 *  an egg index from outside runs through this first. */
export function isEggIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < EGG_COUNT
}

// ---------------------------------------------------------------------------
// What the three eggs cost
// ---------------------------------------------------------------------------

/**
 * Price is a floor plus a rate per claimed member, and the plain egg is floor
 * only.
 *
 * THE PLAIN EGG DOES NOT SCALE, and that is a deadlock fix rather than a
 * pricing taste. It was 40 plus 35 a member, so from two claimed members it
 * cost 110 against a purse of 100 and no single person could close it. Read as
 * a guard that sounded right, and it was the opposite: a group of two whose
 * second member tapped "claim my place" and never came back could not afford
 * ANY egg for the rest of time, because claiming raised the price and brought
 * money that never arrived. Nothing on screen could have said why.
 *
 * Flat at 75 it is always inside one purse, at every headcount, so one member
 * can always get the group moving. That is the correct thing to be true of the
 * cheap egg in particular: it is the "we are stuck, let us just go" option, and
 * the group pays for it in the slowest hatch of the three.
 *
 * THE RATE on the other two is what makes a group of eight and a group of two
 * look at the same decision. Both rates are below the purse a new member
 * brings, which is the property that matters and the reason neither is 100:
 * claiming adds 100 coins and at most 55 to a price, so a friend turning up
 * always leaves every egg more reachable than it was, never less.
 *
 * WHAT THE FLOOR ACTUALLY GUARANTEES, stated carefully because the first
 * version of this comment overclaimed it. It holds against one MEMBER, not
 * against one person. A claim is bound to a socket's seat, so somebody with two
 * tabs is two members with two purses, and no arithmetic here can prevent that
 * while the app has no accounts and the link is the access control. What stands
 * in its place is that the market carries every pledge under the name that made
 * it, so a group can see who backed what. That is the same trust model as the
 * rest of this app rather than a gap in this part of it.
 *
 * Worked through, against a purse of 100 per member:
 *
 *   one member, 100 in the group
 *     plain  75         inside one purse, so a lone member is never stuck
 *     middle 55 + 50  = 105   just out of reach alone
 *     fine   70 + 55  = 125   out of reach alone
 *
 *   two members, 200 in the group
 *     plain  75         37% of the group's money, and one person can close it
 *     middle 55 + 100 = 155   78 each
 *     fine   70 + 110 = 180   90 each, nearly everything they have
 *
 *   four members, 400 in the group
 *     plain  75         19%, still one purse
 *     middle 55 + 200 = 255   64%, three purses
 *     fine   70 + 220 = 290   73%, three of the four, and 190 clear of any one
 *                             member's purse
 *
 *   eight members, 800 in the group
 *     plain  75          9%, still one purse
 *     middle 55 + 400 = 455   57%, five purses
 *     fine   70 + 440 = 510   64%, six of the eight
 *
 * The order plain, middle, fine holds at every headcount, and the gap between
 * plain and the other two widens as a group grows, which is the intended shape:
 * the more people there are, the more the cheap egg reads as giving up on the
 * choice rather than as a bargain. Every figure is a whole number of coins by
 * construction, an integer base plus an integer rate times a whole number of
 * people, so the price on the phone and the price in the Durable Object are the
 * same bits rather than nearly the same.
 */
const EGG_PRICES: { base: number; perMember: number }[] = [
  // The plain egg does NOT scale, and that is a deadlock fix rather than a
  // pricing choice. It used to cost 40 + 35 per member, so from two claimed
  // members up it was 110 against a purse of 100: a group of two where the
  // second person taps "claim my place" and then never comes back could not
  // afford ANY egg, ever, and nothing on screen said why. Claiming raised the
  // price and brought money that never arrived.
  //
  // Flat at 75 it is always inside one purse, so one member can always get the
  // group moving on their own. That is the right thing to be true of the cheap
  // egg specifically: it is the "we are stuck, let us just go" option, and it
  // costs the group the slowest hatch to take it.
  { base: 75, perMember: 0 },
  { base: 55, perMember: 50 },
  { base: 70, perMember: 55 },
]

/**
 * How fast this egg goes through the egg stage, as a multiplier on growth.
 *
 * Dearer is faster, which is what gives the cheap egg a reason to exist: it is
 * not a worse animal, it is a longer wait. An untouched creature takes six
 * hours to hatch at pace 1, so the three are 6 / 0.75 = 8 hours, 6 / 1 = 6
 * hours and 6 / 1.5 = 4 hours, and the spread between the cheapest and the
 * dearest is exactly double.
 *
 * The middle egg is 1, which is to say it is the tuning the app already had.
 * That is not a coincidence and it is the reason the numbers are these: a group
 * made before markets existed carries no multiplier, reads as 1, and is
 * therefore on the middle egg. Nothing about a creature that already exists
 * moves by a single growth point.
 *
 * Both other values are exact in binary, 3/4 and 3/2, so multiplying by one of
 * them is exact on every engine rather than nearly exact on most of them.
 */
const HATCH_SPEEDS: number[] = [0.75, 1, 1.5]

/** What a group that never had a market lives at. Every group made before this
 *  feature existed, which is all of them, and it is the middle egg's speed, so
 *  hatchAdjusted leaves those creatures exactly where they were. */
export const GRANDFATHERED_HATCH_SPEED = 1

/**
 * An egg index that is definitely one of the three.
 *
 * Every caller that takes an index from the wire has already been through
 * isEggIndex, so this is the belt on top of the braces: a price is a thing the
 * screen always has to show, and falling back to the cheapest egg is a wrong
 * number, where throwing here is a blank market.
 */
function eggIndex(egg: number): number {
  return isEggIndex(egg) ? egg : 0
}

/**
 * What one egg costs this group right now.
 *
 * Claimed is floored and never taken below one. A market seen by somebody
 * before anybody has claimed shows what the first member will pay rather than a
 * cheaper phantom price nobody can ever buy at, and a count that arrives
 * mangled cannot make an egg free.
 */
export function priceOf(egg: number, claimed: number): number {
  const terms = EGG_PRICES[eggIndex(egg)]
  const members = claimed > 1 ? Math.floor(claimed) : 1
  return terms.base + terms.perMember * members
}

export function hatchSpeedOf(egg: number): number {
  return HATCH_SPEEDS[eggIndex(egg)]
}

// THERE WAS AN eggTerms(claimed) HERE, AND AN EggTerms INTERFACE UNDER IT,
// DESCRIBED AS "what a market screen is drawn from, and what the server prices
// a pledge against". Neither was true of either: the screen builds its three
// cards from eggsOnOffer in src/market/index.ts, which asks priceOf and
// hatchSpeedOf per egg itself, and the worker prices a pledge by calling
// checkPledge. Its only caller anywhere was one test, which now walks the three
// indices and asks priceOf directly, exactly as both real callers do. This repo
// has shipped a fully unit tested component that nothing ever called twice
// over, and a doc comment naming callers that do not exist is how the second
// one stayed invisible, so the rule here is that a thing is wired or it is gone.

// ---------------------------------------------------------------------------
// How long the egg stage lasts
// ---------------------------------------------------------------------------

/**
 * The growth point at which the egg stage ends.
 *
 * Found by asking stageOfGrowth rather than by writing the number down again.
 * The number is in src/dna/express.ts, the worker already keeps a copy of it in
 * the constant that turns hours into growth, and a third copy here is the shape
 * of defect this repo has already paid for once: the day the stage table moves,
 * every copy of the old value keeps working and keeps meaning something that is
 * no longer true. A search costs sixty odd calls to a comparison, once, at
 * import.
 *
 * Bisection lands exactly on the boundary rather than near it, because the
 * boundary is a whole number and a midpoint hits it on the way down.
 */
function eggStageEnd(): number {
  let hi = 1
  while (stageOfGrowth(hi) === 0) hi = hi * 2
  let lo = 0
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2
    if (stageOfGrowth(mid) === 0) lo = mid
    else hi = mid
  }
  return hi
}

export const EGG_ENDS = eggStageEnd()

/**
 * A plain growth figure, with the egg this group bought taken into account.
 *
 * The egg stage is stretched or squashed and NOTHING ELSE IS. Below the point
 * where this creature hatches the figure is scaled; above it the curve carries
 * on at its own rate, shifted by whatever the egg stage saved or cost. The two
 * halves meet exactly at EGG_ENDS, so there is no step at the boundary, and the
 * rate after hatching is 1 whatever egg was bought. The growth curve is heavily
 * tested and load bearing and this deliberately does not touch it.
 *
 * NOT IDEMPOTENT, and that is the hazard to hold on to. f(f(x)) is not f(x) for
 * any speed except 1, so the plain figure is what gets stored and this is
 * applied on the way out, once. Fold the answer back into the stored total and
 * the creature is re-aged on every read.
 *
 * At speed 1 this returns its argument unchanged on both branches, which is
 * what makes every group that predates the market safe: they read as 1 and come
 * out of here as themselves.
 */
export function hatchAdjusted(plain: number, hatchSpeed: number): number {
  // A missing or mangled speed has to mean "as it was", never "faster".
  if (!(hatchSpeed > 0)) return plain
  const hatchesAt = EGG_ENDS / hatchSpeed
  // The brackets are load bearing and were put here by a measurement. Written
  // as plain + EGG_ENDS - hatchesAt the two constants are added and subtracted
  // either side of the figure, and (x + 5) - 5 is not x in floating point:
  // 6.6666666 came back as 6.666666600000001 at speed 1, which is the speed
  // every group made before this feature existed reads at. Worked out first,
  // the offset is exactly 0 at speed 1 and adding it cannot move anybody.
  const offset = EGG_ENDS - hatchesAt
  return plain < hatchesAt ? plain * hatchSpeed : plain + offset
}

// ---------------------------------------------------------------------------
// Reading a market
// ---------------------------------------------------------------------------

function emptyPerEgg(): PerEgg {
  return [0, 0, 0]
}

/** What is on each egg. Summed from the pledges every time rather than kept
 *  anywhere: a running total is a number that can be wrong. */
export function totalsOf(market: MarketState): PerEgg {
  const totals = emptyPerEgg()
  for (const pledge of market.pledges) {
    if (isEggIndex(pledge.egg)) totals[pledge.egg] += pledge.coins
  }
  return totals
}

/** What one person has on each egg. */
export function pledgedBy(market: MarketState, actorId: string): PerEgg {
  const mine = emptyPerEgg()
  for (const pledge of market.pledges) {
    if (pledge.actorId === actorId && isEggIndex(pledge.egg)) mine[pledge.egg] += pledge.coins
  }
  return mine
}

/**
 * What somebody has to spend.
 *
 * Anybody who has not claimed a place has nothing, which is the honest answer
 * rather than a guard: they cannot pledge, so a screen that showed them a
 * hundred coins would be offering them money that does not exist.
 */
export function purseOf(market: MarketState, actorId: string): Purse {
  if (!isClaimedMember(actorId)) {
    return { actorId, coins: 0, pledged: 0, onEgg: emptyPerEgg() }
  }
  const onEgg = pledgedBy(market, actorId)
  const pledged = onEgg[0] + onEgg[1] + onEgg[2]
  return { actorId, coins: STARTING_PURSE - pledged, pledged, onEgg }
}

/**
 * Which egg is in front.
 *
 * Ties break toward the lower index, which is the cheaper egg. A tie has to
 * break the same way on every screen or two people watch the same market decide
 * two different things, so it breaks on the fixed mint order rather than on who
 * pledged last, and it breaks toward the smaller commitment.
 */
export function leadingEgg(market: MarketState): number {
  const totals = totalsOf(market)
  let best = 0
  for (let egg = 1; egg < EGG_COUNT; egg++) {
    if (totals[egg] > totals[best]) best = egg
  }
  return best
}

/** How much more this egg needs before it could be bought, never below zero. */
export function shortfallOf(market: MarketState, egg: number): number {
  const short = priceOf(egg, market.claimed) - totalsOf(market)[eggIndex(egg)]
  return short > 0 ? short : 0
}

/** What a bought egg hands the server: which one won, the seed that becomes the
 *  group's, how fast it hatches and what the group actually paid. */
export interface Resolution {
  egg: number
  seed: string
  hatchSpeed: number
  spent: number
}

/**
 * Whether this market is over, and what it bought.
 *
 * The egg in front, once what is on it reaches what it costs. Asked of a state
 * rather than of an event, so the server asks it after writing a pledge and the
 * app asks it of the state it is holding, and neither can be looking at a
 * market that is already decided without knowing.
 *
 * An egg can be fully funded and still not win, because the group wants a
 * different one more. That is the vote working: the money on the table is the
 * count, and the price is only the moment the count is allowed to end. Nothing
 * is stranded by it either, since anybody may take a pledge back and put it
 * somewhere else.
 */
export function resolutionOf(market: MarketState): Resolution | null {
  const egg = leadingEgg(market)
  const spent = totalsOf(market)[egg]
  if (spent < priceOf(egg, market.claimed)) return null
  return { egg, seed: market.candidates[egg], hatchSpeed: hatchSpeedOf(egg), spent }
}

// ---------------------------------------------------------------------------
// Pledging
// ---------------------------------------------------------------------------

/**
 * Whether this pledge may happen, or why not.
 *
 * Null means yes. The server calls it before writing and the app calls it
 * before offering the button, which is the point of it being one function:
 * a button the app enables and the server then refuses is a bug the person
 * doing it has no way to understand.
 *
 * Order matters. A closed market answers first because nothing else about the
 * request is interesting once the egg is bought, and an unclaimed visitor
 * answers before the sums because the thing they need on screen is the claim
 * panel and not the price.
 */
export function checkPledge(
  market: MarketState,
  actorId: string,
  egg: number,
  coins: number,
): PledgeRefusal | null {
  if (resolutionOf(market) !== null) return 'closed'
  if (!isClaimedMember(actorId)) return 'unclaimed'
  if (!isEggIndex(egg)) return 'no-such-egg'
  // Whole coins, above nothing. Number.isInteger turns away NaN and Infinity in
  // the same breath, which matters because both arrive off an open socket.
  // Zero is a real answer now: a pledge SETS the figure on an egg, so zero is
  // how somebody takes theirs back off it, and it is the only message the
  // slider ever needs to send.
  if (!Number.isInteger(coins) || coins < 0) return 'not-a-sum'
  // Against what they hold PLUS whatever is already on this egg, because a
  // pledge replaces rather than adds. Read as an addition, moving 100 coins
  // from egg 2 to egg 2 reads as needing 200, so somebody who had put
  // everything on one egg could never adjust it downward at all: the check
  // refused and the message said they were too poor to spend money they had
  // already spent on the very thing they were spending it on.
  const free = purseOf(market, actorId).coins + pledgedBy(market, actorId)[egg]
  if (coins > free) return 'too-poor'
  return null
}

/** Whether there is anything to take back off this egg, or why not. */
export function checkWithdrawal(
  market: MarketState,
  actorId: string,
  egg: number,
): PledgeRefusal | null {
  if (resolutionOf(market) !== null) return 'closed'
  if (!isClaimedMember(actorId)) return 'unclaimed'
  if (!isEggIndex(egg)) return 'no-such-egg'
  if (pledgedBy(market, actorId)[egg] <= 0) return 'nothing-pledged'
  return null
}

/**
 * The market with one more pledge on it.
 *
 * Returns a new state and changes nothing, so the app can show what a pledge
 * would do before anybody commits to it and the server can decide whether the
 * result resolves before it writes a row.
 *
 * Appended rather than added into a per person total, because the order pledges
 * arrived in is the only record of how the group got here, and a market screen
 * that can say who moved first is worth more than a shorter list.
 */
export function withPledge(market: MarketState, pledge: Pledge): MarketState {
  // SETS what this person has on this egg. It used to add a row, which meant
  // lowering a pledge was two messages, a withdrawal and then a smaller one,
  // and the market was briefly in a state nobody asked for: the withdrawal
  // alone could push a different egg into the lead AND fund it, buying the
  // group a creature by way of somebody dragging a slider down. That purchase
  // is irreversible and it is the worst thing this screen can do, so the
  // intermediate state is gone rather than guarded.
  //
  // Order is preserved for a pledge that already existed, because the list is
  // the record of how the group got here and somebody adjusting their figure
  // has not just arrived.
  const held = market.pledges.findIndex((p) => p.actorId === pledge.actorId && p.egg === pledge.egg)
  if (held < 0) return { ...market, pledges: [...market.pledges, pledge] }
  const pledges = market.pledges.slice()
  pledges[held] = { ...pledge, at: pledges[held].at }
  return { ...market, pledges }
}

/** The market with everything one person had on one egg taken back off it.
 *  Their other eggs are untouched: this is changing your mind about one egg,
 *  not leaving the market. */
export function withWithdrawal(market: MarketState, actorId: string, egg: number): MarketState {
  return {
    ...market,
    pledges: market.pledges.filter((p) => !(p.actorId === actorId && p.egg === egg)),
  }
}

// THERE WAS AN openMarket(candidates, claimed) HERE, DESCRIBED AS "the one place
// a market is born". It was not one place and it was not where they are born:
// the Durable Object mints its candidates and builds the MarketState inline in
// marketNow(), and nothing on any player path ever called this. Its only callers
// were in test/market/rules.test.ts, which is a birth site that exists to
// exercise the birth site, and that is the shape of dead export this repo has
// already shipped twice.
//
// WHAT IT WOULD TAKE TO GET IT BACK, since the sentence it claimed is one worth
// having: marketNow() in worker/monstertime.ts calls this instead of assembling
// the object itself, at which point there really is one place and the comment
// becomes true. That is a change to the worker, which is not this file's to
// make, so this is gone rather than left sitting here describing a wiring
// nobody did.
