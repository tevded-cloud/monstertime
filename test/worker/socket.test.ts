// The socket half: what a group can and cannot do to its own creature.
//
// The limits here are not decoration. The log has a hard lifetime of 5000
// actions and no delete, because the log IS the creature and nothing could be
// removed to make room without making it a different animal. So a client that
// can write faster than a person can click is a client that can end somebody
// else's creature, permanently. That is why the whole-group limits exist
// alongside the per person ones: an actorId is a name the client chose, so any
// limit that has to hold against somebody deliberately trying has to be counted
// without reference to who anybody claims to be.

import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

interface Wire {
  send(message: unknown): void
  next(type: string, within?: number): Promise<Record<string, unknown>>
  all(): Record<string, unknown>[]
  close(): void
}

async function open(groupId: string): Promise<Wire> {
  const response = await SELF.fetch(`https://x/api/monstertime/groups/${groupId}/socket`, {
    headers: { Upgrade: 'websocket' },
  })
  const socket = response.webSocket
  if (!socket) throw new Error(`no socket for ${groupId}: status ${response.status}`)
  socket.accept()
  const seen: Record<string, unknown>[] = []
  socket.addEventListener('message', (event: MessageEvent) => {
    if (typeof event.data !== 'string') return
    if (event.data === 'pong') {
      seen.push({ type: 'pong' })
      return
    }
    seen.push(JSON.parse(event.data) as Record<string, unknown>)
  })
  return {
    send: (message) => socket.send(typeof message === 'string' ? message : JSON.stringify(message)),
    all: () => seen,
    close: () => socket.close(),
    async next(type, within = 2000) {
      const deadline = Date.now() + within
      for (;;) {
        const found = seen.find((m) => m.type === type)
        if (found) return found
        if (Date.now() > deadline) {
          throw new Error(`no ${type} within ${within}ms, saw: ${seen.map((m) => m.type).join(', ') || 'nothing'}`)
        }
        await scheduler.wait(15)
      }
    },
  }
}

async function makeGroup(): Promise<string> {
  const response = await SELF.fetch('https://x/api/monstertime/groups', { method: 'POST' })
  return ((await response.json()) as { groupId: string }).groupId
}

async function hello(wire: Wire, actorId: string, actorName = actorId): Promise<void> {
  wire.send({ type: 'hello', actorId, actorName })
  await wire.next('present')
}

describe('joining a group', () => {
  it('sends a snapshot on connect without being asked', async () => {
    // The first paint must not wait on a hello, or somebody opening a link sees
    // an empty stage while the app decides who they are.
    const wire = await open(await makeGroup())
    const snapshot = (await wire.next('snapshot')) as { snapshot: { actions: unknown[] } }
    expect(snapshot.snapshot.actions).toEqual([])
    wire.close()
  })

  it('refuses to act before anybody has said who they are', async () => {
    const wire = await open(await makeGroup())
    await wire.next('snapshot')
    wire.send({ type: 'act', variantId: 'feed.emberfruit' })
    await wire.next('error')
    expect(wire.all().some((m) => m.type === 'action')).toBe(false)
    wire.close()
  })

  it('answers a bare ping with pong', async () => {
    // The documented keepalive, answered by the runtime without waking the
    // object, which is the only reason it is free.
    const wire = await open(await makeGroup())
    await wire.next('snapshot')
    wire.send('ping')
    await wire.next('pong')
    wire.close()
  })
})

describe('a connection is bound to one actor', () => {
  it('accepts a second hello with the SAME id, which is how a rename works', async () => {
    const wire = await open(await makeGroup())
    await hello(wire, 'ann', 'Ann')
    wire.send({ type: 'hello', actorId: 'ann', actorName: 'Annie' })
    await scheduler.wait(120)
    expect(wire.all().some((m) => m.type === 'error')).toBe(false)
    wire.close()
  })

  it('refuses a second hello with a DIFFERENT id, and changes nothing', async () => {
    // Without this the per person limits are decorative: a single socket could
    // re-key itself before every action and reset all three brakes.
    const groupId = await makeGroup()
    const wire = await open(groupId)
    await hello(wire, 'ann')
    wire.send({ type: 'hello', actorId: 'someone-else', actorName: 'Mallory' })
    await wire.next('error')

    wire.send({ type: 'act', variantId: 'feed.emberfruit' })
    const action = (await wire.next('action')) as { action: { actorId: string } }
    expect(action.action.actorId).toBe('ann')
    wire.close()
  })
})

