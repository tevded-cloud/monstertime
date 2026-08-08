// identity.ts: who is acting from this browser.
//
// MonsterTime has no accounts, and it should not grow any by accident. The
// only durable fact worth keeping about a person is a random id, so their
// actions credit consistently across visits, and a name they chose, so the
// rest of the group can read who did what. Nothing else about them is
// collected, because nothing else is used anywhere in the derivation.

const STORAGE_KEY = 'monstertime.actor'
const MAX_NAME_LENGTH = 24
const DEFAULT_NAME = 'Friend'

interface StoredActor {
  id: string
  name: string
}

// Trimmed and length-capped before it ever leaves this module, so callers
// (connection.ts, the UI) never have to re-sanitise a name themselves and a
// stray blank string never becomes what gets sent to the server.
function sanitiseName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
  return trimmed.length > 0 ? trimmed : DEFAULT_NAME
}

function readStored(): StoredActor | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage can be unreachable entirely (private browsing in some
    // browsers throws on access, not just on write). Treat that the same
    // as "nothing stored" rather than letting it take the app down.
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredActor>
    if (typeof parsed.id !== 'string' || parsed.id.length === 0) return null
    if (typeof parsed.name !== 'string') return null
    return { id: parsed.id, name: sanitiseName(parsed.name) }
  } catch {
    // A corrupt or foreign value under this key is not our problem to
    // diagnose: mint a fresh actor and move on.
    return null
  }
}

function writeStored(actor: StoredActor): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actor))
  } catch {
    // Quota exceeded or storage disabled: the actor still works for the
    // life of this tab, it just will not survive a reload. Not fatal.
  }
}

// Lazily created and cached for the lifetime of the page, so repeated calls
// to localActor() do not re-read and re-parse localStorage on every use.
let cached: StoredActor | null = null

function ensureActor(): StoredActor {
  if (cached) return cached
  const stored = readStored()
  if (stored) {
    cached = stored
    return cached
  }
  const fresh: StoredActor = { id: crypto.randomUUID(), name: DEFAULT_NAME }
  writeStored(fresh)
  cached = fresh
  return fresh
}

export function localActor(): { id: string; name: string } {
  const actor = ensureActor()
  return { id: actor.id, name: actor.name }
}

export function setLocalName(name: string): void {
  const actor = ensureActor()
  actor.name = sanitiseName(name)
  writeStored(actor)
}
