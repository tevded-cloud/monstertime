// The name a group opens by.
//
// A link lives in one chat thread and is gone the moment that thread moves on,
// so the name is how people actually get back to their own creature. It is a
// nickname and not a key, and nothing here pretends otherwise: anybody who
// types it is in.
//
// The two things worth testing are the two that bite. First, a name is claimed
// once and only once, and that has to hold when two groups ask at the same
// moment. Second, asking about a name nobody has taken must not write anything,
// or typing guesses into the box becomes a way to make this app create storage
// out of an allowance shared with the rest of the domain.

import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

async function makeGroup(): Promise<string> {
  const response = await SELF.fetch('https://x/api/monstertime/groups', { method: 'POST' })
  return ((await response.json()) as { groupId: string }).groupId
}

function claim(handle: string, groupId: string): Promise<Response> {
  return SELF.fetch(`https://x/api/monstertime/handles/${encodeURIComponent(handle)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ groupId }),
  })
}

function resolve(handle: string): Promise<Response> {
  return SELF.fetch(`https://x/api/monstertime/handles/${encodeURIComponent(handle)}`)
}

describe('claiming a name', () => {
  it('claims a free name and answers with it', async () => {
    const groupId = await makeGroup()
    const response = await claim('buttmcgee', groupId)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ handle: 'buttmcgee', groupId })
  })

  it('finds the group again by name', async () => {
    const groupId = await makeGroup()
    await claim('the-lads', groupId)
    const response = await resolve('the-lads')
    expect(response.status).toBe(200)
    expect((await response.json()) as { groupId: string }).toEqual({ handle: 'the-lads', groupId })
  })

  it('gives a name to the first group that asks and nobody else', async () => {
    const first = await makeGroup()
    const second = await makeGroup()
    expect((await claim('shared-name', first)).status).toBe(201)

    const clash = await claim('shared-name', second)
    expect(clash.status).toBe(409)

    // And the loser did not quietly take it anyway.
    expect(((await (await resolve('shared-name')).json()) as { groupId: string }).groupId).toBe(first)
  })

  it('lets the group that holds a name claim it again', async () => {
    // Somebody pressing the button twice is not a conflict.
    const groupId = await makeGroup()
    expect((await claim('twice-over', groupId)).status).toBe(201)
    expect((await claim('twice-over', groupId)).status).toBe(201)
  })

  it('folds case and spaces, so a name shouted across a room reaches one group', async () => {
    const groupId = await makeGroup()
    await claim('Butt McGee', groupId)
    for (const typed of ['butt-mcgee', 'BUTT-MCGEE', '  Butt-McGee  ']) {
      const response = await resolve(typed)
      expect(response.status).toBe(200)
      expect(((await response.json()) as { groupId: string }).groupId).toBe(groupId)
    }
  })

  it('keeps the older name working after a group takes a new one', async () => {
    // A name already given out to somebody has to go on working, or renaming
    // the group quietly strands whoever was told the old one.
    const groupId = await makeGroup()
    await claim('first-name', groupId)
    await claim('second-name', groupId)
    expect(((await (await resolve('first-name')).json()) as { groupId: string }).groupId).toBe(groupId)
    expect(((await (await resolve('second-name')).json()) as { groupId: string }).groupId).toBe(groupId)
  })

  it('puts the name on the group, so the app can show what it opens by', async () => {
    const groupId = await makeGroup()
    await claim('on-the-snapshot', groupId)
    const snapshot = (await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()) as {
      handle: string | null
    }
    expect(snapshot.handle).toBe('on-the-snapshot')
  })
})

describe('what a name refuses', () => {
  it('refuses to name a group that was never minted', async () => {
    // Without this a stranger could park every good name against ids nobody
    // ever made, and the names would be gone before anybody wanted one.
    const response = await claim('parked', 'neverMintedAtAllXX')
    expect(response.status).toBe(404)
    expect((await resolve('parked')).status).toBe(404)
  })

  it('refuses a shape that is not a name', async () => {
    const groupId = await makeGroup()
    for (const bad of ['ab', '-leading', 'trailing-', 'punctuation!', 'x'.repeat(40)]) {
      expect((await claim(bad, groupId)).status).toBe(400)
    }
  })

  it('takes a name with a space in it as the hyphenated one', async () => {
    // Not a refusal. Somebody typing "butt mcgee" means the group called
    // butt-mcgee, and turning that into an error would be pedantry.
    const groupId = await makeGroup()
    expect((await claim('space cadet', groupId)).status).toBe(201)
    expect(((await (await resolve('space-cadet')).json()) as { groupId: string }).groupId).toBe(groupId)
  })

  it('answers 404 for a name nobody has taken', async () => {
    expect((await resolve('nobody-is-called-this')).status).toBe(404)
  })

  it('writes nothing when asked about a name nobody has taken', async () => {
    // Same rule as an unminted group id, for the same reason. If the first ask
    // created the pointer, the second would find it.
    for (let i = 0; i < 5; i++) {
      expect((await resolve('still-nobody')).status).toBe(404)
    }
    const groupId = await makeGroup()
    expect((await claim('still-nobody', groupId)).status).toBe(201)
  })

  it('refuses a claim with no group in it', async () => {
    const response = await SELF.fetch('https://x/api/monstertime/handles/no-body', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    })
    expect(response.status).toBe(400)
  })

  it('refuses to claim with GET or POST', async () => {
    const response = await SELF.fetch('https://x/api/monstertime/handles/wrong-method', { method: 'POST' })
    expect(response.status).toBe(405)
  })

  it('keeps names and group ids in separate key spaces', async () => {
    // A pointer lives under '#h:', which GROUP_ID can never match, so a name
    // can never be reached as a group and a group id can never be typed as a
    // name. If that ever stopped being true, one of these would answer.
    const groupId = await makeGroup()
    await claim('not-a-group', groupId)
    // A name's pointer cannot be reached as a group.
    expect((await SELF.fetch('https://x/api/monstertime/groups/%23h:not-a-group')).status).toBe(404)
    // And a group id typed into the name box never reaches the group. Asserted
    // as "not 200" rather than as a particular refusal on purpose: a minted id
    // is base64url, so whether it is even a well shaped name depends on whether
    // that id happened to contain an underscore, and pinning 400 or 404 here
    // makes the test pass or fail on the roll of a seed.
    const asName = await resolve(groupId)
    expect(asName.status).not.toBe(200)
    expect(await asName.text()).not.toContain(groupId)
  })
})
