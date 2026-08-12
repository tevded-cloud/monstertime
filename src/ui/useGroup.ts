// useGroup.ts: the only place the UI touches the network or the derivation.
//
// Everything below the interface is pure: the components take a Creature and
// render it. That split matters because the creature is derived on every
// message, and if derivation were scattered through components we would end up
// rebuilding the animal several times per frame for no reason.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ACTIVITY_PATTERNS } from '../core/types'
import type { Creature, Genome, GroupSnapshot, PresentActor } from '../core/types'
import { allowedWhileAsleep, deriveCreature, lastRouseAt, ROUSE_MS, sleepStateOf } from '../dna'
import type { SleepState } from '../dna'
import { connect, localActor, setLocalName } from '../net'
import { codeFor, keepCode } from './passcode'
import type { Connection, ConnectionStatus } from '../net'

// A group id lives in the hash so the whole app can ship as one static file
// with no routing on the server. Links people paste to each other are the
// growth mechanic, so the reader is deliberately forgiving about shape while
// the writer only ever produces the short canonical form.
const ID_SHAPE = /^[A-Za-z0-9_-]{3,64}$/

export function readGroupIdFromHash(): string | null {
  const raw = location.hash.replace(/^#/, '').replace(/^\/?g\//, '').trim()
  if (!raw) return null
  const id = raw.split(/[?&/]/)[0]
  return ID_SHAPE.test(id) ? id : null
}

export function groupIdFromText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const hash = trimmed.indexOf('#')
  const tail = hash >= 0 ? trimmed.slice(hash + 1) : trimmed
  const id = tail.replace(/^\/?g\//, '').split(/[?&/]/)[0]
  return ID_SHAPE.test(id) ? id : null
}

export function setGroupHash(id: string): void {
  location.hash = id
}

export function groupLink(id: string): string {
  return `${location.origin}${location.pathname}#${id}`
}

// ---------------------------------------------------------------------------
// The last group, and the last thing we saw of it
// ---------------------------------------------------------------------------

// An installed copy launches at start_url, and start_url cannot carry a hash:
// the manifest is one static file shared by everybody, while the group is per
// person. So a home screen launch always arrives with an empty hash, App reads
// that as "no group", and the person who installed this because they have a
// creature is asked to start a brand new one. Every launch, forever. These two
// keys are what close that, and they are the only reason either exists.
const GROUP_KEY = 'monstertime.group'
const SNAPSHOT_KEY = 'monstertime.snapshot'
/** Every group this browser has been in, newest first, so somebody can move
 *  between the creatures they are part of instead of hunting for links. */
const KNOWN_KEY = 'monstertime.known'

// How long the snapshot write waits for the log to stop moving. Actions arrive
// in bursts when a group is together, and the log is the whole creature, so
// this coalesces a flurry into one write rather than serialising a few hundred
// KB per button press.
const SAVE_DELAY_MS = 2000

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function dropKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to do about it, and nothing depends on it having worked.
  }
}

/** One group this browser has been in, for the list you switch between. */
export interface KnownGroup {
  id: string
  /** What the group calls itself, if it has picked a name. */
  handle: string | null
  /** The creature's name, if it has one. */
  name: string | null
  seenAt: number
}

/** How many groups are kept. Far more than anybody is really in at once, and
 *  bounded so a browser that has opened a hundred links does not carry them. */
const KNOWN_MAX = 12

export function knownGroups(): KnownGroup[] {
  const raw = readKey(KNOWN_KEY)
  if (raw === null) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((g): g is KnownGroup => {
        const o = g as Partial<KnownGroup>
        return typeof o.id === 'string' && ID_SHAPE.test(o.id) && typeof o.seenAt === 'number'
      })
      .sort((a, b) => b.seenAt - a.seenAt)
  } catch {
    return []
  }
}

/**
 * Note that this browser is in a group, and what it was called when we looked.
 *
 * Newest first, and the entry is REPLACED rather than merged, so a group that
 * has been renamed does not keep answering to the name it had last month.
 */
export function rememberGroup(id: string, handle: string | null = null, name: string | null = null): void {
  try {
    localStorage.setItem(GROUP_KEY, id)
    const rest = knownGroups().filter((g) => g.id !== id)
    const next = [{ id, handle, name, seenAt: Date.now() }, ...rest].slice(0, KNOWN_MAX)
    localStorage.setItem(KNOWN_KEY, JSON.stringify(next))
  } catch {
    // Private mode. The person still plays, the install just opens cold.
  }
}

