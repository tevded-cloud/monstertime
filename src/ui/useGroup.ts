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

  // Derivation is the expensive call in the app. Both the snapshot identity and
  // the action count are watched because net may hand back a fresh object per
  // message or push onto the array it already gave us, and either way a rebuild
  // must happen exactly once per real change.
  const actionCount = snapshot ? snapshot.actions.length : -1
  const givenName = snapshot ? snapshot.name : null
  const creature = useMemo(
    () => (snapshot ? deriveCreature(snapshot.genome, snapshot.actions, snapshot.name) : null),
    [snapshot, actionCount, givenName],
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
    snapshot,
    present,
    creature,
    genome: snapshot ? snapshot.genome : null,
    everConnected,
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
