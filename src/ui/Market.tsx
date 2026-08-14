// Market.tsx: three eggs on a table, and a group deciding between them.
//
// This is now the first thing anybody sees of the app after the front door, and
// it exists to delete a specific thing: a creature used to be seeded the instant
// somebody clicked create, which meant the animal belonged to whoever clicked
// and everybody else arrived at something already decided. Nothing here is
// decided until the group pays for it together.
//
// EVERY NUMBER ON THIS SCREEN COMES OUT OF src/market/rules.ts. Not one price,
// shortfall, purse or leader is worked out in this file, and that is not tidiness:
// the last fleet lost a working feature to a rule that existed twice, where the
// server and the app agreed for half an hour at a time and then quietly did not,
// with every test green. A second answer to "which egg is ahead" would be exactly
// that defect wearing a nicer coat, and the screen showing it is the one place a
// group would believe it. Lowering a pledge is not a second kind of move either:
// it is the same message with a smaller figure in it, put through the same
// checkPledge the server puts it through.
//
// WHAT THE TIE BREAK DOES IS SAID OUT LOUD, because it decides which animal a
// group gets. Two eggs on equal coins draw two identical bars, one of them lit,
// and leadingEgg hands the lead to the lower index, which is always the cheaper
// egg. That rule is right and it must not be silent: a person watching their own
// coins draw level with the front runner is one drag away from buying the group
// something nobody picked, and until this screen said so there was nothing on it
// that could have told them.
//
// THE ONE THING THIS SCREEN DOES DECIDE IS WHAT IS OPTIMISTIC, and the split is
// deliberate. Your own slider and your own purse move under your thumb, because
// a control that waits for a round trip before it admits you touched it feels
// broken. The group's bar does not: that is other people's money as well as
// yours, and it has not been put in until the server says it has. So this screen
// can be a beat behind about the group and is never wrong about it.
//
// A MOVE THAT BUYS A DIFFERENT EGG IS ASKED ABOUT FIRST, and only that one.
// Lowering your own pledge cannot raise anybody else's total, but it can change
// which egg is in front, and an egg that was funded and merely losing is bought
// the instant it stops losing. So somebody dragging their coins off the egg they
// wanted could hand the group the plain one, for good, with nothing on screen
// having said so: their vote against it was the only thing holding it back. The
// resolution is not the defect and it is not blocked. It is named, and somebody
// has to mean it.
//
// ASKED WITH withPledge AND resolutionOf, on a state that is thrown away. Both
// are pure and both are what the Durable Object decides with, so the question
// "what would this do" is answered by the same two functions that will do it,
// and this file still holds no second copy of the arithmetic. Nothing goes on
// the wire to find out.
//
// RAISING IS LEFT ALONE, and that is arithmetic rather than taste. leadingEgg
// takes the largest total and breaks a tie toward the lower index, so putting
// more coins on one egg can only ever put THAT egg in front: no third egg's
// total moved, and the egg that was leading only loses the lead to the one that
// overtook it. The single purchase a raise can make is the egg it is pointing
// at, which is the vote working in plain sight, so a question there would be a
// question on nearly every drag and the screen would stop being usable.
//
// WHO MAY SPEND is isClaimedMember(seatId) and nothing else. An anonymous
// visitor watches and cannot pledge, which is what makes the passcode load
// bearing rather than decorative: coins on a self-asserted actorId are coins
// anybody can mint by clearing their local storage. They are not shown a dead
// control, because a button that cannot be pressed teaches nothing; they are
// shown the sentence and the way in.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type {
  MarketNote,
  MarketSnapshot,
  MarketState,
  PerEgg,
  PledgeRefusal,
} from '../core/types'
import type { EggLook } from '../market'
import { eggsOnOffer, refusalLine } from '../market'
import {
  EGG_COUNT,
  checkPledge,
  isClaimedMember,
  isEggIndex,
  leadingEgg,
  pledgedBy,
  purseOf,
  resolutionOf,
  shortfallOf,
  totalsOf,
  withPledge,
} from '../market/rules'
import { useSaid } from './Said'
import { drawCard, saveCard } from './passcode'
import { forgetGroup, groupLink, useCopy } from './useGroup'

// How long a refusal stays up. Long enough to read a short sentence twice,
// short enough that it is gone before somebody's next move, because every one of
// these is about a moment that has already passed.
const REFUSAL_MS = 4000

// How long a pledge is allowed to be in flight before the sliders answer again.
// The lock exists to stop one move being sent twice (see move()), the round trip
// it is really covering is under a fifth of a second, and this is only the
// number at which the screen stops believing an answer is coming. Long enough
// that a slow phone on a train never trips it, short enough that a message lost
// on a dying socket does not leave somebody staring at controls that have
// quietly stopped working.
const IN_FLIGHT_MS = 5000

// The purchase, beat by beat. The whole point of holding the screen here is that
// the group has just decided something together and the app should let that land
// rather than cutting to a lit tank. The last beat also happens to cover the
// renderer building its world, which is the one place this is doing two jobs.
const HATCHING_AT_MS = 1500
const LEAVING_AT_MS = 2500
const SETTLED_AT_MS = 2900

// How long a claim is given before the panel admits nothing came back.
//
// A claim can be refused, and the refusal is a plain 'error' message that the
// connection writes to the console and nowhere else, so the tap on "Claim my
// place" was silent for the one group it happens to: a group already holding as
// many people as it can. Nothing on screen moved, and the reason it had not
// moved was in a log nobody on a phone can open. Timing it out covers that
// refusal and every other way the message fails to land, without this screen
// holding its own copy of the server's cap on how many people a group takes.
const CLAIM_WAIT_MS = 5000

/**
 * Whether this egg is level with the one in front, and which side of the tie
 * break it is on. 'none' is the ordinary case, where nothing is level with it.
 *
 * Everything level with the leader is dearer than the leader, always:
 * leadingEgg breaks toward the lowest index and both price terms rise across
 * the three, so the lowest index of a level set is also the cheapest of it.
 */
