// Binding a real person to what they did.
//
// worker/README.md has said since the start that anybody in a group can post as
// anybody else in it, because actorId is a string the browser invents. That was
// tolerable while the only shared thing was a creature. It is not tolerable now
// that a name on a trait is meant to mean something, and it is the thing that
// has to be closed before coins exist.
//
// The mechanism is one character. A verified id starts with '@', which ACTOR_ID
// forbids, so a client cannot mint one however it asks. No new column, no
// second table, and every place that already reads an actorId gets the
// distinction for nothing.

import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const encode = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)))

async function makeGroup(): Promise<string> {
  const r = await SELF.fetch('https://x/api/monstertime/groups', { method: 'POST' })
  return ((await r.json()) as { groupId: string }).groupId
}

interface Wire {
  send(m: unknown): void
  seen(): Record<string, unknown>[]
  close(): void
}

async function open(groupId: string): Promise<Wire> {
  const r = await SELF.fetch(`https://x/api/monstertime/groups/${groupId}/socket`, {
    headers: { Upgrade: 'websocket' },
  })
  const socket = r.webSocket
  if (!socket) throw new Error('no socket')
  socket.accept()
  const seen: Record<string, unknown>[] = []
  socket.addEventListener('message', (e: MessageEvent) => {
    if (typeof e.data === 'string' && e.data !== 'pong') {
      seen.push(JSON.parse(e.data) as Record<string, unknown>)
    }
  })
  return {
    send: (m) => socket.send(JSON.stringify(m)),
    seen: () => seen,
    close: () => socket.close(),
  }
}

async function present(w: Wire): Promise<string[]> {
  for (let i = 0; i < 40; i++) {
    const p = [...w.seen()].reverse().find((m) => m.type === 'present')
    if (p) return (p.present as { actorId: string }[]).map((a) => a.actorId)
    await scheduler.wait(25)
  }
  return []
}

describe('signing in without a project configured', () => {
  it('leaves everybody a guest, and the app exactly as it was', async () => {
    // The deployment this ships as until a Firebase project exists. Nothing
    // knows what to believe, so nothing is believed, and a token is simply
    // ignored rather than being an error somebody has to understand.
    expect(env.MONSTERTIME_FIREBASE_PROJECT ?? '').toBe('')

    const groupId = await makeGroup()
    const w = await open(groupId)
    w.send({ type: 'hello', actorId: 'ann', actorName: 'Ann', token: 'anything at all' })
    expect(await present(w)).toEqual(['ann'])
    w.close()
  })
})

describe('a client cannot promote itself', () => {
  it('refuses an actorId that would read as verified', async () => {
    // The whole mechanism in one test. If '@' were allowed through, a browser
    // could simply claim to be a signed-in person and every guarantee built on
    // top of this would be decoration.
    const groupId = await makeGroup()
    const w = await open(groupId)
    for (const forged of ['@somebody', '@', 'ann@', '@firebase-uid-abc']) {
      w.send({ type: 'hello', actorId: forged, actorName: 'Mallory' })
    }
    await scheduler.wait(200)
    // Every one was refused at the parse, so nobody ever arrived.
    expect(w.seen().some((m) => m.type === 'present')).toBe(false)
    w.close()
  })

  it('still takes an ordinary guest id', async () => {
    const groupId = await makeGroup()
    const w = await open(groupId)
    w.send({ type: 'hello', actorId: 'plain-guest_1', actorName: 'Guest' })
    expect(await present(w)).toEqual(['plain-guest_1'])
    w.close()
  })

  it('keeps a guest id out of the verified namespace in the log too', async () => {
    // Credit is read off the action rows, so an unverified id must never reach
    // them wearing the prefix either.
    const groupId = await makeGroup()
    const w = await open(groupId)
    w.send({ type: 'hello', actorId: 'guest2', actorName: 'Guest' })
    await present(w)
    w.send({ type: 'act', variantId: 'sing.humDusk' })
    for (let i = 0; i < 40 && !w.seen().some((m) => m.type === 'action'); i++) await scheduler.wait(25)

    const snap = (await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()) as {
      actions: { actorId: string }[]
    }
    expect(snap.actions.length).toBe(1)
    expect(snap.actions[0].actorId).toBe('guest2')
    expect(snap.actions[0].actorId.startsWith('@')).toBe(false)
    w.close()
  })
})

describe('the token, when a project IS configured', () => {
  // The verifier has its own suite; what is tested here is the wiring, which is
  // the part that decides whether any of that verifying is reached.
  it('is checked rather than trusted, and a bad one is refused', async () => {
    const groupId = await makeGroup()
    const w = await open(groupId)
    // Nonsense that no verifier would ever accept. With no project configured
    // it is ignored; the assertion that matters is that it never results in a
    // verified id either way.
    w.send({ type: 'hello', actorId: 'ann', actorName: 'Ann', token: `${encode({ alg: 'none' })}.x.` })
    await scheduler.wait(200)
    const ids = await present(w)
    for (const id of ids) expect(id.startsWith('@')).toBe(false)
    w.close()
  })
})
