// The sleep gate, as the server enforces it.
//
// Sleep is the only rule in this app that turns an action away for hours at a
// time, which makes it the one where being wrong in either direction is
// expensive. Refuse while it is up and a group is shut out of their own animal
// with nothing on screen that could explain it; allow while it is down and the
// sleeping half of its life was decoration.
//
// Every fixture here is built so that EVERY OTHER GATE WOULD PASS, and that is
// why the file is shaped the way it is. A negative test goes green the moment
// anything at all refuses, and this repo has already shipped a check that was
// never wired up, with two tests passing the whole time on a different rule's
// refusal. A fresh group is an egg and about twenty variants are gated behind a
// stage it has not reached, so everything done here is one of the dozen a stage
// nought creature is offered; every step uses somebody who has not just acted,
// because one person is held to a ten second cooldown; and every refusal has a
// positive control beside it, the identical request with the sleep taken away,
// which has to succeed. Without that pairing these tests would still be green
// with the gate deleted, which is the only thing they exist to notice.
//
// Reaching sleep at all needs the group's whole life moved backwards, because a
// creature is awake on the day its group is made, always and by construction.
// That is what age() is for, and it is the same hook that lets a rouse run out
// without half an hour of real waiting.

import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import {
  allowedWhileAsleep,
  availableVariants,
  lastRouseAt,
  ROUSE_MS,
  sleepStateOf,
} from '../../src/dna/index'
import type { SleepState } from '../../src/dna/index'
import type { Genome } from '../../src/core/types'

/** Nobody has woken it, which is what every test about the timetable itself
 *  wants to say. Named rather than a bare zero, because a lone 0 at the end of
 *  five arguments reads as a placeholder and this one is a fact. */
const NEVER_WOKEN = 0


const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** One message off the wire. Whole messages rather than their types, because
 *  half of what is checked here is what a refusal actually carries. */
interface Said {
  type: string
  [key: string]: unknown
}

interface Snap {
  createdAt: number
  genome: Genome
  // `at` as well as the id, because working out when it was last woken is
  // exactly what the app does with this list.
  actions: { variantId: string; at: number }[]
}

async function makeGroup(): Promise<string> {
  const response = await SELF.fetch('https://x/api/monstertime/groups', { method: 'POST' })
  return ((await response.json()) as { groupId: string }).groupId
}

async function snapshot(groupId: string): Promise<Snap> {
  return (await (await SELF.fetch(`https://x/api/monstertime/groups/${groupId}`)).json()) as Snap
}

function kinds(said: Said[]): string[] {
  return said.map((one) => one.type)
}

/** Whether the server has finished with this request one way or another.
 *  `asleep` belongs here with the other two, or every refusal below would sit
 *  out the whole timeout before the loop gave up on it. */
function answered(said: Said[]): boolean {
  return said.some((one) => one.type === 'action' || one.type === 'error' || one.type === 'asleep')
}

/** Do one thing, on a connection of its own, and report everything that came
 *  back. A new connection every time is deliberate: nothing about being awake
 *  may be held per socket, so every step here arrives at an object that has
 *  never seen this person before. */
async function act(groupId: string, variantId: string, who: string): Promise<Said[]> {
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
  socket.send(JSON.stringify({ type: 'hello', actorId: who, actorName: who }))
  await scheduler.wait(80)
  socket.send(JSON.stringify({ type: 'act', variantId }))
  for (let i = 0; i < 40 && !answered(said); i++) await scheduler.wait(25)
  socket.close()
  return said
}

/**
 * Move a group forward to the night it was always going to have.
 *
 * When it goes down is not a constant and cannot be: how long a creature's day
 * runs, and where in that day its group met it, are both rolled from the seed.
 * So the moment is asked for with the same call the app makes, and the group is
 * then aged by exactly that much and a minute. The minute is margin, because on
 * the boundary this would be deciding a test on which side of a millisecond two
 * clocks landed, and the shortest stretch of sleep any seed can roll is close
 * to four hours, so a minute in is still the middle of the night as far as
 * everything below is concerned.
 */