describe('what gets written', () => {
  it('tells everybody about an action, including whoever did it', async () => {
    // The actor has to take its place in the log from the server like everyone
    // else: the order of the log is the creature, so guessing locally would be
    // gambling with the animal's actual shape.
    const groupId = await makeGroup()
    const ann = await open(groupId)
    const bo = await open(groupId)
    await hello(ann, 'ann')
    await hello(bo, 'bo')

    ann.send({ type: 'act', variantId: 'feed.emberfruit' })
    const mine = (await ann.next('action')) as { action: { variantId: string; actorId: string } }
    const theirs = (await bo.next('action')) as { action: { variantId: string; actorId: string } }
    expect(mine.action.variantId).toBe('feed.emberfruit')
    expect(theirs.action).toEqual(mine.action)
    ann.close()
    bo.close()
  })

  it('authors the id and the timestamp itself and drops whatever the client sent', async () => {
    const groupId = await makeGroup()
    const wire = await open(groupId)
    await hello(wire, 'ann')
    wire.send({ type: 'act', variantId: 'feed.emberfruit', id: 'chosen', at: 5, actorName: 'Not Ann' })
    const { action } = (await wire.next('action')) as { action: { id: string; at: number; actorName: string } }
    expect(action.id).not.toBe('chosen')
    expect(action.at).toBeGreaterThan(1_600_000_000_000)
    expect(action.actorName).toBe('ann')
    wire.close()
  })

  it('refuses a variant that is not in the catalogue and stores nothing', async () => {
    const groupId = await makeGroup()
    const wire = await open(groupId)
    await hello(wire, 'ann')
    wire.send({ type: 'act', variantId: 'feed.notARealThing' })
    await wire.next('error')
    const snapshot = (await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()) as {
      actions: unknown[]
    }
    expect(snapshot.actions).toEqual([])
    wire.close()
  })

  it('refuses an action the creature is too young for', async () => {
    // Four variants carry a minStage and the server enforces it, because the
    // client only OFFERS what the creature is old enough for and a hand-rolled
    // client can send anything. An action stored out of its stage is a pressure
    // the design says the animal cannot feel yet, sitting in the log forever.
    const groupId = await makeGroup()
    const wire = await open(groupId)
    await hello(wire, 'ann')
    wire.send({ type: 'act', variantId: 'train.standGround' })
    const error = (await wire.next('error')) as { message: string }
    expect(error.message).toMatch(/ready/i)
    const snapshot = (await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()) as {
      actions: unknown[]
    }
    expect(snapshot.actions).toEqual([])
    wire.close()
  })
})

describe('the brakes', () => {
  it('refuses a second action from the same person straight away', async () => {
    // One action per ten seconds per actorId. Asserted by the refusal rather
    // than by waiting it out, so the suite does not spend ten seconds proving
    // a constant.
    const groupId = await makeGroup()
    const wire = await open(groupId)
    await hello(wire, 'ann')
    wire.send({ type: 'act', variantId: 'feed.emberfruit' })
    await wire.next('action')
    wire.send({ type: 'act', variantId: 'feed.riverGreens' })
    await wire.next('error')

    const snapshot = (await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()) as {
      actions: unknown[]
    }
    expect(snapshot.actions.length).toBe(1)
    wire.close()
  })

  it('counts the whole group ceiling without reference to who anybody claims to be', async () => {
    // The security limit. A second socket saying a different name is exactly
    // how somebody gets around the per person brakes, so the group ceiling has
    // to hold against a caller who invents a new identity for every action.
    const groupId = await makeGroup()
    const wires: Wire[] = []
    let stored = 0
    for (let i = 0; i < 16; i++) {
      const wire = await open(groupId)
      await hello(wire, `made-up-${i}`)
      wire.send({ type: 'act', variantId: 'feed.emberfruit' })
      await scheduler.wait(60)
      if (wire.all().some((m) => m.type === 'action')) stored += 1
      wires.push(wire)
    }
    const snapshot = (await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()) as {
      actions: unknown[]
    }
    // Twelve per minute for the whole group, whoever wrote them.
    expect(snapshot.actions.length).toBeLessThanOrEqual(12)
    expect(stored).toBeLessThanOrEqual(12)
    for (const wire of wires) wire.close()
  })
})