type Level = 'none' | 'cheaper' | 'dearer'

interface MarketProps {
  view: MarketSnapshot
  /** Who the server has this browser seated as, which is what decides whether
   *  there is anything to spend. Never the id the browser made up for itself. */
  actorId: string
  actorName: string
  live: boolean
  note: MarketNote | null
  refusal: { reason: PledgeRefusal; at: number } | null
  bought: { egg: number; spent: number } | null
  freshCode: { actorId: string; code: string } | null
  onPledge: (egg: number, coins: number) => void
  /**
   * Nothing on this screen calls it any more, and it is declared only so the
   * files that own the wire can retire `withdraw` in one edit.
   *
   * A pledge SETS what somebody has on an egg, zero included, so taking coins
   * back off one is a pledge of nothing and the whole withdraw path is dead
   * weight on the client. It is still on the wire (core/types.ts, net, useGroup,
   * and the Durable Object), and App.tsx still hands this one over, so removing
   * it here alone would only break the caller. Optional so that whoever deletes
   * the message can delete this line with it and nothing has to be timed.
   */
  onWithdraw?: (egg: number) => void
  onClaim: () => void
  /** Called once the purchase has been given its moment. The app crosses to the
   *  creature on this, not on the message that bought it. */
  onSettled: () => void
}

/**
 * What the live region says while the purchase plays out.
 *
 * It used to say nothing: the region was blanked for the whole of `settling`,
 * so somebody using a screen reader heard every five coin pledge and then
 * silence at the exact moment the group bought the animal. The eggs leave the
 * screen during this, so the sentence has to carry what they carried.
 */
function boughtLine(bought: { egg: number; spent: number } | null, eggs: EggLook[]): string {
  if (bought === null) return ''
  const look = eggs.find((e) => e.egg === bought.egg)
  const name = look === undefined ? 'One of them' : `The ${look.name} one`
  return `${name} is the one. ${bought.spent} coins between you, and it is going to hatch.`
}