async function putToSleep(groupId: string): Promise<void> {
  const before = await snapshot(groupId)
  const now = Date.now()
  const up = sleepStateOf(before.genome, before.createdAt, now, NEVER_WOKEN)
  // Stated rather than assumed. If a creature could be born asleep, `until`
  // here would be a waking time instead, this would age the group into the
  // following morning, and every test using it would go green for the wrong
  // reason with nothing to show that it had.
  expect(up.asleep).toBe(false)
  await env.MONSTER_GROUP.getByName(groupId).age(up.until - now + MINUTE)

  const after = await snapshot(groupId)
  expect(sleepStateOf(after.genome, after.createdAt, Date.now(), NEVER_WOKEN).asleep).toBe(true)
}

describe('while it is asleep', () => {
  it('refuses an ordinary thing, and takes the identical thing while it is awake', async () => {
    // The control comes first and it is on the SAME group with the SAME
    // variant, so the only difference between the two halves of this test is
    // whether the creature is down. A second person does the second half
    // because the first one is inside their cooldown, and a cooldown refusal
    // would be this test passing while proving nothing.
    const groupId = await makeGroup()
    expect(kinds(await act(groupId, 'sing.humDusk', 'ann'))).toContain('action')

    await putToSleep(groupId)
    const seen = kinds(await act(groupId, 'sing.humDusk', 'bo'))
    expect(seen).toContain('asleep')
    expect(seen).not.toContain('action')
    // Refused means nothing written. A row for something the creature was
    // asleep through would be in the log for the rest of its life.
    expect((await snapshot(groupId)).actions.length).toBe(1)
  })

  it('takes the one thing that is allowed, in the same state that refuses the rest', async () => {
    const groupId = await makeGroup()
    await putToSleep(groupId)

    // The negative half sits inside this test on purpose. On its own, "the wake
    // variant is accepted" is a sentence that stays true with the gate deleted.
    const refused = kinds(await act(groupId, 'give.riverStone', 'ann'))
    expect(refused).toContain('asleep')

    const taken = kinds(await act(groupId, 'tend.wakeIt', 'bo'))
    expect(taken).toContain('action')
    expect(taken).not.toContain('error')

    const rows = (await snapshot(groupId)).actions
    expect(rows.length).toBe(1)
    expect(rows[0].variantId).toBe('tend.wakeIt')
  })

  it('answers with the stretch it is in, worked out the way the app works it out', async () => {
    // The refusal is a correction, not a mystery: both sides compute sleep from
    // the seed and the birthday, and this is what says they land on the same
    // arithmetic rather than merely agreeing that it is night. `now` is the
    // server's own clock, which is the only thing a phone that is running fast
    // can put its countdown back on.
    const groupId = await makeGroup()
    await putToSleep(groupId)

    const said = await act(groupId, 'sing.humDusk', 'ann')
    const asleep = said.find((one) => one.type === 'asleep')
    expect(asleep).toBeDefined()
    const since = Number(asleep?.since)
    const until = Number(asleep?.until)
    const now = Number(asleep?.now)
    expect(since).toBeLessThanOrEqual(now)
    expect(until).toBeGreaterThan(now)

    const snap = await snapshot(groupId)
    const mine = sleepStateOf(snap.genome, snap.createdAt, now, NEVER_WOKEN)
    expect(mine.asleep).toBe(true)
    expect(mine.since).toBe(since)
    expect(mine.until).toBe(until)
  })
})

