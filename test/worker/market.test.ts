// The egg market, as the server enforces it.
//
// The server is the only writer, so it is the only thing that decides who spent
// what and which of the three animals a group ends up with. src/market/rules.ts
// has its own suite and it is where the arithmetic is proven; nothing is
// re-proved here. What is proved here is the half that only exists in the
// Durable Object: that a group is born with no seed, that coins can only be
// spent by somebody who holds a passcode, that the seed is set once and never
// again, and that a group which already has a creature never sees any of it.
//
// EVERY FIXTURE IS BUILT SO THAT EVERY OTHER GATE WOULD PASS, and every refusal
// has a positive control beside it: the identical request with the offending
// condition taken away, which has to succeed. A negative test goes green the
// moment anything at all refuses, and this repo has already shipped a check that
// was never wired up with two tests passing the whole time on a different rule's
// refusal (test/worker/sleep.test.ts says the rest of that story). A pledge has
// five ways to be turned away and four of them are one letter apart on screen,
// so without the pairing this file would be green with the whole market deleted.
//
// Where a claim is about a population rather than one tidy example, the sample
// size is part of the test: three seeds looked at once says nothing about a
// generator, and one refusal says nothing about a rule.
//
// A PLEDGE SETS A FIGURE AND DOES NOT ADD ONE, which is the sentence most of the
// fixtures below are built out of. Somebody moving from a hundred down to sixty
// sends one message saying sixty, leaves one row, and the market is never in the
// state between the two. The older spelling was a withdrawal followed by a
// smaller pledge, and the withdrawal on its own could put a different egg in
// front AND fund it, so dragging a slider down could buy the group a creature
// nobody chose, permanently. Zero is a real figure and is how somebody empties
// an egg.
//
// THE PLAIN EGG DOES NOT MOVE WITH THE HEADCOUNT. It is flat at 75 and the other
// two still scale, so every fixture that needs a price to change when somebody
// claims uses egg 1 or egg 2, and every fixture that needs a price one person
// can close uses egg 0.

import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { EGG_COUNT, EGG_ENDS, STARTING_PURSE, priceOf, totalsOf } from '../../src/market/rules'
import { rollActivity, sleepState, sleepStateOf } from '../../src/dna/index'
import type { GroupSnapshot, MarketSnapshot, MarketState } from '../../src/core/types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Nobody has woken it, which is what every test about the timetable itself
 *  wants to say. Named rather than a bare zero, because a lone 0 at the end of
 *  five arguments reads as a placeholder and this one is a fact. */
const NEVER_WOKEN = 0

/**
 * Growth an untouched creature accrues in an hour at pace 1, before any egg is
 * taken into account.
 *
 * Derived rather than written down: the egg stage is EGG_ENDS points long and
 * takes six hours to get through at pace 1, which is the same relationship the
 * worker builds GROWTH_PER_MS out of. A third copy of five would be a number
 * that goes on meaning something after the stage table moves.
 */
const PLAIN_HOUR = EGG_ENDS / 6

/** One message off the wire. Whole messages rather than their types, because
 *  half of what is checked here is what a refusal actually carries. */
interface Said {
  type: string
  [key: string]: unknown
}

interface Wire {
  send(message: unknown): void
  all(): Said[]
  close(): void
}

async function makeGroup(): Promise<string> {
  const response = await SELF.fetch('https://x/api/monstertime/groups', { method: 'POST' })
  expect(response.status).toBe(201)
  return ((await response.json()) as { groupId: string }).groupId
}

async function open(groupId: string): Promise<Wire> {
  const response = await SELF.fetch(`https://x/api/monstertime/groups/${groupId}/socket`, {
    headers: { Upgrade: 'websocket' },
  })
  const socket = response.webSocket
  if (!socket) throw new Error('no socket')
  socket.accept()
  const said: Said[] = []
  socket.addEventListener('message', (e: MessageEvent) => {
    if (typeof e.data === 'string' && e.data !== 'pong') said.push(JSON.parse(e.data) as Said)
  })
  // Waited for on purpose. Every connection is sent the group unasked, so a
  // helper that returned before it landed would let that arrive later and be
  // read as the answer to the first thing this socket said: the first refusal
  // test written here passed on the connect message and proved nothing.
  for (let i = 0; i < 40 && said.length === 0; i++) await scheduler.wait(25)
  expect(said.length).toBeGreaterThan(0)
  return { send: (m) => socket.send(JSON.stringify(m)), all: () => said, close: () => socket.close() }
}

/**
 * Say one thing and wait for the answer to THAT thing.
 *
 * Counted from where the log had got to before sending, because the market is
 * broadcast to everybody every time it moves: without the mark, a test would
 * read somebody else's pledge as the reply to its own and pass whatever the
 * server did with the message it actually sent. Throws rather than returning
 * null when nothing comes back, so a rule that silently drops a message fails
 * here rather than three assertions later.
 */
async function reply(w: Wire, message: unknown, types: string[]): Promise<Said> {
  const from = w.all().length
  w.send(message)
  for (let i = 0; i < 60; i++) {
    const found = w.all().slice(from).find((one) => types.includes(one.type))
    if (found !== undefined) return found
    await scheduler.wait(25)
  }
  throw new Error(`nothing came back for ${JSON.stringify(message)}`)
}

/** Somebody watching, with no passcode and therefore no money. */
async function guest(groupId: string, who: string): Promise<Wire> {
  const w = await open(groupId)
  w.send({ type: 'hello', actorId: who, actorName: who })
  await scheduler.wait(40)
  return w
}

/** Somebody who has claimed a place, which is the only way anybody has coins. */
async function member(groupId: string, who: string): Promise<Wire> {
  const w = await guest(groupId, who)
  const claimed = await reply(w, { type: 'claim' }, ['claimed', 'error'])
  // Stated rather than assumed. A member whose claim quietly failed has no
  // purse, so every refusal below would be green and would be green for the
  // wrong reason, which is the exact failure this file is shaped against.
  expect(claimed.type).toBe('claimed')
  expect(String(claimed.actorId).startsWith('@')).toBe(true)
  return w
}

async function pledge(w: Wire, egg: unknown, coins: unknown): Promise<Said> {
  return reply(w, { type: 'pledge', egg, coins }, ['market', 'bought', 'refused'])
}

async function withdraw(w: Wire, egg: number): Promise<Said> {
  return reply(w, { type: 'withdraw', egg }, ['market', 'bought', 'refused'])
}

async function view(groupId: string): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)
  // Named here because a 500 from a missing column is the outage this whole
  // area of the app has already had once, and a body-shape assertion on a 500
  // reads as a shape problem.
  expect(response.status).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

async function marketOf(groupId: string): Promise<MarketState> {
  const seen = (await view(groupId)) as unknown as MarketSnapshot
  expect(seen.market).toBeDefined()
  return seen.market
}