/**
 * Deliberately leaving a group. Both keys go, because the cached snapshot is
 * the last thing we saw of exactly the group being left, and keeping it would
 * mean a later launch could paint a creature the person walked away from.
 */
export function forgetGroup(): void {
  // The current pointer and its cached creature go. The list of groups this
  // browser has been in does NOT: walking away from one creature is not a
  // reason to lose the way back to the others.
  const leaving = readKey(GROUP_KEY)
  dropKey(GROUP_KEY)
  dropKey(SNAPSHOT_KEY)
  if (leaving === null) return
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(knownGroups().filter((g) => g.id !== leaving)))
  } catch {
    // Nothing depends on this having worked.
  }
}

/**
 * Called once, before the first render, from main.tsx.
 *
 * Restores in a browser tab as well as an installed launch. It was installed
 * only to begin with, because the empty-hash screen is the one route to the
 * front door and restoring over it would take that away. That was the wrong
 * trade: closing the tab and coming back is the ordinary thing people do, and
 * it meant going to find a link in a chat thread from weeks ago to see your own
 * creature. The front door is reachable now whether or not the hash is empty,
 * from the control on the group panel, so there is nothing left to protect.
 */
export function restoreGroupOnLaunch(): void {
  if (readGroupIdFromHash() !== null) return
  const id = readKey(GROUP_KEY)
  if (id === null || !ID_SHAPE.test(id)) return
  // replaceState, not `location.hash = id`: this should look like where the
  // launch landed rather than a navigation somebody made, so there must be no
  // empty-hash entry sitting behind it for Back to fall into. It also fires no
  // hashchange, which is fine because nothing has subscribed or rendered yet.
  history.replaceState(null, '', `#${id}`)
}

export interface CachedSnapshot {
  savedAt: number
  snapshot: GroupSnapshot
}

/**
 * The last snapshot seen for this group, or null. Exactly one is kept, with
 * its own groupId inside it rather than in the key, so opening a second group
 * replaces the cache instead of accumulating one full action log per group
 * this browser has ever visited.
 */
export function readCachedSnapshot(groupId: string): CachedSnapshot | null {
  const raw = readKey(SNAPSHOT_KEY)
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CachedSnapshot>
    if (typeof parsed.savedAt !== 'number') return null
    const snapshot = parsed.snapshot
    if (!snapshot || snapshot.groupId !== groupId) return null
    if (!snapshot.genome || !Array.isArray(snapshot.actions)) return null
    return { savedAt: parsed.savedAt, snapshot }
  } catch {
    return null
  }
}

let cacheRefused = false

function writeCachedSnapshot(snapshot: GroupSnapshot, savedAt: number): void {
  if (cacheRefused) return
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt, snapshot }))
  } catch {
    // A creature at its lifetime cap is a few hundred KB, out of a budget this
    // origin shares with every other app on tevded.com. If it will not fit,
    // drop it and stop trying: half a log is not a smaller creature, it is a
    // different one, and showing that would be worse than showing nothing.
    cacheRefused = true
    dropKey(SNAPSHOT_KEY)
  }
}

function subscribeHash(fn: () => void): () => void {
  addEventListener('hashchange', fn)
  return () => removeEventListener('hashchange', fn)
}

export function useGroupId(): string | null {
  return useSyncExternalStore(subscribeHash, readGroupIdFromHash, () => null)
}

// ---------------------------------------------------------------------------
// The local name
// ---------------------------------------------------------------------------

// net owns the actor identity, but it cannot tell us whether a person has ever
// actually chosen a name or is carrying a generated one. That distinction is
// what decides whether somebody arriving on a shared link sees the creature or
// gets asked who they are first, so the flag is tracked here.
const NAME_FLAG = 'monstertime.named'

function readFlag(): boolean {
  try {
    return localStorage.getItem(NAME_FLAG) === '1'
  } catch {
    return false
  }
}

let named = readFlag()
const nameListeners = new Set<() => void>()

function subscribeNamed(fn: () => void): () => void {
  nameListeners.add(fn)
  return () => {
    nameListeners.delete(fn)
  }
}

export function hasLocalName(): boolean {
  return named
}

export function useNamed(): boolean {
  return useSyncExternalStore(subscribeNamed, hasLocalName, () => false)
}

