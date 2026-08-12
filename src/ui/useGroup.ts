// useGroup.ts: the only place the UI touches the network or the derivation.
//
// Everything below the interface is pure: the components take a Creature and
// render it. That split matters because the creature is derived on every
// message, and if derivation were scattered through components we would end up
// rebuilding the animal several times per frame for no reason.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Creature, Genome, GroupSnapshot, PresentActor } from '../core/types'
import { deriveCreature } from '../dna'
import { connect, localActor, setLocalName } from '../net'
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
  act: (variantId: string) => void
  rename: (name: string) => void
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
  const conn = useRef<Connection | null>(null)

  useEffect(() => {
    if (!groupId || !isNamed) return
    setSnapshot(null)
    setPresent(NO_ONE)
    setStatus('connecting')
    setEverConnected(false)

    const c = connect(groupId, actor)
    conn.current = c
    const offSnapshot = c.subscribe((next, who) => {
      setSnapshot(next)
      setPresent(who)
      setEverConnected(true)
    })
    const offStatus = c.onStatus(setStatus)

    return () => {
      offSnapshot()
      offStatus()
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

  const act = useCallback((variantId: string) => {
    conn.current?.act(variantId)
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