async function creatureOf(groupId: string): Promise<GroupSnapshot> {
  const seen = (await view(groupId)) as unknown as GroupSnapshot
  expect(seen.genome).toBeDefined()
  return seen
}

/** The three eggs a group was offered, read before anybody buys one. What every
 *  test about "they got the animal they paid for" is checked against. */
async function candidates(groupId: string): Promise<string[]> {
  return (await marketOf(groupId)).candidates
}

// ---------------------------------------------------------------------------

describe('a group is born at the market', () => {
  it('has no creature, and three eggs instead', async () => {
    const groupId = await makeGroup()
    const seen = await view(groupId)
    // The whole feature in three assertions. A seed here would be an animal
    // that already belonged to whoever pressed create, decided before anybody
    // else had arrived, which is what this replaces.
    expect('genome' in seen).toBe(false)
    expect('market' in seen).toBe(true)

    const market = seen.market as MarketState
    expect(market.candidates.length).toBe(EGG_COUNT)
    expect(market.claimed).toBe(0)
    expect(market.pledges).toEqual([])
    for (const seed of market.candidates) expect(seed).toMatch(/^[0-9a-f]{64}$/)
  })

  it('draws three that are nobody else’s, over enough groups to mean it', async () => {
    // A generator that returned the same three every time would pass a
    // one-group test perfectly. Eight groups is twenty-four seeds, and the
    // assertion is over all of them at once rather than three at a time.
    const seeds: string[] = []
    for (let i = 0; i < 8; i++) seeds.push(...(await candidates(await makeGroup())))
    expect(seeds.length).toBe(24)
    expect(new Set(seeds).size).toBe(24)
  })

  it('takes no seed from outside, however the group was asked for', async () => {
    // The property that was load bearing before the market existed and is load
    // bearing still: a seed a client could choose is a creature two groups
    // could both have. create() no longer takes one from the endpoint either.
    const forged = 'ff'.repeat(32)
    const response = await SELF.fetch('https://x/api/monstertime/groups', {
      method: 'POST',
      body: JSON.stringify({ seed: forged, candidates: [forged, forged, forged] }),
    })
    const groupId = ((await response.json()) as { groupId: string }).groupId
    for (const seed of await candidates(groupId)) expect(seed).not.toBe(forged)
  })

  it('sends the market on connect rather than a snapshot of nothing', async () => {
    const w = await open(await makeGroup())
    for (let i = 0; i < 40 && w.all().length === 0; i++) await scheduler.wait(25)
    expect(w.all()[0]?.type).toBe('market')
    expect(w.all().some((one) => one.type === 'snapshot')).toBe(false)
    w.close()
  })

  it('refuses to be acted on or named, and says so as a group rather than as a mistake', async () => {
    // Every one of these fixtures is a thing a stage nought creature is offered
    // and a person who has just said hello, so the only reason any of them can
    // be refused is that there is no creature. Without this the message would
    // reach the log and the group's first act would be one taken before they
    // chose the animal.
    const groupId = await makeGroup()
    const w = await guest(groupId, 'ann')
    // All three are on the tray a stage nought creature is offered and none of
    // them is the waking, so every other gate in act() would let them through:
    // take the market check away and each of these is written into the log.
    for (const variantId of ['sing.humDusk', 'give.riverStone', 'tend.sitNearby']) {
      const said = await reply(w, { type: 'act', variantId }, ['action', 'error', 'asleep'])
      expect(said.type).toBe('error')
    }
    const named = await reply(w, { type: 'name', name: 'Bug' }, ['named', 'error'])
    expect(named.type).toBe('error')
    // Nothing was written. A row here would be in the log for the rest of the
    // animal's life.
    expect((await marketOf(groupId)).pledges).toEqual([])
    w.close()
  })
})

describe('only a claimed member may spend', () => {
  it('refuses a guest, and takes the identical pledge the moment they claim', async () => {
    // The positive control is the SAME connection, the SAME egg and the SAME
    // number of coins, seconds later. The only difference between the two halves
    // is whether this person holds a passcode, so nothing else can be what
    // refused. Coins on a self-asserted actorId are coins anybody can mint by
    // clearing their local storage, which is the whole reason for the rule.
    const groupId = await makeGroup()
    const w = await guest(groupId, 'ann')

    const refused = await pledge(w, 0, 10)
    expect(refused.type).toBe('refused')
    expect(refused.reason).toBe('unclaimed')
    expect((await marketOf(groupId)).pledges).toEqual([])

    const claimed = await reply(w, { type: 'claim' }, ['claimed', 'error'])
    expect(claimed.type).toBe('claimed')
    const taken = await pledge(w, 0, 10)
    expect(taken.type).toBe('market')
    expect((await marketOf(groupId)).pledges.length).toBe(1)
    w.close()
  })

  it('refuses one from a connection that never said who it was', async () => {
    const groupId = await makeGroup()
    const w = await open(groupId)
    const refused = await pledge(w, 0, 10)
    expect(refused.reason).toBe('unclaimed')
    w.close()
  })

  it('refuses a guest on every egg and every amount, not just the first one tried', async () => {
    // One refusal proves one branch. This is the whole surface a watcher can
    // reach: three eggs, and sums from a single coin to a whole purse.
    const groupId = await makeGroup()
    const w = await guest(groupId, 'watcher')
    for (let egg = 0; egg < EGG_COUNT; egg++) {
      for (const coins of [1, 10, STARTING_PURSE]) {
        expect((await pledge(w, egg, coins)).reason).toBe('unclaimed')
      }
    }
    expect((await marketOf(groupId)).pledges).toEqual([])
    w.close()
  })

  it('will not let a guest take a claimed member’s coins back off the table', async () => {
    // The other half of the same rule. Withdrawing is not spending, so it is
    // easy to leave open, and it moves the vote just as surely: taking somebody
    // else's coins off the leading egg is deciding which animal the group gets.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    expect((await pledge(ann, 1, 30)).type).toBe('market')

    const watcher = await guest(groupId, 'watcher')
    expect((await withdraw(watcher, 1)).reason).toBe('unclaimed')
    expect((await marketOf(groupId)).pledges.length).toBe(1)

    // The control: the person whose coins they are takes them back, from the
    // same egg, seconds later.
    expect((await withdraw(ann, 1)).type).toBe('market')
    expect((await marketOf(groupId)).pledges).toEqual([])
    ann.close()
    watcher.close()
  })
})