export function commitLocalName(name: string): void {
  setLocalName(name)
  try {
    localStorage.setItem(NAME_FLAG, '1')
  } catch {
    // A person in private mode still gets to play, they just get asked again.
  }
  named = true
  for (const fn of nameListeners) fn()
}

// ---------------------------------------------------------------------------
// Whether it is asleep
// ---------------------------------------------------------------------------
//
// Nothing below works out when a creature sleeps. sleepStateOf in src/dna is the
// only thing in the app that decides that, the Durable Object calls the same
// copy of it to refuse an action, and everything here is the plumbing that gets
// a genome, a createdAt and an instant to it. If a second answer to "is it
// asleep" ever appears in this file it is a bug, not an optimisation: two people
// in one group being told different things about the same animal is the worst
// failure this app has, and one function called twice is how it is prevented.
//
// A module store rather than a prop, for the reason the local name above is one:
// the two components that have to know (the action bar and the stage) sit
// several levels under the one component that holds the snapshot, and threading
// it through would put the answer in the hands of whichever screen forgot to
// pass it on.

/**
 * The sleep state, and the instant it was worked out for.
 *
 * `now` rides along because every caller that says anything out loud about sleep
 * needs the gap between now and `until`, and reading a clock again at the call
 * site would be reading a DIFFERENT clock: the one below has the server's
 * correction applied and Date.now() has not.
 */
export interface SleepReading extends SleepState {
  now: number
}

interface SleepSource {
  genome: Genome
  createdAt: number
}

let sleepSource: SleepSource | null = null

// The log, kept apart from the source above and updated on its own, which is
// the whole reason it is a second variable. The source is republished only when
// the genome or the birthday changes, deliberately, so that a fresh snapshot
// per action does not throw the server's last refusal away several times an
// evening. But the log DOES change on every action, and one of those actions is
// somebody waking the creature, so folding it into the source would trade the
// bug this fixes for the bug that keying was written to avoid.
let sleepLog: ReadonlyArray<{ variantId: string; at: number }> = []
let reading: SleepReading | null = null
const sleepListeners = new Set<() => void>()

// How far this device's clock is from the server's, in milliseconds, learned
// from the one message that carries both readings at once. A phone whose clock
// is ten minutes fast would otherwise count down to a waking that has not
// happened, tap, and be refused by a server that never agreed with it. The
// correction is kept for the session and not persisted: it is a fact about this
// device right now, and a stale one written last week would be worse than none.
let clockSkew = 0

// The last refusal the server sent, believed until it runs out.
//
// Belt as well as braces, and the braces are the shared function. If the two
// ever disagree anyway the server is right by definition (it is the one that
// decides whether an action happens), and the person in front of the screen is
// the one who pays for the disagreement: they tap, nothing happens, and there is
// nothing on screen that could tell them why. Adopting the server's own answer
// verbatim is not a second implementation of sleep, it is refusing to argue with
// the only implementation that counts.
let refusal: { since: number; until: number } | null = null

function serverNow(): number {
  return Date.now() + clockSkew
}

function recompute(): void {
  const source = sleepSource
  const now = serverNow()
  // The waking is worked out here rather than tracked, for the same reason the
  // server works it out rather than storing it: it is already in the log, and a
  // second record of it is a second thing that can be wrong. Both sides call
  // lastRouseAt and both hand the answer to the same sleepStateOf, which is what
  // stops the app drawing a sleeping animal that the server would happily let
  // anybody feed. Not hypothetical: that is exactly what this did while the
  // rouse lived in the worker and nothing on this side knew the word existed.
  const rousedAt = lastRouseAt(sleepLog, now, allowedWhileAsleep)
  let next: SleepReading | null =
    source === null
      ? null
      : { ...sleepStateOf(source.genome, source.createdAt, now, rousedAt), now }

  if (refusal !== null && now >= refusal.until) refusal = null
  // A waking retires the refusal that came before it. The server refuses with
  // the whole night as the window, so without this the one thing a group is
  // allowed to do would succeed and then be overruled on screen by a message
  // sent before they did it, which reads as the wake button doing nothing at
  // all. The server cannot disagree here: it only accepts a waking while it is
  // down, and having accepted one it is up for ROUSE_MS.
  if (refusal !== null && rousedAt > 0 && now < rousedAt + ROUSE_MS) refusal = null
  if (next !== null && refusal !== null) next = { asleep: true, since: refusal.since, until: refusal.until, now }

  // Awake, and nothing about the answer moved: say nothing. A tick that
  // re-rendered the action bar every half minute for the eleven hours a creature
  // is up would be a phone warmed by a countdown nobody is looking at. While it
  // IS asleep every tick counts, because the sentence on screen is a countdown.
  const moved =
    next === null || reading === null
      ? next !== reading
      : next.asleep ||
        next.asleep !== reading.asleep ||
        next.since !== reading.since ||
        next.until !== reading.until

  reading = next
  if (!moved) return
  for (const fn of [...sleepListeners]) fn()
}

