// How a thing was done, as the server stores it.
//
// The server is the only writer, so it is the only place that decides what ends
// up in the log, and the log is the creature. Two things have to hold here and
// nowhere else can hold them: a manner that does not belong to its action never
// gets written, and a group that predates manners existing still opens.
//
// The second is the one that has bitten already. CREATE TABLE IF NOT EXISTS
// does nothing to a table that exists, so a column added to the DDL is added
// for new groups only and every group that already existed throws on the first
// SELECT naming it. That was a 500 for every creature at once, and this file
// exists so the second column cannot repeat it.

import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

interface Row {
  variantId: string
  methodId?: string
}

async function makeGroup(): Promise<string> {
  const response = await SELF.fetch('https://x/api/monstertime/groups', { method: 'POST' })
  return ((await response.json()) as { groupId: string }).groupId
}

async function snapshot(groupId: string): Promise<{ actions: Row[] }> {
  return (await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()) as {
    actions: Row[]
  }
}

/** Act once and report back what the server said about it. */
async function act(
  groupId: string,
  message: Record<string, unknown>,
  who = 'ann',
): Promise<string[]> {
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
  socket.send(JSON.stringify(message))
  for (let i = 0; i < 40 && !seen.includes('action') && !seen.includes('error'); i++) {
    await scheduler.wait(25)
  }
  socket.close()
  return seen
}

describe('writing a manner', () => {
  it('keeps it on the row it came in on', async () => {
    const groupId = await makeGroup()
    await act(groupId, { type: 'act', variantId: 'sing.humDusk', methodId: 'sing.close' })
    const [row] = (await snapshot(groupId)).actions
    expect(row.variantId).toBe('sing.humDusk')
    expect(row.methodId).toBe('sing.close')
  })

  it('leaves it off entirely when nobody said how', async () => {
    // Absent, not null and not a default. A default would be the server
    // inventing a fact about somebody, and it would then push a real point on
    // a real axis every time anybody took the fast path.
    const groupId = await makeGroup()
    await act(groupId, { type: 'act', variantId: 'sing.humDusk' })
    const [row] = (await snapshot(groupId)).actions
    expect('methodId' in row).toBe(false)
  })

  it('refuses a manner from another kind and writes nothing', async () => {
    // Nobody fed a creature firmly. The reason this is refused rather than
    // ignored is that the row would be replayed forever by every client, and a
    // pairing the catalogue does not contain is a pairing whose push is
    // whatever each version of the client happens to decide it is.
    const groupId = await makeGroup()
    const seen = await act(groupId, {
      type: 'act',
      variantId: 'sing.humDusk',
      methodId: 'tend.firmly',
    })
    expect(seen).toContain('error')
    expect(seen).not.toContain('action')
    expect((await snapshot(groupId)).actions.length).toBe(0)
  })

  it('refuses a manner that is not in the catalogue at all', async () => {
    const groupId = await makeGroup()
    const seen = await act(groupId, {
      type: 'act',
      variantId: 'sing.humDusk',
      methodId: 'sing.lovingly',
    })
    expect(seen).toContain('error')
    expect((await snapshot(groupId)).actions.length).toBe(0)
  })

  it('refuses one that is not a string, before it reaches the catalogue', async () => {
    const groupId = await makeGroup()
    for (const methodId of [42, { id: 'sing.close' }, ['sing.close'], 'x'.repeat(500)]) {
      const seen = await act(groupId, { type: 'act', variantId: 'sing.humDusk', methodId })
      expect(seen).not.toContain('action')
    }
    expect((await snapshot(groupId)).actions.length).toBe(0)
  })
})

describe('a group made before manners existed still opens', () => {
  it('adds the column rather than throwing, and leaves old rows without one', async () => {
    const groupId = await makeGroup()
    await act(groupId, { type: 'act', variantId: 'sing.humDusk' }, 'ann')
    await scheduler.wait(120)
    await act(groupId, { type: 'act', variantId: 'give.riverStone' }, 'bo')

    // Drop both columns back off, which is exactly the state an old group is in.
    await env.MONSTER_GROUP.getByName(groupId).forgetGrowthColumn()

    const after = await snapshot(groupId)
    expect(after.actions.length).toBe(2)
    // No backfill, deliberately. Nobody who acted before manners shipped was
    // ever asked how, so writing one onto their rows would invent a fact about
    // them and change the creature they raised.
    for (const row of after.actions) expect('methodId' in row).toBe(false)
  })

  it('lets the group carry on using manners afterwards', async () => {
    // The half a migration test usually forgets. Surviving the read is not the
    // same as being usable again, and a column added without the meta it needs
    // would pass the test above and fail on the very next action.
    const groupId = await makeGroup()
    await act(groupId, { type: 'act', variantId: 'sing.humDusk' }, 'ann')
    await env.MONSTER_GROUP.getByName(groupId).forgetGrowthColumn()
    await snapshot(groupId)

    const seen = await act(
      groupId,
      { type: 'act', variantId: 'give.riverStone', methodId: 'give.hidden' },
      'cy',
    )
    expect(seen).toContain('action')
    const after = await snapshot(groupId)
    expect(after.actions.length).toBe(2)
    expect(after.actions[1].methodId).toBe('give.hidden')
  })
})