describe('what a pledge has to be', () => {
  it('refuses an egg that is not on offer, and takes every one that is', async () => {
    const groupId = await makeGroup()
    const w = await member(groupId, 'ann')
    // Off the end, before the start, between two, and every shape a socket can
    // carry where a number was meant. null is in here on purpose: Number(null)
    // is 0, so a coerced field would read as a considered choice of the cheapest
    // egg and quietly spend somebody's coins on it.
    for (const egg of [3, 7, -1, 1.5, Number.NaN, null, undefined, '0', {}, [1]]) {
      const said = await pledge(w, egg, 5)
      expect(said.type).toBe('refused')
      expect(said.reason).toBe('no-such-egg')
    }
    expect((await marketOf(groupId)).pledges).toEqual([])

    // The control, and it is all three: the identical five coins on each egg
    // that does exist. Five is small enough that none of them buys anything.
    for (let egg = 0; egg < EGG_COUNT; egg++) {
      expect((await pledge(w, egg, 5)).type).toBe('market')
    }
    expect((await marketOf(groupId)).pledges.length).toBe(EGG_COUNT)
    w.close()
  })

  it('refuses anything that is not a whole number of coins, and takes one that is', async () => {
    const groupId = await makeGroup()
    const w = await member(groupId, 'ann')
    // Zero is deliberately NOT in this list any more. It belonged here while a
    // pledge added to a total and spending nothing was a message with no
    // meaning; a pledge sets the figure now, so zero says "take mine off this
    // egg" and is what a slider sends at the bottom of its travel.
    for (const coins of [-5, -1, 0.5, 12.5, Number.NaN, null, undefined, '10', {}]) {
      const said = await pledge(w, 0, coins)
      expect(said.type).toBe('refused')
      expect(said.reason).toBe('not-a-sum')
    }
    expect((await marketOf(groupId)).pledges).toEqual([])

    expect((await pledge(w, 0, 10)).type).toBe('market')
    w.close()
  })

  it('refuses coins nobody has, and takes the same request one coin lighter', async () => {
    const groupId = await makeGroup()
    const w = await member(groupId, 'ann')
    // Everything on the dearest egg, which at one claimed member costs more than
    // a purse, so the market cannot resolve underneath this test.
    expect(priceOf(2, 1)).toBeGreaterThan(STARTING_PURSE)
    expect((await pledge(w, 2, STARTING_PURSE)).type).toBe('market')

    // Nothing left for either of the others, at any size.
    for (const egg of [0, 1]) {
      for (const coins of [1, 5, STARTING_PURSE]) {
        const said = await pledge(w, egg, coins)
        expect(said.type).toBe('refused')
        expect(said.reason).toBe('too-poor')
      }
    }
    // And one coin more than she has, on the very egg she has it all on. This is
    // the one that has to be measured against the purse PLUS what is already on
    // that egg: read as an addition, every figure in the control below would be
    // refused too, and somebody who had put everything on one egg could never
    // adjust it at all.
    expect((await pledge(w, 2, STARTING_PURSE + 1)).reason).toBe('too-poor')

    // The control: the same egg, one coin lighter, in one message. Nothing about
    // this person or this egg changed, and the coin that came free is spendable.
    expect((await pledge(w, 2, STARTING_PURSE - 1)).type).toBe('market')
    expect((await pledge(w, 0, 1)).type).toBe('market')
    expect((await pledge(w, 0, 2)).reason).toBe('too-poor')
    w.close()
  })

  it('has nothing to take back off an egg nobody backed, and takes it off one they did', async () => {
    const groupId = await makeGroup()
    const w = await member(groupId, 'ann')
    expect((await pledge(w, 0, 20)).type).toBe('market')
    for (const egg of [1, 2]) {
      const said = await withdraw(w, egg)
      expect(said.type).toBe('refused')
      expect(said.reason).toBe('nothing-pledged')
    }
    expect((await withdraw(w, 0)).type).toBe('market')
    expect((await marketOf(groupId)).pledges).toEqual([])
    w.close()
  })

  it('keeps a purse right across pledging, refusing, taking back and adjusting', async () => {
    // The arithmetic a person actually feels, walked end to end on one purse.
    // Coins come from claiming and go nowhere else, so a purse is the starting
    // hundred minus what that person has on the table, and every step here is
    // the server agreeing with that.
    const groupId = await makeGroup()
    const w = await member(groupId, 'ann')
    expect((await pledge(w, 1, 60)).type).toBe('market')
    // Forty left, so fifty is refused even though it is on a different egg.
    expect((await pledge(w, 2, 50)).reason).toBe('too-poor')
    expect((await pledge(w, 2, 40)).type).toBe('market')
    expect((await pledge(w, 0, 1)).reason).toBe('too-poor')

    // Take the sixty back and the fifty that was refused goes through, which is
    // the whole of "an unspent pledge returns" while the market is still open.
    expect((await withdraw(w, 1)).type).toBe('market')
    expect((await pledge(w, 2, 50)).type).toBe('market')
    const market = await marketOf(groupId)
    // ONE row of fifty, not a forty and a fifty. The second figure replaced the
    // first rather than joining it, so what she has on that egg is fifty and
    // what she has left is fifty.
    expect(market.pledges.map((p) => p.coins)).toEqual([50])
    expect(market.pledges[0].egg).toBe(2)
    expect((await pledge(w, 0, 50)).type).toBe('market')
    expect((await pledge(w, 0, 51)).reason).toBe('too-poor')
    w.close()
  })
})