describe('waking it', () => {
  it('gets the group back in, when the same request was refused a moment before', async () => {
    const groupId = await makeGroup()
    await putToSleep(groupId)

    // Refused, then woken, then the identical request from the identical person
    // goes through. Ann has no row in the log yet, because a refusal writes
    // nothing, so there is no cooldown standing between her two attempts.
    expect(kinds(await act(groupId, 'sing.humDusk', 'ann'))).toContain('asleep')
    expect(kinds(await act(groupId, 'tend.wakeIt', 'bo'))).toContain('action')
    expect(kinds(await act(groupId, 'sing.humDusk', 'ann'))).toContain('action')

    // And it is still up for the next person, which is the difference between
    // waking it and buying one action. Somebody else again, on a connection of
    // its own: if being awake lived in memory rather than in the log, this is
    // where it would not be there any more.
    expect(kinds(await act(groupId, 'give.riverStone', 'cy'))).toContain('action')
    expect((await snapshot(groupId)).actions.length).toBe(3)
  })

  it('runs out, and it goes back down, and it can be woken again', async () => {
    const groupId = await makeGroup()
    await putToSleep(groupId)
    expect(kinds(await act(groupId, 'tend.wakeIt', 'ann'))).toContain('action')
    expect(kinds(await act(groupId, 'sing.humDusk', 'bo'))).toContain('action')

    // Ninety minutes with nobody there. Longer than this file is allowed to
    // hold a creature up for, and still hours short of the end of the window it
    // is in, so what changes here is the rouse and not the night.
    await env.MONSTER_GROUP.getByName(groupId).age(90 * MINUTE)
    const snap = await snapshot(groupId)
    expect(sleepStateOf(snap.genome, snap.createdAt, Date.now(), NEVER_WOKEN).asleep).toBe(true)

    const seen = kinds(await act(groupId, 'sing.humDusk', 'cy'))
    expect(seen).toContain('asleep')
    expect(seen).not.toContain('action')

    // Down is never a locked door. There is always the one thing left to do,
    // and doing it again costs another action out of the group's evening.
    expect(kinds(await act(groupId, 'tend.wakeIt', 'di'))).toContain('action')
    expect(kinds(await act(groupId, 'sing.humDusk', 'cy'))).toContain('action')
  })

  it('is refused while it is already awake', async () => {
    // The other half of the gate. The tray never offers this while the creature
    // is up, but a client is not the only thing that can send a message, and
    // this one carries a push: without the check it is a button nobody can see
    // that moves three axes for free, and it is also how a group would bank a
    // rouse against the night that is coming.
    const groupId = await makeGroup()
    const seen = kinds(await act(groupId, 'tend.wakeIt', 'ann'))
    expect(seen).toContain('error')
    expect(seen).not.toContain('action')
    expect((await snapshot(groupId)).actions.length).toBe(0)

    // The control: the same person, seconds later, doing something that is on
    // the tray. What refused above was the flag on the variant and not anything
    // about Ann or the state of the group.
    expect(kinds(await act(groupId, 'sing.humDusk', 'ann'))).toContain('action')
  })
})

describe('a group made before sleep existed', () => {
  it('still opens on the old schema, and can still be put down and woken', async () => {
    // Sleep adds no column, and this is the test that says so rather than the
    // comment claiming it. The rouse is read back out of rows that have been
    // there since the first deploy, so a group put back on the schema it had
    // before growth and manners existed, which is the shape that turned into a
    // 500 for every creature at once the last time something needed a column,
    // has everything the gate reads.
    const groupId = await makeGroup()
    expect(kinds(await act(groupId, 'sing.humDusk', 'ann'))).toContain('action')
    await env.MONSTER_GROUP.getByName(groupId).forgetGrowthColumn()

    // Surviving the read is the first half and it is the half that is usually
    // tested on its own.
    const opened = await snapshot(groupId)
    expect(opened.actions.length).toBe(1)

    // Being usable afterwards is the other half. A migration that leaves a
    // group readable and refuses its next action has passed the test above and
    // broken the app.
    await putToSleep(groupId)
    expect(kinds(await act(groupId, 'give.riverStone', 'bo'))).toContain('asleep')
    expect(kinds(await act(groupId, 'tend.wakeIt', 'bo'))).toContain('action')
    expect(kinds(await act(groupId, 'give.riverStone', 'cy'))).toContain('action')
    expect((await snapshot(groupId)).actions.length).toBe(3)
  })
})

