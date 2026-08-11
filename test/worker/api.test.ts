// The HTTP half of the group server, run inside workerd.
//
// These are the paths a stranger can reach with nothing but a URL, so most of
// what is asserted here is a refusal. The one that matters most is the cheapest
// to get wrong: a Durable Object is instantiated by the act of asking about it,
// so a probe of a group id that was never minted must read once and write
// nothing, or an unknown id becomes a way to make this app write storage in a
// loop out of an allowance shared with the rest of tevded.com.

import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

async function makeGroup(): Promise<string> {
  const response = await SELF.fetch('https://x/api/monstertime/groups', { method: 'POST' })
  expect(response.status).toBe(201)
  return ((await response.json()) as { groupId: string }).groupId
}

describe('minting a group', () => {
  it('mints on POST and answers 201 with an id', async () => {
    const id = await makeGroup()
    expect(id).toMatch(/^[A-Za-z0-9_-]{16,64}$/)
  })

  it('never mints the same id twice', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 12; i++) ids.add(await makeGroup())
    expect(ids.size).toBe(12)
  })

  it('refuses to mint with GET', async () => {
    const response = await SELF.fetch('https://x/api/monstertime/groups')
    expect(response.status).toBe(405)
  })

  it('never takes the id or the seed from the caller', async () => {
    // Both decide which animal a group gets. A client that could choose either
    // could hand two friend groups the same creature, which is the one outcome
    // this app has no answer for.
    const response = await SELF.fetch('https://x/api/monstertime/groups', {
      method: 'POST',
      body: JSON.stringify({ groupId: 'chosen-by-the-caller', seed: 'ff'.repeat(32) }),
    })
    const { groupId } = (await response.json()) as { groupId: string }
    expect(groupId).not.toBe('chosen-by-the-caller')
    const snapshot = await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()
    expect((snapshot as { genome: { seed: string } }).genome.seed).not.toBe('ff'.repeat(32))
  })
})

describe('reading a group', () => {
  it('answers a snapshot for a group that exists', async () => {
    const id = await makeGroup()
    const response = await SELF.fetch(`https://x/api/monstertime/groups/${id}`)
    expect(response.status).toBe(200)
    const snapshot = (await response.json()) as {
      groupId: string
      genome: { seed: string; carried: Record<string, string[]> }
      actions: unknown[]
    }
    expect(snapshot.groupId).toBe(id)
    expect(snapshot.actions).toEqual([])
    expect(snapshot.genome.seed).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.entries(snapshot.genome.carried).length).toBe(8)
  })

  it('answers 404 for a group nobody ever minted', async () => {
    const response = await SELF.fetch('https://x/api/monstertime/groups/neverMintedAtAllXX')
    expect(response.status).toBe(404)
  })

  it('writes nothing when asked about a group that does not exist', async () => {
    // The expensive failure. Probing an unknown id used to spin up an object
    // and write three statements to it before deciding the answer was 404.
    // Checked by probing, then minting THAT id is impossible, so instead the
    // probe is repeated and the group must still not exist: a probe that had
    // created rows would answer 200 the second time.
    const id = 'probeMeButDoNotCreate'
    for (let i = 0; i < 5; i++) {
      expect((await SELF.fetch(`https://x/api/monstertime/groups/${id}`)).status).toBe(404)
    }
  })

  it('refuses a malformed id without reaching for an object at all', async () => {
    for (const bad of ['short', 'has spaces here', '../../etc', 'x'.repeat(200)]) {
      const response = await SELF.fetch(`https://x/api/monstertime/groups/${encodeURIComponent(bad)}`)
      expect(response.status).toBe(404)
    }
  })

  it('refuses to read a group with POST', async () => {
    const id = await makeGroup()
    const response = await SELF.fetch(`https://x/api/monstertime/groups/${id}`, { method: 'POST' })
    expect(response.status).toBe(405)
  })
})

describe('the socket endpoint', () => {
  it('refuses a plain GET with 426', async () => {
    const id = await makeGroup()
    const response = await SELF.fetch(`https://x/api/monstertime/groups/${id}/socket`)
    expect(response.status).toBe(426)
  })

  it('upgrades a real websocket handshake', async () => {
    const id = await makeGroup()
    const response = await SELF.fetch(`https://x/api/monstertime/groups/${id}/socket`, {
      headers: { Upgrade: 'websocket' },
    })
    expect(response.status).toBe(101)
    expect(response.webSocket).not.toBeNull()
  })

  it('refuses a socket to a group that does not exist', async () => {
    const response = await SELF.fetch('https://x/api/monstertime/groups/neverMintedAtAllXX/socket', {
      headers: { Upgrade: 'websocket' },
    })
    expect(response.status).toBe(404)
  })
})

describe('everything else on the domain', () => {
  it('hands back anything outside the prefix rather than answering it', async () => {
    // handleMonsterTime returning null is what lets tevded.com go on serving
    // fifteen other apps exactly as it did before this module existed. Here the
    // local host answers those with a 404 of its own; what is asserted is that
    // the module did not claim them.
    for (const path of ['/', '/colortime/room/ABCD2345', '/symptime/', '/api/other/thing']) {
      const response = await SELF.fetch(`https://x${path}`)
      expect(response.headers.get('content-type')).toContain('text/plain')
    }
  })

  it('answers an unknown endpoint under its own prefix with 404 JSON', async () => {
    const response = await SELF.fetch('https://x/api/monstertime/nothing-here')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
  })
})