describe('changing your mind about a pledge', () => {
  it('lowers a figure in one message, leaving one row that keeps its place', async () => {
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    const bo = await member(groupId, 'bo')
    // Bo moves first and then sits still, so the list has an order for Ann's row
    // to keep its place in and something that would notice if it did not.
    expect((await pledge(bo, 1, 10)).type).toBe('market')
    expect((await pledge(ann, 2, STARTING_PURSE)).type).toBe('market')
    const before = (await marketOf(groupId)).pledges
    expect(before.length).toBe(2)
    const arrived = before[1].at

    expect((await pledge(ann, 2, 40)).type).toBe('market')
    const after = (await marketOf(groupId)).pledges
    // TWO rows and not three, and forty rather than a hundred and forty. A
    // server that appended would have both figures on the egg and would think
    // this person had spent everything twice over.
    expect(after.length).toBe(2)
    expect(after[1].actorId).toBe(before[1].actorId)
    expect(after[1].coins).toBe(40)
    expect(totalsOf(await marketOf(groupId))[2]).toBe(40)
    // Still second in the list and still carrying the moment she first backed
    // this egg. The order is the only record of how the group got here, and
    // somebody changing their mind has not just arrived.
    expect(after[1].at).toBe(arrived)
    expect(after[0].coins).toBe(10)
    // And the sixty is hers again, to the coin, without another message.
    expect((await pledge(ann, 1, 60)).type).toBe('market')
    expect((await pledge(ann, 0, 1)).reason).toBe('too-poor')
    ann.close()
    bo.close()
  })

  it('cannot buy a different egg on the way down', async () => {
    // The reason a pledge sets a figure instead of adding one, and the worst
    // thing this screen could do. Lowering used to be two messages, a withdrawal
    // and then a smaller pledge, and in between them the group's money sat
    // somewhere nobody had asked for it to be: with Bo's hundred off the table
    // the plain egg leads AND is already funded, so it is bought on the spot and
    // the group is raising an animal nobody voted for, for ever.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    const bo = await member(groupId, 'bo')
    const cy = await member(groupId, 'cy')
    const eggs = await candidates(groupId)

    // The dearest egg goes in front out of two purses, and stays short of its
    // own price the whole way through.
    expect(priceOf(2, 3)).toBeGreaterThan(2 * STARTING_PURSE)
    expect((await pledge(cy, 2, 20)).type).toBe('market')
    expect((await pledge(bo, 2, STARTING_PURSE)).type).toBe('market')
    // The plain egg is funded to the coin behind it, and losing.
    expect((await pledge(ann, 0, priceOf(0, 3))).type).toBe('market')
    expect('market' in (await view(groupId))).toBe(true)

    // ONE message, a hundred down to sixty. The dearest egg is left holding
    // eighty, which is still more than the plain egg's seventy five, so nothing
    // is bought and nothing ever was: a Durable Object runs one message to
    // completion before it takes the next, so an intermediate state inside this
    // one would have resolved before the answer came back.
    const lowered = await pledge(bo, 2, 60)
    expect(lowered.type).toBe('market')
    expect(lowered.type).not.toBe('bought')
    expect('market' in (await view(groupId))).toBe(true)
    for (const w of [ann, bo, cy]) {
      expect(w.all().some((one) => one.type === 'bought')).toBe(false)
    }

    // THE CONTROL, and it is the same person on the same egg one message later.
    // Taken all the way to zero the plain egg does lead, and it is bought at
    // once. So what held above was the arithmetic of a market that never passed
    // through the state, and not a market that had quietly stopped deciding.
    const bought = await pledge(bo, 2, 0)
    expect(bought.type).toBe('bought')
    expect(bought.egg).toBe(0)
    expect(bought.spent).toBe(priceOf(0, 3))
    expect((await creatureOf(groupId)).genome.seed).toBe(eggs[0])
    ann.close()
    bo.close()
    cy.close()
  })

  it('frees the coins with a pledge of zero, which is all taking them back is', async () => {
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    // Everything on the dearest egg, and therefore nothing anywhere else.
    expect((await pledge(ann, 2, STARTING_PURSE)).type).toBe('market')
    expect((await pledge(ann, 1, 1)).reason).toBe('too-poor')

    expect((await pledge(ann, 2, 0)).type).toBe('market')
    const market = await marketOf(groupId)
    // The row stays, holding nothing, which is exactly what withPledge in the
    // shared rules produces: the server stores the state it broadcasts rather
    // than a second version of it. Every total, purse and leader reads a row of
    // zero as nothing, and the market screen leaves out a backer who is holding
    // none, so it is on nobody's screen either.
    expect(market.pledges.length).toBe(1)
    expect(market.pledges[0].coins).toBe(0)
    expect(totalsOf(market)).toEqual([0, 0, 0])

    // And the hundred is spendable again, to the last coin, somewhere else.
    expect((await pledge(ann, 1, STARTING_PURSE)).type).toBe('market')
    expect((await pledge(ann, 0, 1)).reason).toBe('too-poor')
    ann.close()
  })
})

describe('the pledging is the vote', () => {
  it('tells everybody who moved, including people who have not claimed', async () => {
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    const watcher = await guest(groupId, 'watcher')
    const from = watcher.all().length

    expect((await pledge(ann, 1, 25)).type).toBe('market')
    for (let i = 0; i < 40; i++) {
      if (watcher.all().slice(from).some((one) => one.type === 'market')) break
      await scheduler.wait(25)
    }
    const seen = watcher.all().slice(from).filter((one) => one.type === 'market')
    expect(seen.length).toBeGreaterThan(0)
    const note = seen[seen.length - 1].note as { kind: string; actorName: string; coins: number }
    expect(note.kind).toBe('pledged')
    expect(note.actorName).toBe('ann')
    expect(note.coins).toBe(25)
    ann.close()
    watcher.close()
  })

  it('counts a new member, and says so to everybody at the market', async () => {
    // A claim is a hundred more coins in the group and a higher price on the two
    // eggs that scale, so somebody watching "twelve short" has to learn why it
    // just became sixty-seven short.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    expect((await marketOf(groupId)).claimed).toBe(1)

    const from = ann.all().length
    const bo = await member(groupId, 'bo')
    for (let i = 0; i < 40; i++) {
      if (ann.all().slice(from).some((one) => one.type === 'market')) break
      await scheduler.wait(25)
    }
    expect(ann.all().slice(from).some((one) => one.type === 'market')).toBe(true)
    expect((await marketOf(groupId)).claimed).toBe(2)
    ann.close()
    bo.close()
  })

  it('prices the eggs against the people who are actually here', async () => {
    // The sharpest thing in this file. Two people have claimed, so the middle
    // egg is priceOf(1, 2) and not priceOf(1, 1). A server pricing against a
    // constant, or against the headcount it saw when the group was made, buys
    // the egg on the second of these three pledges; the correct one buys it on
    // the third. Both prices are asked for by name so this cannot drift away
    // from the shared table, and it is the middle egg because the plain one no
    // longer moves with the headcount at all.
    expect(priceOf(1, 1)).toBeLessThan(priceOf(1, 2))
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    const bo = await member(groupId, 'bo')

    expect((await pledge(ann, 1, STARTING_PURSE)).type).toBe('market')
    // A whole middle-egg-at-one-member's worth of coins is now on it, and it
    // buys nothing.
    expect((await pledge(bo, 1, priceOf(1, 1) - STARTING_PURSE)).type).toBe('market')

    const bought = await pledge(bo, 1, priceOf(1, 2) - STARTING_PURSE)
    expect(bought.type).toBe('bought')
    expect(bought.spent).toBe(priceOf(1, 2))
    ann.close()
    bo.close()
  })
})

