// Growth as the server keeps it.
//
// Two halves. Time is worked out from a stored total plus the hours since,
// which is why an idle group costs nothing and why a read never writes.
// Interaction is folded in when an action is written, worth less each time
// inside a stage, so a burst brings a stage forward without skipping it.
//
// Real elapsed time is what it is, so these tests measure over hundreds of
// milliseconds rather than hours. That is enough: the property worth holding is
// that growth moves on its own and moves further when somebody does something,
// not what the constants happen to be this week.

import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { hatchedGroup } from './hatched'

interface Snapshot {
  growth: number
  pace: number
  actions: { growth?: number }[]
}

/**
 * A group that has already bought its egg.
 *
 * Buying the egg changed what a new group is: it now arrives at the market with
 * nothing hatched. Every fixture in this file said "make a group" and meant
 * "make a creature", and those stopped being the same sentence. The market's
 * own tests are the ones that exercise choosing; here it is staging.
 */
async function makeGroup(): Promise<string> {
  return hatchedGroup()
}

async function snapshot(groupId: string): Promise<Snapshot> {
  return (await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()) as Snapshot
}

async function actOnce(groupId: string, variantId = 'sing.humDusk', who = 'ann'): Promise<void> {
  const response = await SELF.fetch(`https://x/api/monstertime/groups/${groupId}/socket`, {
    headers: { Upgrade: 'websocket' },
  })
  const socket = response.webSocket
  if (!socket) throw new Error('no socket')
  socket.accept()
  const seen: string[] = []
  socket.addEventListener('message', (e: MessageEvent) => {
    if (typeof e.data === 'string' && e.data !== 'pong') seen.push(JSON.parse(e.data).type as string)
  })
  socket.send(JSON.stringify({ type: 'hello', actorId: who, actorName: who }))
  await scheduler.wait(80)
  socket.send(JSON.stringify({ type: 'act', variantId }))
  for (let i = 0; i < 40 && !seen.includes('action'); i++) await scheduler.wait(25)
  socket.close()
}

describe('growth accrues on its own', () => {
  it('starts a new group at nothing, at pace 1', async () => {
    const first = await snapshot(await makeGroup())
    expect(first.growth).toBeGreaterThanOrEqual(0)
    expect(first.growth).toBeLessThan(0.01)
    expect(first.pace).toBe(1)
  })

  it('grows between two reads with nobody doing anything', async () => {
    // The whole point of the change: nothing is scheduled, nobody acts, and the
    // creature is further along the second time it is asked about.
    const groupId = await makeGroup()
    const before = await snapshot(groupId)
    await scheduler.wait(400)
    const after = await snapshot(groupId)
    expect(after.growth).toBeGreaterThan(before.growth)
  })

  it('does not write anything while it grows', async () => {
    // Growth is computed, not ticked. If reading advanced stored state, a
    // creature nobody has opened would be costing storage writes forever, and
    // an unopened group would differ from an opened one. Checked by proving a
    // read is repeatable: two reads taken together agree to a hair, which they
    // could not if one had committed a jump the other then built on.
    const groupId = await makeGroup()
    const a = await snapshot(groupId)
    const b = await snapshot(groupId)
    expect(Math.abs(b.growth - a.growth)).toBeLessThan(0.001)
  })

  it('is still an egg after a moment, because the clock is hours not seconds', async () => {
    // A creature that hatched while somebody read the page would make the
    // waiting meaningless.
    const groupId = await makeGroup()
    await scheduler.wait(300)
    const now = await snapshot(groupId)
    expect(now.growth).toBeLessThan(5)
  })
})

describe('doing something to it brings a stage forward', () => {
  it('adds more than the hours alone would have', async () => {
    const idle = await makeGroup()
    const busy = await makeGroup()
    await actOnce(busy)
    const [a, b] = [await snapshot(idle), await snapshot(busy)]
    expect(b.growth).toBeGreaterThan(a.growth)
  })

  it('stamps the running total onto the row it writes', async () => {
    // This is how time gets into a log that is replayed without a clock. The
    // row has to carry how grown the creature was when the pressure landed.
    const groupId = await makeGroup()
    await actOnce(groupId)
    const after = await snapshot(groupId)
    expect(after.actions.length).toBe(1)
    expect(typeof after.actions[0].growth).toBe('number')
    expect(after.actions[0].growth).toBeGreaterThan(0)
  })

  it('never stamps a row with less growth than the row before it', async () => {
    // Growth only goes up, and a replay reads the stamps in order, so a stamp
    // that went backwards would walk the creature back down its own stages.
    const groupId = await makeGroup()
    // Two different people, because one person is held to a ten second
    // cooldown and this test is not about waiting it out.
    await actOnce(groupId, 'sing.humDusk', 'ann')
    await scheduler.wait(120)
    await actOnce(groupId, 'give.riverStone', 'bo')
    const after = await snapshot(groupId)
    const stamps = after.actions.map((a) => a.growth ?? 0)
    expect(stamps.length).toBeGreaterThan(1)
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1])
  })
})

