// Naming the group tells everybody looking at it.
//
// Its own file because it needs a socket open across the claim, and the claim
// arrives over HTTP rather than down the socket: the name is settled on a
// pointer object and then written onto the group, so the group has to be the
// one that speaks up. Without this the person who claimed the name goes on
// looking at the form they just filled in, and nobody else finds out the group
// has a name until they next reload.

import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

async function makeGroup(): Promise<string> {
  const response = await SELF.fetch('https://x/api/monstertime/groups', { method: 'POST' })
  return ((await response.json()) as { groupId: string }).groupId
}

describe('naming a group reaches the people watching it', () => {
  it('sends everybody a fresh snapshot carrying the new name', async () => {
    const groupId = await makeGroup()
    const response = await SELF.fetch(`https://x/api/monstertime/groups/${groupId}/socket`, {
      headers: { Upgrade: 'websocket' },
    })
    const socket = response.webSocket
    if (!socket) throw new Error('no socket')
    socket.accept()

    const seen: { type: string; handle?: string | null }[] = []
    socket.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string' || event.data === 'pong') return
      const message = JSON.parse(event.data) as { type: string; snapshot?: { handle: string | null } }
      seen.push({ type: message.type, handle: message.snapshot ? message.snapshot.handle : undefined })
    })

    // The snapshot every connection gets on arrival, before there is a name.
    await scheduler.wait(120)
    expect(seen[0].type).toBe('snapshot')
    expect(seen[0].handle).toBeNull()

    await SELF.fetch('https://x/api/monstertime/handles/watched-live', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId }),
    })

    await scheduler.wait(250)
    const named = seen.filter((m) => m.type === 'snapshot' && m.handle === 'watched-live')
    expect(named.length).toBe(1)
    socket.close()
  })

  it('says nothing to a group that was not the one named', async () => {
    // The broadcast is the named group's own, not everybody's.
    const named = await makeGroup()
    const other = await makeGroup()
    const response = await SELF.fetch(`https://x/api/monstertime/groups/${other}/socket`, {
      headers: { Upgrade: 'websocket' },
    })
    const socket = response.webSocket
    if (!socket) throw new Error('no socket')
    socket.accept()
    const seen: string[] = []
    socket.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string' && event.data !== 'pong') {
        seen.push((JSON.parse(event.data) as { type: string }).type)
      }
    })
    await scheduler.wait(120)
    const before = seen.length

    await SELF.fetch('https://x/api/monstertime/handles/somebody-else', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId: named }),
    })

    await scheduler.wait(250)
    expect(seen.length).toBe(before)
    socket.close()
  })
})