describe('buying the egg', () => {
  it('gives the group the animal that was on the screen', async () => {
    // Buying the pale green egg has to produce the pale green creature. The
    // renderer derives the egg's colour from the candidate seed, so the seed of
    // the egg they bought has to become the group's seed unchanged: not
    // re-rolled, not derived from it, the same string.
    const groupId = await makeGroup()
    const eggs = await candidates(groupId)
    const ann = await member(groupId, 'ann')

    const bought = await pledge(ann, 0, priceOf(0, 1))
    expect(bought.type).toBe('bought')
    expect(bought.egg).toBe(0)
    expect(bought.spent).toBe(priceOf(0, 1))

    const creature = await creatureOf(groupId)
    expect(creature.genome.seed).toBe(eggs[0])
    expect(creature.genome.seed).not.toBe(eggs[1])
    expect(creature.genome.seed).not.toBe(eggs[2])
    // And the message carried the whole group, so a client crosses from the
    // market to the creature without a second request.
    expect((bought.snapshot as GroupSnapshot).genome.seed).toBe(eggs[0])
    expect('market' in (await view(groupId))).toBe(false)
    ann.close()
  })

  it('spends the winning egg’s coins and returns everything on the others', async () => {
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    const bo = await member(groupId, 'bo')
    const eggs = await candidates(groupId)

    // Ann backs the dearest egg, then puts the rest of her money on the middle
    // one alongside Bo, which is what buys it.
    expect((await pledge(ann, 2, 40)).type).toBe('market')
    expect((await pledge(bo, 1, STARTING_PURSE)).type).toBe('market')
    const bought = await pledge(ann, 1, 60)

    expect(bought.type).toBe('bought')
    expect(bought.egg).toBe(1)
    // 160 and not 200. Ann's forty on the dearest egg was never spent, and the
    // five over the asking price was.
    expect(bought.spent).toBe(160)
    expect(bought.spent).toBeGreaterThan(priceOf(1, 2))
    expect((await creatureOf(groupId)).genome.seed).toBe(eggs[1])
    ann.close()
    bo.close()
  })

  it('lets a fully funded egg lose, and lets a withdrawal buy it', async () => {
    // Both halves of the same state, because they are the same state. An egg can
    // have its whole price on it and still not be bought, because the group wants
    // a different one more and the money IS the count. Take the coins off the one
    // in front and the funded egg leads and is bought on the spot, which is the
    // path a server that only asks "did this pledge buy it" never notices.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    const bo = await member(groupId, 'bo')
    const eggs = await candidates(groupId)
    const cheapest = priceOf(0, 2)

    // The dearest egg goes in front first, above what the cheapest will end up
    // holding, and stays short of its own price the whole time.
    expect(priceOf(2, 2)).toBeGreaterThan(STARTING_PURSE)
    expect(STARTING_PURSE).toBeGreaterThan(cheapest)
    expect((await pledge(bo, 2, STARTING_PURSE)).type).toBe('market')
    // Now the cheapest is funded to the coin, and still loses.
    const funded = await pledge(ann, 0, cheapest)
    expect(funded.type).toBe('market')
    expect(funded.type).not.toBe('bought')
    expect('market' in (await view(groupId))).toBe(true)

    const bought = await withdraw(bo, 2)
    expect(bought.type).toBe('bought')
    expect(bought.egg).toBe(0)
    expect(bought.spent).toBe(cheapest)
    expect((await creatureOf(groupId)).genome.seed).toBe(eggs[0])
    ann.close()
    bo.close()
  })

  it('resolves once when two people send the closing coins together', async () => {
    // A Durable Object handles one message at a time and nothing in the pledge
    // path awaits, so the read of the pledges, the decision and the write of the
    // seed are one indivisible turn. This is what says so out loud: two closing
    // pledges in flight at once, one of which is enough on its own.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    const bo = await member(groupId, 'bo')
    const cy = await member(groupId, 'cy')
    const di = await member(groupId, 'di')
    const price = priceOf(1, 4)
    // Staged to exactly one purse short, so either of the two in flight closes
    // it on its own and the other has to find the market already gone.
    const staged = price - STARTING_PURSE
    expect(staged).toBeLessThanOrEqual(2 * STARTING_PURSE)
    expect((await pledge(ann, 1, STARTING_PURSE)).type).toBe('market')
    expect((await pledge(di, 1, staged - STARTING_PURSE)).type).toBe('market')

    // Sent without waiting, so both are in the pipe before either is answered.
    bo.send({ type: 'pledge', egg: 1, coins: STARTING_PURSE })
    cy.send({ type: 'pledge', egg: 1, coins: STARTING_PURSE })
    await scheduler.wait(500)

    // Everybody is told once, and the price is the price: a second resolution
    // would have spent the other hundred as well.
    for (const w of [ann, bo, cy, di]) {
      expect(w.all().filter((one) => one.type === 'bought').length).toBe(1)
    }
    const bought = ann.all().find((one) => one.type === 'bought') as Said
    expect(bought.spent).toBe(price)
    const refusals = [...bo.all(), ...cy.all()].filter((one) => one.type === 'refused')
    expect(refusals.length).toBe(1)
    expect(refusals[0].reason).toBe('closed')
    ann.close()
    bo.close()
    cy.close()
    di.close()
  })

  it('stays closed afterwards, even when a new member has moved the prices', async () => {
    // The state that would otherwise reopen a settled market, and it is not
    // exotic: whether an egg is bought is decided by comparing the money on it
    // against its price, and the price goes up every time somebody claims. Three
    // more members after a purchase leave the winning egg's total below its new
    // price, so a server that asked the arithmetic instead of the stored seed
    // would call this market open and let the group be sold a second animal on
    // top of the one they are already raising.
    const groupId = await makeGroup()
    const eggs = await candidates(groupId)
    const ann = await member(groupId, 'ann')
    const bo = await member(groupId, 'bo')
    expect((await pledge(ann, 1, STARTING_PURSE)).type).toBe('market')
    expect((await pledge(bo, 1, priceOf(1, 2) - STARTING_PURSE)).type).toBe('bought')

    const cy = await member(groupId, 'cy')
    const di = await member(groupId, 'di')
    expect(priceOf(1, 4)).toBeGreaterThan(priceOf(1, 2))

    // And the two who arrived afterwards have whole purses, more than enough
    // between them to buy the plain egg outright at any headcount, which is what
    // makes this a test rather than a gesture: a market that read as open again
    // would be selling this group a second animal on top of the one they are
    // already raising.
    expect(priceOf(0, 4)).toBeLessThanOrEqual(2 * STARTING_PURSE)
    for (const w of [ann, bo, cy, di]) {
      for (const egg of [0, 1]) {
        const said = await pledge(w, egg, 50)
        expect(said.type).toBe('refused')
        expect(said.reason).toBe('closed')
      }
    }
    expect((await creatureOf(groupId)).genome.seed).toBe(eggs[1])
    ann.close()
    bo.close()
    cy.close()
    di.close()
  })

  it('refuses a withdrawal after the purchase too', async () => {
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    // The control comes first: the same person takes the same coins off the same
    // egg while the market is open.
    expect((await pledge(ann, 0, 20)).type).toBe('market')
    expect((await withdraw(ann, 0)).type).toBe('market')

    expect((await pledge(ann, 0, priceOf(0, 1))).type).toBe('bought')
    const said = await withdraw(ann, 0)
    expect(said.type).toBe('refused')
    expect(said.reason).toBe('closed')
    ann.close()
  })

  it('lets the group start raising it the moment it is theirs', async () => {
    // The half a purchase test usually forgets. A group that can buy an egg and
    // cannot then touch the creature has passed every assertion above and has no
    // app. Two people, because one of them is inside the ten second cooldown.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    expect((await pledge(ann, 0, priceOf(0, 1))).type).toBe('bought')

    const acted = await reply(ann, { type: 'act', variantId: 'sing.humDusk' }, [
      'action',
      'error',
      'asleep',
    ])
    expect(acted.type).toBe('action')
    const named = await reply(ann, { type: 'name', name: 'Pim' }, ['named', 'error'])
    expect(named.type).toBe('named')

    const creature = await creatureOf(groupId)
    expect(creature.actions.length).toBe(1)
    expect(creature.name).toBe('Pim')
    ann.close()
  })
})

