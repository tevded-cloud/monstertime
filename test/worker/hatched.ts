// A group with a creature in it, for every test that is not about the market.
//
// Buying the egg changed what a brand new group IS. It used to arrive with a
// seed and therefore an animal; now it arrives at the market with three eggs on
// offer and nothing hatched, which is the entire point of the feature. Forty
// four tests across seven files went red the moment that landed, and every one
// of them was correct: their fixture said "make a group" and meant "make a
// creature", and those stopped being the same sentence.
//
// So this is the sentence they actually meant. One helper rather than the same
// seven lines pasted into seven files, because the market's prices and rules
// will move again and a copy in each file is seven places to forget.
//
// It buys the CHEAPEST egg with ONE member on purpose. At one claimed member
// egg 0 costs 75 against a purse of 100, so a single person can close it in one
// pledge, and no test that is really about growth or sleep or handles has to
// stage a four way vote to get to the thing it is testing.

import { SELF } from 'cloudflare:test'
import { expect } from 'vitest'
import { priceOf, STARTING_PURSE } from '../../src/market/rules'

interface Said {
  type: string
  [key: string]: unknown
}

/**
 * Make a group and buy it an egg, and hand back the id.
 *
 * The socket used to do it is closed before returning. Nothing here may leave a
 * connection open: a live socket is a member who is present, and tests about
 * who is in the room would then start counting a fixture.
 */
export async function hatchedGroup(): Promise<string> {
  const response = await SELF.fetch('https://x/api/monstertime/groups', { method: 'POST' })
  const groupId = ((await response.json()) as { groupId: string }).groupId

  const socket = (
    await SELF.fetch(`https://x/api/monstertime/groups/${groupId}/socket`, {
      headers: { Upgrade: 'websocket' },
    })
  ).webSocket
  if (!socket) throw new Error('no socket')
  socket.accept()
  const said: Said[] = []
  socket.addEventListener('message', (e: MessageEvent) => {
    if (typeof e.data === 'string' && e.data !== 'pong') said.push(JSON.parse(e.data) as Said)
  })

  const settle = async (want: string[]): Promise<Said> => {
    for (let i = 0; i < 80; i++) {
      const found = said.find((one) => want.includes(one.type))
      if (found !== undefined) return found
      await scheduler.wait(25)
    }
    throw new Error(`no ${want.join(' or ')} came back`)
  }

  socket.send(JSON.stringify({ type: 'hello', actorId: 'founder', actorName: 'Founder' }))
  await scheduler.wait(60)
  // Claiming is the only way anybody has coins, so a claim that quietly failed
  // would leave the pledge below refused and every test using this fixture
  // would fail somewhere far away from the reason.
  socket.send(JSON.stringify({ type: 'claim' }))
  const claimed = await settle(['claimed', 'error'])
  expect(claimed.type).toBe('claimed')

  const price = priceOf(0, 1)
  expect(price).toBeLessThanOrEqual(STARTING_PURSE)
  socket.send(JSON.stringify({ type: 'pledge', egg: 0, coins: price }))
  const bought = await settle(['bought', 'refused'])
  // Stated, not assumed. A fixture that silently failed to buy anything hands
  // back a group still standing at the market, and a test about sleep or growth
  // would then be asserting things about a creature that does not exist.
  expect(bought.type).toBe('bought')

  socket.close()
  await scheduler.wait(30)
  return groupId
}