describe('the app and the server agreeing about a waking', () => {
  // The defect these exist for shipped and was caught in review. The server
  // grew a waking window of its own, in the worker, and the app never learned
  // the word: for half an hour after somebody woke the creature the server
  // would take any ordinary action while every screen still drew a sleeping
  // animal and offered the one button the server now refused. Tapping it
  // returned an error the app does not put on screen, so the group got a
  // dead button and no explanation.
  //
  // Nothing in the 265 tests that existed then could fail. These are the ones
  // that can, and they work the way the app works: derive the answer with the
  // same two shared functions the app calls, and check the server acts on it.

  /** What a screen would say, from a snapshot and nothing else. */
  function asTheAppSeesIt(snap: Snap, now: number): SleepState {
    return sleepStateOf(
      snap.genome,
      snap.createdAt,
      now,
      lastRouseAt(snap.actions, now, allowedWhileAsleep),
    )
  }

  it('has the app call it awake the moment the server does', async () => {
    const groupId = await makeGroup()
    await putToSleep(groupId)
    expect(asTheAppSeesIt(await snapshot(groupId), Date.now()).asleep).toBe(true)

    expect(kinds(await act(groupId, 'tend.wakeIt', 'ann'))).toContain('action')

    // The whole bug in one line. This was `true` before the waking moved into
    // the shared file, while the server had already changed its mind.
    expect(asTheAppSeesIt(await snapshot(groupId), Date.now()).asleep).toBe(false)
  })

  it('offers the group the things the server will actually take', async () => {
    // The consequence a person feels. availableVariants is what fills the tray,
    // and it is handed the app's answer, so if that answer is wrong the tray is
    // wrong: five of the six kinds stay empty and the only live button is one
    // the server turns away.
    const groupId = await makeGroup()
    await putToSleep(groupId)
    expect(kinds(await act(groupId, 'tend.wakeIt', 'ann'))).toContain('action')

    const snap = await snapshot(groupId)
    const seen = asTheAppSeesIt(snap, Date.now())
    const offered = availableVariants(9, seen.asleep).map((v) => v.id)
    expect(offered).toContain('sing.humDusk')
    expect(offered).not.toContain('tend.wakeIt')

    // And the server agrees, which is the half a tray cannot prove on its own.
    expect(kinds(await act(groupId, 'sing.humDusk', 'bo'))).toContain('action')
    expect(kinds(await act(groupId, 'tend.wakeIt', 'cy'))).toContain('error')
  })

  it('puts it back down at the same moment on both sides', async () => {
    // The other end of the window. An app that held it awake longer than the
    // server does is the same defect pointing the other way: the tray would
    // offer six kinds and the server would refuse all of them.
    const groupId = await makeGroup()
    await putToSleep(groupId)
    expect(kinds(await act(groupId, 'tend.wakeIt', 'ann'))).toContain('action')

    const snap = await snapshot(groupId)
    const woke = snap.actions[snap.actions.length - 1].at
    expect(asTheAppSeesIt(snap, woke + ROUSE_MS - 1).asleep).toBe(false)
    expect(asTheAppSeesIt(snap, woke + ROUSE_MS).asleep).toBe(true)

    await env.MONSTER_GROUP.getByName(groupId).age(ROUSE_MS + MINUTE)
    expect(kinds(await act(groupId, 'sing.humDusk', 'bo'))).toContain('asleep')
  })

  it('keeps the waking short enough for the server to still be able to see it', async () => {
    // Not a behaviour, a relationship, and the only thing holding it down.
    //
    // The server answers "when was it last woken" out of the last
    // GROUP_ACTS_PER_HOUR rows, and that read is complete only because the
    // group's hourly cap makes it impossible for a row inside the window to
    // have fallen off the end of it. Push the window past the hour the cap
    // covers and the server starts missing wakings that groups paid an action
    // for, silently, with every other test in this file still green.
    expect(ROUSE_MS).toBeLessThan(HOUR)
  })
})