describe('what the group paid for', () => {
  /** Buy one named egg outright, and hand back the group. Everybody claims
   *  before anybody pledges, because the price moves with the headcount and a
   *  member arriving mid-pledge would change what these fixtures cost. */
  async function bought(egg: number, backers: number): Promise<string> {
    const groupId = await makeGroup()
    const wires: Wire[] = []
    for (let i = 0; i < backers; i++) wires.push(await member(groupId, `p${i}`))
    let left = priceOf(egg, backers)
    for (const w of wires) {
      const coins = Math.min(STARTING_PURSE, left)
      if (coins <= 0) break
      left -= coins
      const said = await pledge(w, egg, coins)
      expect(['market', 'bought']).toContain(said.type)
    }
    expect(left).toBe(0)
    for (const w of wires) w.close()
    return groupId
  }

  it('hatches a dear egg twice as fast as a cheap one, and leaves the middle alone', async () => {
    // What the money actually buys. The cheapest egg is a longer wait and the
    // dearest is a shorter one, and the spread is exactly double, so an hour of
    // sitting still is worth three quarters of an hour to one group and an hour
    // and a half to another.
    const slow = await bought(0, 1)
    const middle = await bought(1, 2)
    const fast = await bought(2, 2)
    for (const groupId of [slow, middle, fast]) {
      await env.MONSTER_GROUP.getByName(groupId).age(HOUR)
    }

    const grown = {
      slow: (await creatureOf(slow)).growth,
      middle: (await creatureOf(middle)).growth,
      fast: (await creatureOf(fast)).growth,
    }
    // Three decimal places is a thousandth of a growth point, and the whole egg
    // stage is EGG_ENDS of them; the milliseconds between these three reads are
    // worth a few ten-thousandths.
    expect(grown.slow).toBeCloseTo(PLAIN_HOUR * 0.75, 3)
    expect(grown.middle).toBeCloseTo(PLAIN_HOUR, 3)
    expect(grown.fast).toBeCloseTo(PLAIN_HOUR * 1.5, 3)
    expect(grown.fast / grown.slow).toBeCloseTo(2, 3)
  })

  it('stamps an action with the same growth the group is being shown', async () => {
    // The row's total and the snapshot's total are compared against the same
    // stage table by deriveCreature, and it takes the larger of the two. So a
    // row carrying the plain figure while the snapshot carried the adjusted one
    // would erase the longer wait a group paid less for, permanently, on the
    // first thing anybody did.
    const groupId = await bought(0, 1)
    await env.MONSTER_GROUP.getByName(groupId).age(HOUR)
    const w = await guest(groupId, 'ann')
    const acted = await reply(w, { type: 'act', variantId: 'sing.humDusk' }, [
      'action',
      'error',
      'asleep',
    ])
    expect(acted.type).toBe('action')

    const creature = await creatureOf(groupId)
    const row = creature.actions[0]
    expect(row.growth).toBeDefined()
    expect(row.growth).toBeCloseTo(creature.growth, 2)
    // And it is the slow egg's figure, not the plain one it was worked out from.
    expect(row.growth).toBeLessThan(PLAIN_HOUR)
    w.close()
  })
})

describe('the creature a group took its time over', () => {
  /**
   * A group still at the market, moved forward to the moment its first candidate
   * would be going to sleep if the night were measured from the day the group
   * formed. The state defect (b) lives in, staged in the only way it can be: an
   * argument that runs from breakfast to dinner cannot be waited out in a test,
   * and how long a creature's day runs and where in that day it starts are both
   * rolled from the seed, so the distance is asked of the shared file rather than
   * written down.
   *
   * The seed of the egg they are about to buy is on the screen in front of them
   * already, which is what makes this possible at all: candidates are public
   * from the moment the group exists.
   */
  async function arguedUntilBedtime(): Promise<{ groupId: string; seed: string }> {
    const groupId = await makeGroup()
    const before = (await view(groupId)) as unknown as MarketSnapshot
    const seed = before.market.candidates[0]
    const now = Date.now()
    const up = sleepState(rollActivity(seed), seed, before.createdAt, now, NEVER_WOKEN)
    // Stated rather than assumed. A creature is always awake on the day its
    // group is made, so `until` here is the start of a night and not the end of
    // one; if that stopped being true this would age the group into the
    // following morning and everything below would be green for the wrong
    // reason with nothing to show that it had.
    expect(up.asleep).toBe(false)
    await env.MONSTER_GROUP.getByName(groupId).age(up.until - now + MINUTE)
    return { groupId, seed }
  }

  it('is awake the moment it hatches, however long the group argued first', async () => {
    // resolve() re-anchors GROWTH to the purchase, and the schedule was left
    // reading the group's birthday: a group made at nine in the morning that
    // argued until six in the evening was handed a creature nine hours into a
    // timetable it had never been awake for. src/dna/sleep.ts is built the other
    // way round deliberately, with phase zero inside a waking stretch and none
    // of four hundred seeds asleep at birth, because a group that meets a
    // sleeping animal has no way to tell that from a broken app.
    const { groupId, seed } = await arguedUntilBedtime()

    // The half that makes this a test. Measured from the day the group formed,
    // which is what the schedule used to read, this creature is asleep. Without
    // this line the assertions below would pass on a group that was never
    // anywhere near a night, and would go on passing with the anchor put back.
    const waited = (await view(groupId)) as unknown as MarketSnapshot
    const asOfTheGroup = sleepState(
      rollActivity(seed),
      seed,
      waited.createdAt,
      Date.now(),
      NEVER_WOKEN,
    )
    expect(asOfTheGroup.asleep).toBe(true)

    const ann = await member(groupId, 'ann')
    expect((await pledge(ann, 0, priceOf(0, 1))).type).toBe('bought')

    // Awake on the app's own arithmetic, from the snapshot and nothing else,
    // which is all a screen ever has.
    const snap = await creatureOf(groupId)
    expect(snap.genome.seed).toBe(seed)
    expect(sleepStateOf(snap.genome, snap.createdAt, Date.now(), NEVER_WOKEN).asleep).toBe(false)

    // And on the server's, which is the half a shared function cannot prove. The
    // first thing this group does to their new creature is taken rather than
    // turned away, and it is an ordinary thing rather than the waking: every
    // other gate in act() would pass it, so the only rule that could refuse it
    // is the one being measured.
    const acted = await reply(ann, { type: 'act', variantId: 'sing.humDusk' }, [
      'action',
      'error',
      'asleep',
    ])
    expect(acted.type).toBe('action')
    ann.close()
  })

  it('still keeps a night, counted from the moment it was bought', async () => {
    // The other direction, and it has to be here or "anchor it later" would be
    // indistinguishable from "never let it sleep". A creature that could not be
    // put down at all would pass the test above perfectly and would have deleted
    // the sleeping half of its life.
    const { groupId } = await arguedUntilBedtime()
    const ann = await member(groupId, 'ann')
    expect((await pledge(ann, 0, priceOf(0, 1))).type).toBe('bought')
    ann.close()

    // Its own first night, worked out from the snapshot the way the app works it
    // out, and then waited out with the same hook.
    const snap = await creatureOf(groupId)
    const now = Date.now()
    const up = sleepStateOf(snap.genome, snap.createdAt, now, NEVER_WOKEN)
    expect(up.asleep).toBe(false)
    await env.MONSTER_GROUP.getByName(groupId).age(up.until - now + MINUTE)

    const bo = await guest(groupId, 'bo')
    const said = await reply(bo, { type: 'act', variantId: 'sing.humDusk' }, [
      'action',
      'error',
      'asleep',
    ])
    expect(said.type).toBe('asleep')
    bo.close()
  })
})