// How often the answer is re-checked while anybody is watching. The timer is
// always set to the earlier of this and the moment the state actually changes,
// so the flip from awake to asleep lands on the second it happens rather than up
// to half a minute late, which is what somebody with the tray open would
// otherwise see: a tray full of things that have quietly stopped working.
const RECHECK_MS = 30_000
const MIN_RECHECK_MS = 1000

let clockTimer: number | null = null

function schedule(): void {
  const gap = reading === null ? RECHECK_MS : reading.until - serverNow()
  clockTimer = window.setTimeout(tick, Math.min(RECHECK_MS, Math.max(MIN_RECHECK_MS, gap)))
}

function tick(): void {
  recompute()
  schedule()
}

// A phone throttles timers in a background tab and stops them outright when the
// screen is off, so coming back to the app is the moment the answer on screen is
// most likely to be hours stale. This is the same reason the snapshot write
// listens for visibilitychange further up.
function onVisible(): void {
  if (document.visibilityState === 'visible') recompute()
}

function startClock(): void {
  if (clockTimer !== null) return
  // Worked out once on the way in rather than waiting out the first interval.
  // The clock stops when the last screen that cares unmounts, so what is held
  // here on the way back is the answer from whenever that was, and a screen
  // reopened the next morning would spend half a minute showing an animal that
  // was asleep last night. Notifying from inside subscribe is the case
  // useSyncExternalStore exists to handle.
  recompute()
  schedule()
  document.addEventListener('visibilitychange', onVisible)
}

function stopClock(): void {
  if (clockTimer !== null) window.clearTimeout(clockTimer)
  clockTimer = null
  document.removeEventListener('visibilitychange', onVisible)
}

function subscribeSleep(fn: () => void): () => void {
  sleepListeners.add(fn)
  if (sleepListeners.size === 1) startClock()
  return () => {
    sleepListeners.delete(fn)
    if (sleepListeners.size === 0) stopClock()
  }
}

function readSleep(): SleepReading | null {
  return reading
}

/** Which creature the clock is being kept for. Null when there is no animal on
 *  screen at all, which is the one state where the honest answer is "we do not
 *  know" rather than "it is awake". */
/** The log the waking is read out of. Separate from the source on purpose: this
 *  changes on every action and must not take the refusal down with it. */
function publishSleepLog(actions: ReadonlyArray<{ variantId: string; at: number }>): void {
  sleepLog = actions
  recompute()
}

function publishSleepSource(next: SleepSource | null): void {
  // A snapshot restored from localStorage can have been written before sleep
  // existed, and its genome then has no activity pattern at all whatever the
  // type says: sleepState would go looking for a row of windows that is not
  // there. That snapshot is only ever on screen when there is no signal, which
  // is the launch least able to afford a crash, so an unreadable pattern means
  // the app says nothing about sleep at all until the live one lands. Nothing is
  // lost by that: it is how every screen behaved before sleep was added.
  const known = next !== null && (ACTIVITY_PATTERNS as readonly string[]).includes(next.genome.activity)
  sleepSource = known ? next : null
  if (!known) sleepLog = []
  // A different creature is a different timetable, and a refusal is about the
  // one that just refused. Carrying it across would put a fresh group's animal
  // to sleep on the strength of the last one's.
  refusal = null
  recompute()
}

/**
 * What the server said when it turned an action away.
 *
 * Two separate things arrive in one message and both are used. `now` is the
 * server's own clock, which is the only chance this device gets to find out how
 * far out its own is. `since` and `until` are the answer itself, kept because
 * the alternative to believing it is arguing with it.
 *
 * Each field is checked on its own rather than the message as a whole, so a
 * server that one day sends a correction without a window, or the other way
 * round, gives up whichever half it did send instead of neither.
 */