describe('the group sets the pace', () => {
  async function setPace(groupId: string, pace: number, who = 'ann'): Promise<void> {
    const response = await SELF.fetch(`https://x/api/monstertime/groups/${groupId}/socket`, {
      headers: { Upgrade: 'websocket' },
    })
    const socket = response.webSocket
    if (!socket) throw new Error('no socket')
    socket.accept()
    socket.send(JSON.stringify({ type: 'hello', actorId: who, actorName: who }))
    await scheduler.wait(80)
    socket.send(JSON.stringify({ type: 'pace', pace }))
    await scheduler.wait(200)
    socket.close()
  }

  it('remembers what the group asked for', async () => {
    const groupId = await makeGroup()
    await setPace(groupId, 3)
    expect((await snapshot(groupId)).pace).toBe(3)
  })

  it('clamps what it is given rather than believing it', async () => {
    const groupId = await makeGroup()
    await setPace(groupId, 9999)
    expect((await snapshot(groupId)).pace).toBeLessThanOrEqual(6)
    await setPace(groupId, -4)
    expect((await snapshot(groupId)).pace).toBeGreaterThanOrEqual(0.25)
  })

  it('does not re-price the hours the creature has already lived', async () => {
    // The correctness of the whole dial. Growth is a stored base plus the hours
    // since, multiplied by pace, so changing pace without banking what has
    // already accrued would re-run the creature's entire life at the new rate:
    // turn it up on a week-old animal and that week silently happens again
    // faster, turn it down and the creature goes backwards.
    const groupId = await makeGroup()
    await scheduler.wait(400)
    const before = (await snapshot(groupId)).growth
    await setPace(groupId, 0.25)
    const after = (await snapshot(groupId)).growth
    // Slowing right down must not have taken anything away from what it had.
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it('refuses a pace from somebody who has not said who they are', async () => {
    const groupId = await makeGroup()
    const response = await SELF.fetch(`https://x/api/monstertime/groups/${groupId}/socket`, {
      headers: { Upgrade: 'websocket' },
    })
    const socket = response.webSocket
    if (!socket) throw new Error('no socket')
    socket.accept()
    const seen: string[] = []
    socket.addEventListener('message', (e: MessageEvent) => {
      if (typeof e.data === 'string' && e.data !== 'pong') seen.push(JSON.parse(e.data).type as string)
    })
    socket.send(JSON.stringify({ type: 'pace', pace: 6 }))
    await scheduler.wait(200)
    expect(seen).toContain('error')
    expect((await snapshot(groupId)).pace).toBe(1)
    socket.close()
  })
})

describe('a group made before growth existed still opens', () => {
  it('adds the column and backfills it rather than throwing', async () => {
    // The shape of a real outage. CREATE TABLE IF NOT EXISTS does nothing to a
    // table that already exists, so adding the growth column to the DDL added
    // it for new groups only, and every group made before that deploy threw on
    // the first SELECT naming it. Not a degraded creature: a 500.
    //
    // Simulated by dropping the column back off a live group, which is exactly
    // the state an old group was in.
    const groupId = await makeGroup()
    await actOnce(groupId, 'sing.humDusk', 'ann')
    await scheduler.wait(120)
    await actOnce(groupId, 'give.riverStone', 'bo')

    const stub = env.MONSTER_GROUP.getByName(groupId)
    await stub.forgetGrowthColumn()

    // Reading has to survive it, and the creature has to come back with its
    // history intact rather than as a fresh egg.
    const after = await snapshot(groupId)
    expect(after.actions.length).toBe(2)
    expect(after.actions[0].growth).toBe(1)
    expect(after.actions[1].growth).toBe(2)
    expect(after.growth).toBeGreaterThanOrEqual(2)
  })
})