describe('claiming a place, twice', () => {
  it('does not mint a second purse for somebody who claims again', async () => {
    // The count is added to at the one place a place is claimed and nothing
    // anywhere takes one away, so a second claim used to raise the price of the
    // two eggs that scale for the rest of the group's life while the hundred
    // coins behind the first place became unreachable in the same moment: only
    // the hash of a code is kept, so a place whose code was never used again
    // cannot be got back into and cannot be spent from. The group ends up
    // permanently poorer and permanently dearer, with nothing saying why.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    expect((await marketOf(groupId)).claimed).toBe(1)

    // The same person again on a second connection, saying they are the same
    // person: one browser, two tabs, the button tapped in the one that had not
    // heard. Everything else about this request is exactly what the first one
    // was, so nothing else can be what refuses it.
    const again = await guest(groupId, 'ann')
    const refused = await reply(again, { type: 'claim' }, ['claimed', 'error'])
    expect(refused.type).toBe('error')
    expect((await marketOf(groupId)).claimed).toBe(1)
    // And no coins came with it, which is the whole of what a second purse would
    // have been.
    expect((await pledge(again, 0, 10)).reason).toBe('unclaimed')

    // THE CONTROL: somebody genuinely new, on an identical connection, one
    // message later. A real second member still arrives, still brings a hundred
    // coins and still moves the prices, so what refused above was the note
    // saying this browser already holds a place and nothing else.
    //
    // It is also the limit nothing here can close, in the one place it is
    // visible: this server can only tell people apart by what their browser says
    // it is called, so one person on a phone and a laptop is two members with
    // two purses. There are no accounts and cannot be, because the link is the
    // access control.
    const bo = await member(groupId, 'bo')
    expect((await marketOf(groupId)).claimed).toBe(2)
    expect((await pledge(bo, 0, 10)).type).toBe('market')
    ann.close()
    again.close()
    bo.close()
  })

  it('leaves the prices where the group can still reach them', async () => {
    // What a group actually feels, and the reason the count is worth guarding.
    // Two claims out of one person used to leave the two eggs that scale priced
    // for three members with two people's money behind them.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    const bo = await member(groupId, 'bo')
    const shown = priceOf(1, 2)
    expect(priceOf(1, 3)).toBeGreaterThan(2 * STARTING_PURSE)

    const again = await guest(groupId, 'ann')
    expect((await reply(again, { type: 'claim' }, ['claimed', 'error'])).type).toBe('error')
    expect((await marketOf(groupId)).claimed).toBe(2)

    // The middle egg still costs what two members pay, and the two of them close
    // it between them to the coin. Priced for three it is 205 against the 200
    // they have, so a group that had been counted wrong would be standing here
    // five coins short of the egg they were shown, for ever.
    expect((await pledge(ann, 1, STARTING_PURSE)).type).toBe('market')
    const bought = await pledge(bo, 1, shown - STARTING_PURSE)
    expect(bought.type).toBe('bought')
    expect(bought.spent).toBe(shown)
    ann.close()
    bo.close()
    again.close()
  })
})

describe('a group that already has a creature', () => {
  /**
   * A group in exactly the shape every live group is in today: a seed, a log,
   * and no memory of ever having chosen. forgetGrowthColumn puts it back on the
   * schema from before growth, manners and the market existed, which is the
   * state that turned into a 500 for every creature at once the last time
   * something needed a column.
   */
  async function grandfathered(): Promise<string> {
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    expect((await pledge(ann, 0, priceOf(0, 1))).type).toBe('bought')
    const acted = await reply(ann, { type: 'act', variantId: 'sing.humDusk' }, [
      'action',
      'error',
      'asleep',
    ])
    expect(acted.type).toBe('action')
    ann.close()
    await env.MONSTER_GROUP.getByName(groupId).forgetGrowthColumn()
    return groupId
  }

  it('has no market, and is never offered one', async () => {
    // Proved rather than assumed, and proved on a group with nothing whatever
    // to do with the market in its storage: no candidates, no pledge table, no
    // multiplier. The seed is what decides, and it is the first thing asked.
    const groupId = await grandfathered()
    const seen = await view(groupId)
    expect('market' in seen).toBe(false)
    expect('genome' in seen).toBe(true)
    expect((seen as unknown as GroupSnapshot).actions.length).toBe(1)

    const w = await open(groupId)
    for (let i = 0; i < 40 && w.all().length === 0; i++) await scheduler.wait(25)
    expect(w.all()[0]?.type).toBe('snapshot')
    expect(w.all().some((one) => one.type === 'market')).toBe(false)
    w.close()
  })

  it('cannot be made to buy a second egg by anybody', async () => {
    const groupId = await grandfathered()
    const w = await member(groupId, 'bo')
    for (let egg = 0; egg < EGG_COUNT; egg++) {
      expect((await pledge(w, egg, 50)).reason).toBe('closed')
      expect((await withdraw(w, egg)).reason).toBe('closed')
    }
    w.close()
  })

  it('goes on raising the creature it already has, at the speed it always had', async () => {
    // The half a migration test usually forgets: surviving the read is not the
    // same as being usable. And the multiplier has to read as one for these,
    // because a group with months of log is not carrying a number that was
    // invented after their egg hatched.
    const groupId = await grandfathered()
    const before = await creatureOf(groupId)
    await env.MONSTER_GROUP.getByName(groupId).age(HOUR)
    const after = await creatureOf(groupId)
    expect(after.growth - before.growth).toBeCloseTo(PLAIN_HOUR, 3)

    const w = await guest(groupId, 'bo')
    const acted = await reply(w, { type: 'act', variantId: 'give.riverStone' }, [
      'action',
      'error',
      'asleep',
    ])
    expect(acted.type).toBe('action')
    expect((await creatureOf(groupId)).actions.length).toBe(2)
    w.close()
  })
})