function noteRefusal(refused: { since: number; until: number; now: number }): void {
  if (Number.isFinite(refused.now)) clockSkew = refused.now - Date.now()
  if (Number.isFinite(refused.since) && Number.isFinite(refused.until)) {
    refusal = { since: refused.since, until: refused.until }
  }
  recompute()
}

/**
 * Is the creature asleep, as of the last time anybody looked.
 *
 * Null before a snapshot has arrived. Callers must read that as unknown and not
 * as awake, though in practice there is nothing on screen to act on yet either.
 */
export function useSleep(): SleepReading | null {
  return useSyncExternalStore(subscribeSleep, readSleep, () => null)
}

// ---------------------------------------------------------------------------
// The group
// ---------------------------------------------------------------------------

export interface GroupHandle {
  groupId: string | null
  actor: { id: string; name: string }
  status: ConnectionStatus
  snapshot: GroupSnapshot | null
  present: PresentActor[]
  creature: Creature | null
  genome: Genome | null
  // True once a snapshot has arrived at least once. A failure before that is a
  // bad link, a failure after it is a dropped socket, and the two need very
  // different words on screen.
  everConnected: boolean
  // True when the creature on screen was derived from the stored snapshot
  // because the live one has not arrived. The animal is real and is the
  // group's own, it is just as of `cachedAt` rather than as of now.
  offline: boolean
  cachedAt: number | null
  act: (variantId: string, methodId?: string) => void
  rename: (name: string) => void
  setPace: (pace: number) => void
  /** Ask for a code that says which member this is. */
  claim: () => void
  /** The code, for as long as it is on screen. Held in memory only and never
   *  put back after a reload: the server cannot reissue it, so a page that
   *  could show it again would be lying about how many copies exist. */
  freshCode: { actorId: string; code: string } | null
  /** True once this person has a code, whether or not it was minted just now. */
  claimed: boolean
  /** How fast this group has asked the creature to live. */
  pace: number
}

const NO_ONE: PresentActor[] = []