export default function Market({
  view,
  actorId,
  actorName,
  live,
  note,
  refusal,
  bought,
  freshCode,
  onPledge,
  onClaim,
  onSettled,
}: MarketProps): JSX.Element {
  const market = view.market
  const claimed = isClaimedMember(actorId)

  // What this person is holding, and what they have on each egg, as the server
  // has it. purseOf answers 0 coins for anybody without a place, which is the
  // honest number rather than a guard: showing a visitor a hundred coins would
  // be offering them money that does not exist.
  const purse = purseOf(market, actorId)
  const mine = purse.onEgg

  // What the sliders are showing, which is what the server has until a thumb
  // moves one. Null means "showing the market", and it goes back to null the
  // moment the market says anything, because the market is the truth and this is
  // only ever covering the gap before it answers.
  const [want, setWant] = useState<PerEgg | null>(null)
  const dragging = useRef(false)
  const shown: PerEgg = want ?? mine

  // Whether this person has a move the server has not answered yet.
  //
  // A LOCK, AND IT IS LOAD BEARING. Two ways to send one move twice and both are
  // ordinary: a release fires pointerup and then the blur that follows it, which
  // is the identical request seen twice, and dragging again before the echo lands
  // computes the second move from mine[], which is a figure the server has
  // already moved past. Refusing to send anything while one is outstanding closes
  // both, and it closes them without this file having to keep its own model of
  // what the server is about to think, which would be a second copy of the
  // market. The app does not lean on the far end folding a duplicate away either:
  // a screen that sends a message it knows to be redundant is a screen betting on
  // somebody else's write path.
  //
  // In a ref as well as in state because move() reads it, and what a handler
  // reads from state is whatever its closure captured, which is a render behind
  // exactly when two events land in one task.
  const [inFlight, setInFlight] = useState(false)
  const flying = useRef(false)
  // What that move was asking for, across all three, so the screen knows when it
  // has actually happened rather than when something happened.
  const target = useRef<PerEgg | null>(null)

  // A move somebody has made and has not been allowed to make silently: the
  // slider it came off, and the figure it would send. Null on nearly every move,
  // because nearly every move buys nothing.
  //
  // In a ref as well as in state for the reason the lock above is, and it is the
  // same trap: releasing a slider fires pointerup and then the blur behind it,
  // and disabling or leaving a focused control fires more blurs after that. Every
  // one of those calls move() again with the same figure, and a move() that read
  // this off state would be reading whatever its closure captured, which is a
  // render behind exactly when it matters. Asked twice, the second ask would sail
  // past the question and buy the egg.
  const [asking, setAsking] = useState<{ egg: number; value: number } | null>(null)
  const pending = useRef<{ egg: number; value: number } | null>(null)

  function fly(sending: boolean): void {
    flying.current = sending
    setInFlight(sending)
  }

  function pose(question: { egg: number; value: number } | null): void {
    pending.current = question
    setAsking(question)
  }

  function land(): void {
    target.current = null
    fly(false)
    // Not while a question is up. The market moving is usually somebody else,
    // and clearing the optimistic figure here would snap the slider back to what
    // the server has while the panel underneath it is still describing the move
    // that slider was showing. The question would then be about a figure nobody
    // could see.
    if (!dragging.current && pending.current === null) setWant(null)
  }

  /**
   * The system took the gesture, so the coins go back where the server has them.
   *
   * NOTHING IS SENT, and that is the whole of it. A pointer this screen never
   * sees the end of is not somebody deciding, and it used to be read as one: the
   * cancel was wired to the same handler as the release, so a diagonal drag the
   * browser resolved as a page scroll spent coins at whatever figure the thumb
   * had got to and put a note out in that person's name. The market scrolls past
   * three sliders and index.css hands the vertical gesture to the page on
   * purpose, so the browser taking one back is the ordinary case rather than the
   * rare one, and every other way a touch is stolen (a notification pull, the
   * app switcher, a second finger, a call coming in) arrives as the same event.
   *
   * Putting it back is setWant(null) and not a figure worked out here: null
   * means "showing the market", so the sliders answer purseOf again and this
   * function holds no idea of its own about what anybody has on an egg.
   *
   * HELD WHILE A QUESTION IS UP, for the reason land() is held. The figure the
   * panel is asking about is the one the slider is showing, and clearing it
   * would leave a sentence on screen about coins nobody could see. Nothing is
   * sent in that case either, so the worst it does is leave a question standing
   * that the next touch of the slider clears.
   */
  function revert(): void {
    if (pending.current !== null) return
    setWant(null)
  }

  // One region for everything the screen has to say, and one piece of state
  // behind it, so a refusal this file worked out for itself and a refusal the
  // server sent are the same kind of thing and cannot both be on screen.
  const [flash, setFlash] = useState<{ reason: PledgeRefusal; at: number } | null>(null)

  useEffect(() => {
    if (refusal !== null) setFlash(refusal)
  }, [refusal])

  useEffect(() => {
    if (flash === null) return
    const t = window.setTimeout(() => setFlash(null), REFUSAL_MS)
    return () => window.clearTimeout(t)
  }, [flash])

  useEffect(() => {
    // The market is the truth and the optimistic value steps aside for it, but
    // only once what it was asking for has actually happened.
    //
    // NOT ON THE FIRST MARKET TO ARRIVE. Somebody else moving while this move is
    // outstanding lands here and is not the answer to it, and it is the commoner
    // case by far: a market with four people in it is a market where a message
    // about somebody else arrives constantly. Stepping aside for one of those
    // would snap a slider back to what the server last heard from this person
    // and then forward again a beat later, which reads as the app losing their
    // coins and finding them. Waiting for the figure that was actually asked for
    // means that wobble is never painted.
    const aim = target.current
    if (aim !== null && (aim[0] !== mine[0] || aim[1] !== mine[1] || aim[2] !== mine[2])) return
    land()
  }, [market])

  useEffect(() => {
    // A refused pledge never comes back as a market, so without this the screen
    // would keep showing coins on an egg that has none of them and would stay
    // locked against the next attempt.
    if (refusal === null) return
    target.current = null
    fly(false)
    setWant(null)
  }, [refusal])

  useEffect(() => {
    // The one case neither of the two above covers: a message that went into a
    // socket nobody was listening on. Without it the sliders are dead for the
    // rest of the market and there is nothing on screen that could say why.
    if (!inFlight) return
    const t = window.setTimeout(() => {
      target.current = null
      fly(false)
      setWant(null)
    }, IN_FLIGHT_MS)
    return () => window.clearTimeout(t)
  }, [inFlight])

  // The three, drawn from their own candidate seeds. Keyed on the seeds and the
  // headcount because those are the only two things eggsOnOffer reads, and the
  // market object itself is new on every message: keyed on that, three palettes
  // would be rebuilt every time anybody moved a coin.
  const mint = market.candidates.join(':')
  const eggs = useMemo(() => eggsOnOffer(market), [mint, market.claimed])

  const totals = totalsOf(market)
  const leading = leadingEgg(market)
  const behind = shortfallOf(market, leading)
  const onTable = totals[0] + totals[1] + totals[2]

  // Which of the others are sitting on exactly the leader's total.
  //
  // NOT a second answer to which egg is ahead. leadingEgg has already answered
  // that and this compares two numbers totalsOf handed over, which is why it can
  // live here at all. It exists because the tie break was silent: two eggs level
  // drew two identical bars with one card lit and a line underneath calling one
  // of them "ahead", and somebody dragging their coins up to match the front
  // runner could pay for the LOWER egg without a word on screen having said that
  // is where level goes. Nothing about the rule changes; it is only said.
  const levelWith: number[] = []
  if (onTable > 0) {
    for (let egg = 0; egg < EGG_COUNT; egg++) {
      if (egg !== leading && totals[egg] === totals[leading]) levelWith.push(egg)
    }
  }
  // Closed the instant the leading egg reaches its price, which is the same
  // question the server asks before it writes anything. A screen still offering
  // sliders after that would be offering a spend that is already refused.
  const closed = resolutionOf(market) !== null

  // Everything this person could put anywhere, which is what they hold plus what
  // they already have on the table. Taken off purseOf rather than off the
  // starting purse, so the day coins come from somewhere other than claiming
  // this line does not quietly keep answering 100.
  const budget = purse.coins + purse.pledged
  const spoken = shown[0] + shown[1] + shown[2]
  const left = budget - spoken

  const phase = useSettling(bought, onSettled)
  const settling = bought !== null

  // What the move on the table would buy, if it would buy an egg other than the
  // one it is on. Worked out again on every render rather than remembered from
  // the moment somebody let go, because the market moves under a question that is
  // sitting there being read: a sentence naming an egg has to name the egg the
  // market would actually hand over, now, and not the one it would have handed
  // over when the thumb came up.
  //
  // Off during the purchase as well as after it, and settling is asked
  // separately from closed on purpose. Whether the pledge that ended the market
  // arrives here as a market before it arrives as a purchase is the far end's
  // business, so there is a window where something has been bought and the
  // market this screen is holding does not know it. A question about what to buy
  // must not be on screen inside that window.
  const wouldBuy =
    asking === null || closed || settling
      ? null
      : buysAnother(market, actorId, actorName, asking.egg, asking.value)

  useEffect(() => {
    // The question stopped applying, and there are only the two ways.
    //
    // Somebody else finished the market first, in which case there is nothing
    // left to ask and the line for it already exists: it is the one the server
    // answers a late pledge with.
    //
    // Or the purchase simply came off the table, because somebody put coins
    // somewhere that changed which egg is in front. THE MOVE THEN GOES, and that
    // is the deliberate half. It is an ordinary move again, and it is one this
    // person made with their thumb: the only reason it was held was the purchase
    // hanging off it, and holding their coins against a question that no longer
    // means anything would be this screen inventing a second thing to be wrong
    // about. It goes through commit(), so the shared checks see it either way.
    const question = asking
    if (question === null) return
    if (closed) {
      pose(null)
      setWant(null)
      setFlash({ reason: 'closed', at: Date.now() })
      return
    }
    if (wouldBuy !== null) return
    pose(null)
    commit(question.egg, question.value)
  }, [market])

  /**
   * Send it, the checks having been made.
   *
   * Separate from move() because there are three ways in and all three have to
   * be checked the same: a slider let go of, a purchase somebody has just said
   * yes to, and a held move whose purchase went away under it. checkPledge is
   * asked here rather than trusted from the caller, so none of the three can be
   * the one that forgot.
   */
  function commit(egg: number, value: number): void {
    const no = checkPledge(market, actorId, egg, value)
    if (no !== null) {
      setFlash({ reason: no, at: Date.now() })
      setWant(null)
      return
    }
    // Recorded before anything is sent, so the answer can be recognised when it
    // comes back. One egg moves and the other two are whatever the server
    // already has, because a move is only ever about one of the three.
    const aim: PerEgg = [mine[0], mine[1], mine[2]]
    aim[egg] = value
    onPledge(egg, value)
    target.current = aim
    fly(true)
  }

  /**
   * Move this person's coins on one egg to exactly `value`.
   *
   * ONE MESSAGE, WHICHEVER WAY THE SLIDER WENT, and that is the whole of it now:
   * a pledge SETS what somebody has on an egg and zero is a legal figure, so
   * raising, lowering and clearing are the same move with different numbers in
   * it. Coming down used to be a withdrawal followed by a smaller pledge, and
   * between those two messages the market was in a state nobody had asked for:
   * the withdrawal alone could put a different egg in front AND pay for it, so
   * dragging a slider down could buy the group a creature nobody chose, for
   * good. Everything this file did to hide the flicker that pair produced went
   * with it.
   *
   * ONE MESSAGE IS NOT THE SAME AS ONE HARMLESS MESSAGE, which is what the pair
   * being gone was read as meaning. The intermediate state went; the purchase did
   * not. A single smaller pledge on the egg somebody is holding still moves the
   * lead, and the egg that takes it can be one that was paid for all along and
   * only losing. So the send is held and the question is asked, exactly there and
   * nowhere else: a move that buys nothing, or that buys the egg it is on, goes
   * the instant the thumb lifts, because that is nearly every move on this screen
   * and a screen that asks about all of them cannot be used.
   *
   * The order of the two checks matters. checkPledge answers first, so somebody
   * who cannot afford the figure is told that rather than being offered a
   * purchase the server was going to refuse anyway.
   */
  function move(egg: number, value: number): void {
    // Nothing at all until the last one has been answered. See the lock above:
    // this line is what makes the four ways off a slider safe to have.
    if (flying.current) return
    // Nor while one is waiting on a person. Blur is the one that gets here: the
    // panel below the slider is reached by leaving the slider, so tapping either
    // of its two buttons fires this with the same figure that raised it, and
    // unguarded the tap on "leave my coins where they are" would buy the egg.
    if (pending.current !== null) return
    if (value === mine[egg]) return

    const no = checkPledge(market, actorId, egg, value)
    if (no !== null) {
      setFlash({ reason: no, at: Date.now() })
      setWant(null)
      return
    }
    if (buysAnother(market, actorId, actorName, egg, value) !== null) {
      pose({ egg, value })
      return
    }
    commit(egg, value)
  }

  function drag(egg: number, value: number): void {
    // Touching a slider again is deciding again, so a question about the last
    // release goes with it and the next release asks its own. Without this the
    // held figure and the figure under the thumb come apart, and the panel is
    // then describing a move the screen is no longer offering.
    if (pending.current !== null) pose(null)
    const next: PerEgg = [shown[0], shown[1], shown[2]]
    next[egg] = value
    setWant(next)
  }

  // The object's own sentences land here too, and until they did this screen
  // was the likeliest place in the app to be refused and the only one that
  // could not say so. Seventeen sentences reach a store; ActionBar was the one
  // reader, and ActionBar is not rendered on the market at all. So a group
  // hitting the hourly cap, or a full group, or a rename too soon, while
  // choosing the animal they are going to keep for months, was answered in a
  // console.
  //
  // Newest wins over the market's own refusal, because both are answers to
  // something somebody just did and two of them at once is the app arguing with
  // itself. That rule is ActionBar's, written down there for the same reason.
  const fromObject = useSaid()
  const fromHere = flash === null ? null : { text: refusalLine(flash.reason), at: flash.at }
  const answer =
    fromHere === null
      ? fromObject
      : fromObject === null || fromHere.at >= fromObject.at
        ? fromHere
        : fromObject

  const said = !live
    ? 'Not connected to the market just now.'
    : answer !== null
      ? answer.text
      : note !== null
        ? noteLine(note, eggs)
        : ''

  return (
    <main className={phase >= 3 ? 'market is-leaving' : 'market'}>
      <div className="market-inner">
        <header className="market-head">
          <h1 className="label">The night market</h1>
          {claimed && !settling && (
            <span className="purse">
              you hold <b>{left}</b>
            </span>
          )}
        </header>

        {!settling && (
          <>
            <p className="market-premise">
              Three eggs, and one of them is going to be yours. Put coins behind the one you want.
              Whichever is in front when it is paid for is the one that hatches, and everything on
              the other two comes back to whoever put it there.
            </p>
            <p className="market-who">{headcountLine(market.claimed)}</p>
          </>
        )}

        <p className="market-say" aria-live="polite">
          {settling ? boughtLine(bought, eggs) : said}
        </p>

        {freshCode !== null && !settling && (
          <FreshCode
            code={freshCode.code}
            personName={actorName}
            groupName={view.handle ?? 'your group'}
            groupHandle={view.handle}
          />
        )}

        {/* Above the three and not under them, which is where this started.
            Somebody who cannot spend needs the reason next to the thing they
            cannot do, and three cards is a long way down a phone to carry a
            question. It also occupies the same slot the code panel does, so the
            two swap over at the moment they should: the block goes the instant
            somebody claims and the code they must not lose takes its place. */}
        {!claimed && !settling && <ClaimPlace live={live} onClaim={onClaim} />}

        <ul className="eggs">
          {eggs.map((look) => (
            <Egg
              key={look.egg}
              look={look}
              total={totals[look.egg]}
              short={shortfallOf(market, look.egg)}
              ahead={look.egg === leading && onTable > 0}
              level={levelOf(look.egg, leading, levelWith)}
              backers={backersOn(market, look.egg, actorId)}
              claimed={claimed}
              mine={mine[look.egg]}
              value={shown[look.egg]}
              // The other two hold the rest of the purse, so this one can only
              // ever be moved up to what is not already spoken for. That is the
              // whole overspend guard and it is stated once: somebody with 12
              // coins spread over three eggs cannot put 13 on any of them.
              ceiling={Math.max(0, budget - spoken + shown[look.egg])}
              // Held while a question is up, except on the slider the question
              // came off. That one stays live because touching it again is how
              // somebody changes their mind about the figure, and because a
              // control that disables itself under its own focus throws a
              // keyboard back to the top of the document, which is a long way
              // from the two buttons it needs. The other two are held because
              // the figure being asked about is counted against this person's
              // budget and the server has not got it: a ceiling worked out from
              // it would offer coins that are not free yet.
              live={live && !closed && !inFlight && (asking === null || asking.egg === look.egg)}
              buying={
                asking !== null && asking.egg === look.egg && wouldBuy !== null
                  ? {
                      name: eggs[wouldBuy].name,
                      onGoAhead: () => {
                        pose(null)
                        commit(asking.egg, asking.value)
                      },
                      onKeep: () => {
                        pose(null)
                        setWant(null)
                      },
                    }
                  : null
              }
              settling={settling}
              won={bought !== null && bought.egg === look.egg}
              hatching={phase >= 2}
              onDragStart={() => {
                dragging.current = true
              }}
              onDrag={(value) => drag(look.egg, value)}
              onDrop={(value) => {
                dragging.current = false
                move(look.egg, value)
              }}
              // The same two lines as onDrop with the move taken out, which is
              // exactly what the difference between the two events is worth.
              onTaken={() => {
                dragging.current = false
                revert()
              }}
            />
          ))}
        </ul>

        {settling && bought !== null ? (
          <div className="market-bought">
            <p className="bought-line">That is the one.</p>
            <p className="bought-cost">
              The <b>{isEggIndex(bought.egg) ? eggs[bought.egg].name : 'chosen'}</b> one, at{' '}
              {bought.spent} coins between you.
            </p>
            <p className="hint">Everything on the other two is back with whoever put it there.</p>
            {phase >= 2 && <p className="bought-last">Something is going to hatch.</p>}
          </div>
        ) : onTable === 0 ? (
          <p className="market-foot">Nobody has put anything in yet.</p>
        ) : levelWith.length > 0 ? (
          // The sentence somebody reads out to the room, and on a tie it has to
          // carry the tie break, because this is the one line on the screen that
          // says what happens next. "is ahead" said of one of two equal bars was
          // not true and was not harmless: the level egg it did not name is the
          // one somebody would have gone on funding.
          <p className="market-foot">
            {levelWith.length === 1 ? 'Two of them are level.' : 'All three are level.'}{' '}
            {levelWith.length === 1 ? 'Level goes to the cheaper one' : 'Level goes to the cheapest one'},
            so the <b>{eggs[leading].name}</b> one is the one that gets bought
            {behind > 0 ? `, ${behind} short.` : ', and it is paid for.'}
          </p>
        ) : (
          <p className="market-foot">
            The <b>{eggs[leading].name}</b> one is ahead
            {behind > 0 ? `, ${behind} short.` : ', and paid for.'}
          </p>
        )}

        {!settling && <Invite groupId={view.groupId} alone={market.claimed <= 1} />}
      </div>
    </main>
  )
}