describe('a group that predates the pledge table', () => {
  it('has it made for it rather than throwing, and can still buy its egg', async () => {
    // CREATE TABLE IF NOT EXISTS does nothing to a table that exists, so the
    // table has to be made by the migration for every group that was already
    // there, in a try block of its own so a group that already had the growth
    // column still reaches it. This fixture is a group at the market whose
    // pledge table has been taken away, which is the only state where anything
    // reads it: without the migration the next read of this group is a 500.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    expect((await pledge(ann, 0, 30)).type).toBe('market')
    await env.MONSTER_GROUP.getByName(groupId).forgetGrowthColumn()

    const market = await marketOf(groupId)
    expect(market.candidates.length).toBe(EGG_COUNT)
    // The passcode outlives the table, so the group is still the size it was and
    // the eggs still cost what they cost. The pledges themselves are gone with
    // the table, which is a thing only this hook can do to a group.
    expect(market.claimed).toBe(1)
    expect(market.pledges).toEqual([])

    // A connection opened afterwards gets an answer rather than a 500, which is
    // the failure being reproduced: a read naming something the group has not
    // got does not come back as a refusal, it comes back as the group being
    // down for everybody in it.
    const watcher = await guest(groupId, 'watcher')
    const answered = await pledge(watcher, 0, 10)
    expect(answered.type).toBe('refused')
    expect(answered.reason).toBe('unclaimed')

    // And it is usable afterwards, not merely readable. Ann has a whole purse
    // again, since what she had on the table went with the table.
    expect((await pledge(ann, 0, priceOf(0, 1))).type).toBe('bought')
    expect((await creatureOf(groupId)).genome.seed).toBe(market.candidates[0])
    ann.close()
    watcher.close()
  })
})

describe('a group that was mid-pledge when a pledge stopped adding', () => {
  it('folds the rows one person left on one egg into one, without moving a coin', async () => {
    // Every group standing at the market on the day this deploys has rows like
    // these: a pledge appended, and lowering a figure was a withdrawal followed
    // by a smaller pledge. One row per person per egg is a UNIQUE index now, and
    // an index cannot be built over duplicates, so the migration has to fold
    // them first. It runs on live markets on the first read after the deploy,
    // with nobody looking, and a fold that changed a total by one coin could put
    // a different egg in front and hand a group an animal they did not choose.
    const groupId = await makeGroup()
    const ann = await member(groupId, 'ann')
    expect((await pledge(ann, 0, 40)).type).toBe('market')
    const first = (await marketOf(groupId)).pledges[0]
    const arrived = first.at

    await env.MONSTER_GROUP.getByName(groupId).pledgeTwice(first.actorId, 'ann', 0, 25)

    const folded = await marketOf(groupId)
    expect(folded.pledges.length).toBe(1)
    expect(folded.pledges[0].coins).toBe(65)
    expect(totalsOf(folded)[0]).toBe(65)
    // The survivor is the earlier row, so it keeps the moment this person first
    // backed this egg and its place in the list. Somebody who moved twice did
    // not arrive the second time.
    expect(folded.pledges[0].at).toBe(arrived)

    // Sixty five to the coin, pinned from both sides by what the purse will
    // take. Thirty six is refused, so more than sixty four is on the table;
    // thirty five is taken, so no more than sixty five is.
    expect((await pledge(ann, 1, 36)).reason).toBe('too-poor')
    expect((await pledge(ann, 1, 35)).type).toBe('market')

    // And the index came back with the fold, so this person's next adjustment
    // still leaves one row rather than starting the pile again.
    expect((await pledge(ann, 0, 60)).type).toBe('market')
    const market = await marketOf(groupId)
    expect(market.pledges.filter((p) => p.egg === 0).length).toBe(1)

    // The control, and it is the strongest thing here: the folded coins are real
    // money that still closes a price. Fifteen more is exactly the plain egg,
    // which it can only be if the fold left sixty behind and not forty or
    // twenty five.
    const bo = await member(groupId, 'bo')
    const bought = await pledge(bo, 0, priceOf(0, 2) - 60)
    expect(bought.type).toBe('bought')
    expect(bought.spent).toBe(priceOf(0, 2))
    ann.close()
    bo.close()
  })
})

describe('how many people a group can hold', () => {
  it('takes a full group of claims and refuses the one after', async () => {
    // Claiming has a price now: every claim raises what the two eggs that scale
    // cost, and nothing here deletes one. Without a bound, anybody holding the
    // link can claim a thousand times and leave the group unable to reach either
    // of them, with no way back. The plain egg is flat and stays reachable, so
    // what the bound protects is the choice rather than the group's whole
    // future. The number is MAX_ACTORS, because both are answering how many
    // people a friend group is.
    const groupId = await makeGroup()
    const wires: Wire[] = []
    for (let i = 0; i < 48; i++) {
      const w = await open(groupId)
      w.send({ type: 'hello', actorId: `p${i}`, actorName: `p${i}` })
      await scheduler.wait(15)
      const said = await reply(w, { type: 'claim' }, ['claimed', 'error'])
      // Every one of the forty-eight, not just the first: a cap that fired early
      // would be the same defect pointing the other way, and a group of eight
      // would find itself locked out.
      expect(said.type).toBe('claimed')
      wires.push(w)
    }
    expect((await marketOf(groupId)).claimed).toBe(48)

    const late = await open(groupId)
    late.send({ type: 'hello', actorId: 'late', actorName: 'late' })
    await scheduler.wait(15)
    const refused = await reply(late, { type: 'claim' }, ['claimed', 'error'])
    expect(refused.type).toBe('error')
    expect((await marketOf(groupId)).claimed).toBe(48)
    for (const w of wires) w.close()
    late.close()
  }, 60_000)
})