export function useGroup(): GroupHandle {
  const groupId = useGroupId()
  const isNamed = useNamed()
  const actor = useMemo(() => localActor(), [isNamed])

  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(null)
  const [present, setPresent] = useState<PresentActor[]>(NO_ONE)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [everConnected, setEverConnected] = useState(false)
  const [freshCode, setFreshCode] = useState<{ actorId: string; code: string } | null>(null)
  const conn = useRef<Connection | null>(null)

  useEffect(() => {
    if (!groupId || !isNamed) return
    setSnapshot(null)
    setPresent(NO_ONE)
    setStatus('connecting')
    setEverConnected(false)

    const c = connect(groupId, actor, codeFor(groupId))
    conn.current = c
    const offClaimed = c.onClaimed((next) => {
      // Kept before it is shown, so a tab closed in the two seconds between the
      // two does not lose a code that can never be reissued.
      keepCode(groupId, next.code)
      setFreshCode(next)
    })
    const offSnapshot = c.subscribe((next, who) => {
      setSnapshot(next)
      setPresent(who)
      setEverConnected(true)
    })
    const offStatus = c.onStatus(setStatus)
    // The refusal is not routed through React state on purpose. Nothing renders
    // this message: it corrects the clock the sleep store is already keeping, and
    // every screen that says anything about sleep is reading that store.
    const offAsleep = c.onAsleep(noteRefusal)

    return () => {
      offSnapshot()
      offStatus()
      offClaimed()
      offAsleep()
      c.close()
      conn.current = null
    }
  }, [groupId, isNamed, actor])

  // Read synchronously on the very first render rather than in an effect, so a
  // launch with no signal paints the animal immediately instead of painting a
  // spinner, waiting out the patience timer and then admitting failure.
  const cached = useMemo(() => (groupId ? readCachedSnapshot(groupId) : null), [groupId])

  // The live snapshot always wins. The cache is only ever a stand-in for one
  // that has not arrived, never merged with one that has: the log is ordered
  // and the order is the creature, so there is nothing sensible to merge.
  const shown = snapshot ?? (cached ? cached.snapshot : null)
  const offline = snapshot === null && cached !== null

  // Once the group has actually answered, this id is worth reopening. Written
  // on everConnected rather than on the id resolving, so a mistyped or dead
  // link never becomes the thing every future launch opens.
  const knownHandle = shown ? shown.handle : null
  const knownName = shown ? shown.name : null
  useEffect(() => {
    if (groupId && everConnected) rememberGroup(groupId, knownHandle, knownName)
  }, [groupId, everConnected, knownHandle, knownName])

  // Keeping the log is what makes an installed copy worth opening with no
  // signal at all.
  useEffect(() => {
    if (!snapshot) return
    const save = (): void => writeCachedSnapshot(snapshot, Date.now())
    const timer = window.setTimeout(save, SAVE_DELAY_MS)
    // A phone is not always given time to run a timer before the tab goes
    // away, and pagehide is the last moment storage is still reliable.
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') save()
    }
    addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.clearTimeout(timer)
      removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [snapshot])

  // The clock every screen reads sleep off. Keyed on the three things sleep is
  // a function of rather than on the snapshot, because a fresh snapshot object
  // arrives on every action while the genome inside it is the same genome:
  // republishing per action would throw the server's last refusal away several
  // times an evening over a change that never happened.
  const clockGenome = shown ? shown.genome : null
  const clockSeed = clockGenome ? clockGenome.seed : null
  const clockActivity = clockGenome ? clockGenome.activity : null
  const bornAt = shown ? shown.createdAt : 0
  useEffect(() => {
    publishSleepSource(clockGenome === null ? null : { genome: clockGenome, createdAt: bornAt })
  }, [clockSeed, clockActivity, bornAt])

  // The log goes over separately from the genome above, and the split is the
  // point rather than an accident of where the code sits. The genome is keyed
  // narrowly so a fresh snapshot per action does not throw the server's last
  // refusal away several times an evening; the log has to arrive on every
  // action, because one of those actions is somebody waking the creature.
  // Watched on the count as well as the object, since net may hand back a new
  // snapshot per message or push onto the array it already gave us.
  const clockActions = shown ? shown.actions : null
  useEffect(() => {
    publishSleepLog(clockActions ?? [])
  }, [clockActions, clockActions === null ? 0 : clockActions.length])

  // Derivation is the expensive call in the app. Both the snapshot identity and
  // the action count are watched because net may hand back a fresh object per
  // message or push onto the array it already gave us, and either way a rebuild
  // must happen exactly once per real change.
  const actionCount = shown ? shown.actions.length : -1
  const givenName = shown ? shown.name : null
  // Growth is watched as well, because it moves without the log moving: hours
  // pass, the server sends a fresh snapshot, and the creature is older with the
  // same number of actions behind it.
  const grown = shown ? shown.growth : 0
  const creature = useMemo(
    () => (shown ? deriveCreature(shown.genome, shown.actions, shown.name, shown.growth) : null),
    [shown, actionCount, givenName, grown],
  )

  const act = useCallback((variantId: string, methodId?: string) => {
    conn.current?.act(variantId, methodId)
  }, [])

  const claim = useCallback(() => {
    conn.current?.claim()
  }, [])

  const setPace = useCallback((pace: number) => {
    conn.current?.setPace(pace)
  }, [])

  const rename = useCallback((name: string) => {
    conn.current?.rename(name)
  }, [])

  return {
    groupId,
    actor,
    status,
    snapshot: shown,
    present,
    creature,
    genome: shown ? shown.genome : null,
    everConnected,
    offline,
    cachedAt: cached ? cached.savedAt : null,
    act,
    rename,
    setPace,
    claim,
    freshCode,
    claimed: groupId !== null && codeFor(groupId) !== null,
    pace: shown ? shown.pace : 1,
  }
}

// ---------------------------------------------------------------------------
// Small shared hooks
// ---------------------------------------------------------------------------

export function useCopy(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = useCallback((text: string) => {
    const done = () => {
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    }
    // On a phone the share sheet is the thing people expect and it puts the
    // link into whichever chat the group already lives in, which is the whole
    // point. On a pointer device it is a needless dialog, so copy instead.
    const sheet = typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches
    if (sheet) {
      navigator.share({ text }).then(done, () => undefined)
      return
    }
    navigator.clipboard?.writeText(text).then(done, () => undefined)
  }, [])

  return { copied, copy }
}

export function useMediaQuery(query: string): boolean {
  const mql = useMemo(() => matchMedia(query), [query])
  return useSyncExternalStore(
    (fn) => {
      mql.addEventListener('change', fn)
      return () => mql.removeEventListener('change', fn)
    },
    () => mql.matches,
    () => false,
  )
}