/**
 * Which beat of the purchase we are on: 1 won, 2 hatching, 3 leaving.
 *
 * Beats rather than one long animation, because the whole file is wrapped in a
 * prefers-reduced-motion rule that crushes every animation to 0.01ms. A single
 * keyframed sequence would jump to its last frame instantly for exactly the
 * readers least able to catch up, and they would see the purchase as a flicker,
 * which is the one thing this was asked not to be.
 */
function useSettling(bought: { egg: number } | null, onSettled: () => void): number {
  const [phase, setPhase] = useState(0)
  const settle = useRef(onSettled)
  settle.current = onSettled

  useEffect(() => {
    if (bought === null) return
    setPhase(1)
    const a = window.setTimeout(() => setPhase(2), HATCHING_AT_MS)
    const b = window.setTimeout(() => setPhase(3), LEAVING_AT_MS)
    const c = window.setTimeout(() => settle.current(), SETTLED_AT_MS)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
      window.clearTimeout(c)
    }
  }, [bought])

  return phase
}

interface EggProps {
  look: EggLook
  total: number
  short: number
  ahead: boolean
  level: Level
  backers: { id: string; name: string; coins: number }[]
  claimed: boolean
  mine: number
  value: number
  ceiling: number
  live: boolean
  /**
   * The purchase this slider is one tap away from making, when it is a purchase
   * of a different egg. Null on the other two cards and on nearly every move.
   *
   * The name is the leader's own, off the same eggsOnOffer the card headings and
   * the line under the three are drawn from, so the egg somebody is being asked
   * about is named in the words they have been reading it under all along.
   */
  buying: { name: string; onGoAhead: () => void; onKeep: () => void } | null
  settling: boolean
  won: boolean
  hatching: boolean
  onDragStart: () => void
  onDrag: (value: number) => void
  onDrop: (value: number) => void
  /** The gesture went away without this screen ever seeing it end, which is a
   *  different thing from a release and must not be sent as one. */
  onTaken: () => void
}

function Egg({
  look,
  total,
  short,
  ahead,
  level,
  backers,
  claimed,
  mine,
  value,
  ceiling,
  live,
  buying,
  settling,
  won,
  hatching,
  onDragStart,
  onDrag,
  onDrop,
  onTaken,
}: EggProps): JSX.Element {
  const classes = ['egg']
  if (ahead && !settling) classes.push('is-ahead')
  if (settling) classes.push(won ? 'is-won' : 'is-lost')

  // The bar is the group's money against the price, and both numbers came out of
  // the shared module: the total is summed from the pledge list there and the
  // price is priceOf. Nothing here decides what an egg costs.
  //
  // Full for the winner while the purchase is settling, and that is not
  // decoration. The market this screen is holding is the last one the server
  // sent, and whether the pledge that closed it arrived as a market before it
  // arrived as a purchase is the far end's business, not this one's. An egg that
  // has been bought must not be drawn as still short of its price on the strength
  // of which order two messages happened to be written in.
  const filled = settling && won ? 1 : Math.min(1, look.price > 0 ? total / look.price : 0)

  return (
    <li className={classes.join(' ')}>
      <div className="egg-top">
        <EggMark colour={look.colour} cracking={won && hatching} />
        <div className="egg-id">
          <h2 className="egg-name">{look.name}</h2>
          <p className="egg-wait">{look.wait}</p>
        </div>
        <span className="egg-price">
          {look.price}
          <span className="egg-coin">coin</span>
        </span>
      </div>

      <p className="egg-line">{look.line}</p>

      <div className="egg-meter" aria-hidden="true">
        <i style={{ transform: `scaleX(${filled})` }} />
      </div>

      {/* Gone once it is bought, for the same reason the bar is forced full: the
          figures here are from the last market the server sent and the purchase
          is already decided, so the line that says what it cost is the one below
          the three, said once. */}
      {!settling && <p className="egg-state">{eggStateLine(total, short, ahead, level)}</p>}

      {backers.length > 0 && (
        <ul className="egg-backers">
          {backers.map((who) => (
            <li key={who.id}>
              {who.name} <b>{who.coins}</b>
            </li>
          ))}
        </ul>
      )}

      {claimed && !settling && (
        <div className="egg-mine">
          <span className="label">you</span>
          {ceiling === 0 && value === 0 ? (
            <p className="egg-none">your coins are all on the others</p>
          ) : (
            <input
              className="egg-slider"
              type="range"
              min={0}
              max={ceiling}
              step={1}
              value={value}
              disabled={!live}
              aria-label={`Your coins on the ${look.name} one`}
              onChange={(e) => onDrag(Math.round(Number(e.target.value)))}
              onPointerDown={onDragStart}
              // Committed on release rather than on every step, so dragging
              // from 0 to 40 is one row in the pledge list and not forty.
              //
              // THREE OF THESE SAY SOMEBODY DECIDED and the fourth says the
              // opposite, which is why it no longer shares their handler. A
              // thumb lifted, an arrow key let go of and a focus that moved on
              // are all a person finishing, and any of the three going unheard
              // would leave a slider showing coins that were never put in. They
              // are safe to have together only because move() refuses to send
              // anything while the last one is unanswered: bare, a release fires
              // pointerup and then the blur behind it and spends twice.
              //
              // A CANCELLED POINTER IS THE PHONE TAKING THE GESTURE AWAY, and
              // sending it as a release is how this screen spent coins nobody
              // released on. .egg-slider is touch-action: pan-y in index.css
              // because the page scrolls down past three of these, so the
              // browser is entitled to claim a diagonal drag for the page, and
              // claiming it is announced by cancelling the pointer. It reverts,
              // which is what the sheet head in App.tsx has always done with the
              // same event.
              onPointerUp={(e) => onDrop(Math.round(Number(e.currentTarget.value)))}
              onPointerCancel={onTaken}
              onKeyUp={(e) => onDrop(Math.round(Number(e.currentTarget.value)))}
              onBlur={(e) => onDrop(Math.round(Number(e.currentTarget.value)))}
            />
          )}
          <b className="egg-count">{value}</b>
        </div>
      )}

      {/* True while a thumb is down and while the message is on its way, and it
          says the same thing about both: this figure is not the group's yet.
          "Letting go puts it in" was the first draft and it is a lie for the
          half second after somebody has already let go. */}
      {claimed && !settling && value !== mine && <p className="egg-pending">not in yet</p>}

      {/* Under the slider it came off, and not at the top of the page with the
          rest of what the screen says. Three cards is a long way down a phone:
          a question about this move belongs where the thumb already is, or it
          reads as the slider having quietly stopped working.
          The panel is the claim panel's shape and nothing new, because it is the
          same kind of object, a thing the screen has to say with a way out of it
          attached, and this file does not get to invent a second one.
          role="alert" on the sentence and not on the whole block: a live region
          is for the words, and the two buttons after it are reached in the order
          they are read, which is the order they are in. */}
      {buying !== null && (
        <div className="claim">
          <span className="label">This buys an egg</span>
          <p role="alert">
            Coming down here puts the <b>{buying.name}</b> one in front, and it already has what
            it costs on it, so that is the egg the group buys and the creature you all get. Your
            coins were the only thing keeping it back. It cannot be undone.
          </p>
          <div className="row">
            {/* The plain pill on the one that changes nothing, and the quieter
                control on the one that spends everybody's coins for good. Both
                are one tap and neither is hidden: the question is which of them
                the screen leans on, and it does not lean on the irreversible
                one. The pill carries the short label because .btn does not wrap,
                and the label that has to carry a generated egg name is the text
                control, which does. */}
            <button type="button" className="btn" onClick={buying.onKeep}>
              Leave my coins where they are
            </button>
            <button type="button" className="btn-text" onClick={buying.onGoAhead}>
              Buy the {buying.name} one
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * The egg itself, in the hide colour of the creature inside it.
 *
 * The colour is paletteFor(seed) through eggLook, which is the identical call
 * the renderer and the Beastpedia make, so the egg on this screen is drawn in
 * the colour the animal will actually be. A swatch chosen any other way would be
 * a screen that lies to a group about what they are buying, and they would find
 * out an hour later.
 */
function EggMark({ colour, cracking }: { colour: string; cracking: boolean }): JSX.Element {
  return (
    <svg
      className="egg-mark"
      width="30"
      height="38"
      viewBox="0 0 16 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 1.4c3.4 0 6.2 5 6.2 9.4 0 4.1-2.7 7.2-6.2 7.2S1.8 14.9 1.8 10.8C1.8 6.4 4.6 1.4 8 1.4Z"
        fill={colour}
        stroke="rgba(232, 235, 231, 0.16)"
        strokeWidth="0.8"
      />
      {cracking && (
        <path
          className="egg-crack"
          d="M5.4 6.6 8.2 9 6.6 11.4 9.8 13.8 8.4 16.4"
          stroke="var(--ground)"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/**
 * Taking a place in the group, and the one way it can fail silently.
 *
 * A CLAIM CAN BE REFUSED, and until this component existed the refusal went
 * nowhere a person could see it. A group may hold as many people as the Durable
 * Object allows and no more, and the far end answers a claim past that with a
 * plain 'error' message, which the connection writes to the console: on this
 * screen the tap did nothing at all, twice, five times, with the button lighting
 * up each time and the panel never going away.
 *
 * SURFACED RATHER THAN PREVENTED, deliberately. Preventing the tap means this
 * file holding its own copy of how many people a group takes, and a bound that
 * exists in two places is the exact defect the rest of this screen is built to
 * avoid: the day the server's number moves, this one keeps refusing people the
 * server would have seated. Waiting for the answer and saying so when none comes
 * needs no copy of anything, and it covers every other way a claim fails to land
 * as well, which a cap check would not.
 *
 * The panel is gone the moment a claim works, because claiming reseats this
 * browser under an id the server issued and the caller stops rendering this. So
 * there is nothing here to unwind on success, and the only state is whether an
 * answer is still owed.
 */
function ClaimPlace({ live, onClaim }: { live: boolean; onClaim: () => void }): JSX.Element {
  const [asked, setAsked] = useState(0)
  const [missed, setMissed] = useState(false)
  const waiting = asked > 0 && !missed

  useEffect(() => {
    if (asked === 0) return
    const t = window.setTimeout(() => setMissed(true), CLAIM_WAIT_MS)
    return () => window.clearTimeout(t)
  }, [asked])

  return (
    <div className="claim">
      <span className="label">You are watching</span>
      <p>
        Anybody can see what the group is choosing. Spending is for people who have taken a place in
        it, because right now this browser is just a guest and anybody could turn up as you.
      </p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setMissed(false)
          // Stamped rather than flagged, so asking again after a failure is a
          // new value and starts the wait over. A boolean set twice is the same
          // boolean and the effect would not run.
          setAsked(Date.now())
          onClaim()
        }}
        disabled={!live || waiting}
      >
        {waiting ? 'Asking' : 'Claim my place'}
      </button>
      {missed && (
        <p className="hint hint-bad">
          That did not take. Either the group is already as full as it can get, or nothing came back
          just now. Try once more.
        </p>
      )}
    </div>
  )
}

/**
 * The code, at the one moment it exists.
 *
 * A second copy of what the group panel does, and it is here because that panel
 * is not on this screen: somebody who claims a place at the market and is not
 * shown the code has lost it for good, since the server keeps only a hash and
 * has no path that could produce it again. There is no automatic dismissal and
 * the way out says what it is agreeing to.
 */
function FreshCode({
  code,
  personName,
  groupName,
  groupHandle,
}: {
  code: string
  personName: string
  groupName: string
  groupHandle: string | null
}): JSX.Element | null {
  const [saved, setSaved] = useState(false)
  if (saved) return null

  return (
    <div className="claim claim-fresh">
      <span className="label">This is your code. It is shown once.</span>
      <p className="claim-code">{code}</p>
      <p className="hint">
        Type it to be yourself again on any phone. Nobody can look it up or send it again.
      </p>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const card = drawCard({ code, personName, groupName, groupHandle })
            if (card !== null) saveCard(card, personName)
          }}
        >
          Save it as a picture
        </button>
      </div>
      <button type="button" className="btn-text" onClick={() => setSaved(true)}>
        I have saved it
      </button>
    </div>
  )
}

/**
 * The way to get anybody else here.
 *
 * Not optional decoration on this screen. Prices are built on how many people
 * have a place, so a group of one at the market is looking at the only prices it
 * will ever see until somebody else arrives, and the panel that normally carries
 * the link belongs to a creature that does not exist yet.
 */
function Invite({ groupId, alone }: { groupId: string; alone: boolean }): JSX.Element {
  const { copied, copy } = useCopy()
  const link = groupLink(groupId)
  return (
    <div className="market-invite">
      {alone ? (
        // "Nothing is going to be decided by one person" was here and it was
        // false. The cheapest egg is flat at 75 against a purse of 100, at every
        // headcount, so one member can always end the market on their own, and
        // that is deliberate: it is what stops a group of two whose second person
        // never comes back from being stuck forever. The other two are 55 + 50
        // and 70 + 55 per member, which is over one purse at every headcount and
        // always will be, so they genuinely do need somebody else. Saying which
        // is which is more interesting than the sentence that was here, and it
        // is the actual reason to send the link.
        <p>
          Any one of you can take the cheapest egg alone, and that is as far as one person gets: the
          other two cost more than anybody holds. Send this to the rest of them.
        </p>
      ) : (
        <span className="label">Bring somebody in</span>
      )}
      <div className="link-row">
        <span className="link-box" title={link}>
          {link.replace(/^https?:\/\//, '')}
        </span>
        <button type="button" className={copied ? 'btn is-copied' : 'btn'} onClick={() => copy(link)}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {/* The same control the group panel carries, and it has to be here for the
          same reason it had to be added there. The app reopens the last group on
          every launch, and a group is now remembered from the moment it answers,
          which is hours before it owns an animal. Without this, somebody who
          opened a stranger's link once and did not want it would be returned to
          that market every time they launched, with nothing anywhere that could
          take them anywhere else. */}
      <button
        type="button"
        className="btn-text leave"
        onClick={() => {
          // Forget before clearing, or the next launch restores the group that
          // was just walked away from.
          forgetGroup()
          location.hash = ''
        }}
      >
        Start or open a different creature
      </button>
    </div>
  )
}

/**
 * Who else has coins on this egg, in the order they first moved.
 *
 * The whole point of the screen is that the animal belongs to the group rather
 * than to one person, so the names are not decoration. Arrival order rather than
 * size, because the pledge list is the only record of how the group got here and
 * ranking people by how much they spent is a leaderboard, which this app does
 * not have anywhere else either.
 *
 * Each amount comes from pledgedBy rather than from a running sum kept here: the
 * only thing this function decides is who is on the list.
 */
function backersOn(
  market: MarketState,
  egg: number,
  me: string,
): { id: string; name: string; coins: number }[] {
  const order: string[] = []
  const names = new Map<string, string>()
  for (const pledge of market.pledges) {
    if (pledge.actorId === me) continue
    if (!names.has(pledge.actorId)) order.push(pledge.actorId)
    // Latest name wins, the way the chronicle takes the name off the row:
    // somebody who changed what they are called mid-market should not spend the
    // rest of it under the old one.
    names.set(pledge.actorId, pledge.actorName)
  }
  const out: { id: string; name: string; coins: number }[] = []
  for (const id of order) {
    const coins = pledgedBy(market, id)[egg]
    if (coins > 0) out.push({ id, name: names.get(id) ?? '', coins })
  }
  return out
}

/**
 * The egg this move would buy, when that is not the egg the move is on.
 *
 * NOT A SECOND ANSWER TO ANYTHING. It is withPledge and then resolutionOf, both
 * out of the shared module, both pure, and both the calls the Durable Object
 * makes in that order when it writes a pledge. The state they run on is built
 * here and dropped here, so this asks the server's own question of a market that
 * never existed and nothing about the real one moves.
 *
 * SAME EGG IS NOT THE CASE THIS IS FOR. Coins going onto an egg and that egg
 * winning is the whole mechanic in one move, done deliberately, on the card the
 * person is looking at. It cannot even happen on the way down: taking coins off
 * an egg only lowers that egg's total, so an egg that resolves after being
 * lowered had already resolved before, and the market was closed.
 *
 * The stamp is 0 rather than a clock reading. Nothing in totalsOf, leadingEgg or
 * resolutionOf looks at it, the row is thrown away a line later, and a real
 * clock in here would make a pure answer depend on when it was asked.
 */
function buysAnother(
  market: MarketState,
  actorId: string,
  actorName: string,
  egg: number,
  coins: number,
): number | null {
  const after = withPledge(market, { actorId, actorName, egg, coins, at: 0 })
  const done = resolutionOf(after)
  if (done === null || done.egg === egg) return null
  return done.egg
}

/**
 * Which side of the tie break this egg is on.
 *
 * 'none' unless something is level with the one in front, which is the ordinary
 * market. The leader of a level set is always the cheapest of it, so the two
 * words a person can check against the prices printed on the cards are the two
 * words used.
 */
function levelOf(egg: number, leading: number, levelWith: number[]): Level {
  if (levelWith.length === 0) return 'none'
  if (egg === leading) return 'cheaper'
  return levelWith.includes(egg) ? 'dearer' : 'none'
}

/**
 * What is on this egg and where that leaves it, in one line under the bar.
 *
 * The level cases are here because "paid for but behind another" was said of an
 * egg that was not behind anything, it was level, and losing a tie break is a
 * different fact about a group's money than losing a race. Both level lines name
 * the price, since the price is what actually decided it and it is printed at the
 * top of the same card.
 */
function eggStateLine(total: number, short: number, ahead: boolean, level: Level): string {
  const money = short > 0 ? `${total} in, ${short} short` : `${total} in, and paid for`
  if (level === 'cheaper') return `${money}, level and cheaper`
  if (level === 'dearer') return `${money}, level but dearer`
  if (short === 0 && !ahead) return `${total} in, paid for but behind another`
  return money
}

/**
 * How many people have a place, and what that has to do with the prices.
 *
 * Nobody at all is the state the person who made the group is looking at, so it
 * is the case written first rather than the one the plural falls through to. It
 * also has to admit something: priceOf never prices an egg below one member, so
 * the figures on an empty market are what the first person to take a place will
 * pay, and a screen that said "nobody yet" beside prices built on one would be
 * quietly wrong about the only two numbers on it.
 *
 * The direction is left out of the sentence deliberately. Prices go up as people
 * arrive and every egg still gets MORE reachable, because a place is worth a
 * hundred coins and adds at most fifty five to a price, so "they go up" and "they
 * go down" are both a lie in one direction. What is true is that they move.
 */
function headcountLine(claimed: number): string {
  if (claimed < 1) return 'Nobody has taken a place yet. This is what the first of you will pay.'
  if (claimed === 1) return 'One of you has a place here. What the eggs cost moves as more of you take one.'
  return `${claimed} of you have a place here. What the eggs cost moves as more of you take one.`
}

/**
 * What just happened, said out loud. The server sends a reason and a name and
 * never a sentence, so that rewriting this line never breaks a client.
 *
 * A pledge SETS a figure, so the number on a 'pledged' note is what that person
 * has on that egg now and not what they just added, and the sentence says so.
 * The old wording read "put 20 behind the pale one" when somebody had just come
 * down from 60, and it read "put 0 behind the pale one" when they cleared the
 * egg, which is the message the slider now sends for that.
 */
function noteLine(note: MarketNote, eggs: EggLook[]): string {
  const which = isEggIndex(note.egg) ? eggs[note.egg].name : 'one of them'
  if (note.kind !== 'pledged') return `${note.actorName} took ${note.coins} back off the ${which} one.`
  return note.coins > 0
    ? `${note.actorName} now has ${note.coins} behind the ${which} one.`
    : `${note.actorName} took their coins back off the ${which} one.`
}
