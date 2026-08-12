// ActionBar.tsx: the six things a person can do, and the tree under each.
//
// The variants show their blurb and nothing else. No pressures, no numbers, no
// hint of what a choice pushes toward, because the moment somebody can read the
// mechanics off a button they start optimising, and an optimised creature is
// the same creature every group gets. Instinct is the input this app wants.
//
// Three levels, and the middle one is deliberately not a gate. Shelves sit as a
// row of chips inside the tray rather than as a screen you have to pass
// through, so reaching a thing you already know you want is one tap and not
// two. The level is there for browsing, which is what a category is actually
// for; making it a checkpoint would only tax people who already knew.
//
// The manner is the last step and it is also the commit. Choosing the item does
// not do anything yet, so nobody spends a tap on a decision they did not want
// to make: the tap that used to submit is now the tap that says how. "No
// particular way" is a real answer sitting alongside the rest, and it writes no
// manner at all rather than a neutral one.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { ACTION_KINDS } from '../core/types'
import type { ActionKind, ActionVariant, Creature } from '../core/types'
import { availableVariants, methodsForKind } from '../dna'

// Long enough that one person cannot walk a creature to adulthood on their own
// in an afternoon, short enough that it never becomes the thing you are waiting
// on. It is framed everywhere as the creature's attention, which is what it
// actually is: the animal has just had something happen to it.
const COOLDOWN_MS = 45_000

const KIND_LABEL: Record<ActionKind, string> = {
  feed: 'Feed',
  train: 'Work',
  explore: 'Roam',
  sing: 'Sing',
  give: 'Give',
  tend: 'Tend',
}

const SETTLE: Record<ActionKind, string> = {
  feed: 'It is still eating.',
  train: 'It is getting its breath back.',
  explore: 'It is still looking around.',
  sing: 'It is listening.',
  give: 'It is turning that over.',
  tend: 'It has gone quiet for a bit.',
}

interface ActionBarProps {
  creature: Creature | null
  actorId: string
  live: boolean
  onAct: (variantId: string, methodId?: string) => void
}

export default function ActionBar({ creature, actorId, live, onAct }: ActionBarProps): JSX.Element {
  const [open, setOpen] = useState<ActionKind | null>(null)
  const [shelf, setShelf] = useState<string | null>(null)
  const [picked, setPicked] = useState<ActionVariant | null>(null)
  const [localAt, setLocalAt] = useState(0)
  const [lastKind, setLastKind] = useState<ActionKind | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const root = useRef<HTMLDivElement | null>(null)

  // The cooldown is anchored to the server's timestamp for this person's last
  // action, so reloading the page does not hand anybody a fresh turn. The local
  // stamp only covers the gap before that action echoes back.
  const bond = creature ? creature.bonds[actorId] : undefined
  const since = Math.max(bond ? bond.lastAt : 0, localAt)
  const remaining = since ? Math.max(0, Math.min(COOLDOWN_MS, since + COOLDOWN_MS - now)) : 0
  const cooling = remaining > 0

  useEffect(() => {
    setNow(Date.now())
  }, [since])

  useEffect(() => {
    if (!cooling) return
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [cooling])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) shut()
    }
    const onKey = (e: KeyboardEvent) => {
      // Escape steps back one level rather than closing outright, because
      // landing on the manner question and wanting a different item is the
      // likeliest thing to happen in here.
      if (e.key !== 'Escape') return
      if (picked !== null) setPicked(null)
      else shut()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, picked])

  const stage = creature ? creature.stage : 0
  const byKind = useMemo(() => {
    const grouped = new Map<ActionKind, ActionVariant[]>()
    for (const kind of ACTION_KINDS) grouped.set(kind, [])
    for (const variant of availableVariants(stage)) grouped.get(variant.kind)?.push(variant)
    return grouped
  }, [stage])

  function shut(): void {
    setOpen(null)
    setShelf(null)
    setPicked(null)
  }

  /** Committed here and only here, whichever way somebody arrived. */
  function commit(variant: ActionVariant, methodId?: string): void {
    onAct(variant.id, methodId)
    setLocalAt(Date.now())
    setLastKind(variant.kind)
    shut()
  }

  const note = !live
    ? 'Not connected to it right now.'
    : cooling
      ? lastKind
        ? SETTLE[lastKind]
        : 'It needs a moment.'
      : creature && creature.actionCount === 0
        ? 'Nothing has happened to it yet.'
        : ''

  const inKind = open ? (byKind.get(open) ?? []) : []
  // Only shelves with something on them at this stage. An egg cannot be fed, so
  // showing it an empty "caught" shelf would be advertising a locked door.
  const shelves = useMemo(() => {
    const seen: string[] = []
    for (const variant of inKind) if (!seen.includes(variant.category)) seen.push(variant.category)
    return seen
  }, [inKind])
  const onShelf = shelf !== null && shelves.includes(shelf) ? shelf : (shelves[0] ?? null)
  const shown = inKind.filter((variant) => variant.category === onShelf)

  return (
    <div className="actionbar" ref={root}>
      {open && (
        <div className="tray" id={`tray-${open}`} role="group" aria-label={`${KIND_LABEL[open]} options`}>
          {picked === null ? (
            <>
              <div className="tray-head">
                <span className="label">{KIND_LABEL[open]}</span>
              </div>
              {shelves.length > 1 && (
                <div className="shelves" role="tablist" aria-label="Kinds of thing">
                  {shelves.map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="tab"
                      className="shelf"
                      aria-selected={name === onShelf}
                      onClick={() => setShelf(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <div className="variants">
                {shown.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    className="variant"
                    disabled={cooling || !live}
                    onClick={() => setPicked(variant)}
                  >
                    <strong>{variant.label}</strong>
                    <em>{variant.blurb}</em>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="tray-head">
                <button type="button" className="back" onClick={() => setPicked(null)}>
                  <span aria-hidden="true">‹</span> {picked.label}
                </button>
              </div>
              <div className="variants manners">
                {methodsForKind(picked.kind).map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    className="variant manner"
                    disabled={cooling || !live}
                    onClick={() => commit(picked, method.id)}
                  >
                    <strong>{method.label}</strong>
                  </button>
                ))}
                <button
                  type="button"
                  className="variant manner plain"
                  disabled={cooling || !live}
                  onClick={() => commit(picked)}
                >
                  <strong>no particular way</strong>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="cooldown" aria-hidden="true">
        <i style={{ transform: `scaleX(${remaining / COOLDOWN_MS})` }} />
      </div>

      <p className="settle" aria-live="polite">
        {note}
      </p>

      <div className="kinds">
        {ACTION_KINDS.map((kind) => {
          const count = (byKind.get(kind) ?? []).length
          return (
            <button
              key={kind}
              type="button"
              className="kind"
              disabled={count === 0}
              aria-expanded={open === kind}
              aria-controls={open === kind ? `tray-${kind}` : undefined}
              onClick={() => (open === kind ? shut() : (setOpen(kind), setShelf(null), setPicked(null)))}
            >
              <KindIcon kind={kind} />
              <span>{KIND_LABEL[kind]}</span>
              {count === 0 && <span className="sr">too young for this yet</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Drawn, not typed. Six marks at one weight so the row reads as one control.
function KindIcon({ kind }: { kind: ActionKind }): JSX.Element {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 20 20',
    fill: 'none',
    'aria-hidden': true,
  } as const
  const stroke = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

  switch (kind) {
    case 'feed':
      return (
        <svg {...common}>
          <g {...stroke}>
            <circle cx="10" cy="12.4" r="5.4" />
            <path d="M10 7V4.2" />
            <path d="M10 5.2c1.5-2.2 3.5-2.2 4.4-1.7C14 5.6 12 6.4 10 5.2Z" />
          </g>
        </svg>
      )
    case 'train':
      return (
        <svg {...common}>
          <g {...stroke}>
            <path d="M4.6 10h10.8" />
            <path d="M6.2 6.8v6.4" />
            <path d="M13.8 6.8v6.4" />
            <path d="M3.2 8.4v3.2" />
            <path d="M16.8 8.4v3.2" />
          </g>
        </svg>
      )
    case 'explore':
      return (
        <svg {...common}>
          <g {...stroke}>
            <circle cx="10" cy="10" r="6.6" />
            <path d="M12.9 7.1 8.7 8.7 7.1 12.9l4.2-1.6Z" />
          </g>
        </svg>
      )
    case 'sing':
      return (
        <svg {...common}>
          <g {...stroke}>
            <path d="M5.6 8.2v3.6" />
            <path d="M8.6 5.8v8.4" />
            <path d="M11.8 7.9a3.4 3.4 0 0 1 0 4.2" />
            <path d="M14.5 5.7a7 7 0 0 1 0 8.6" />
          </g>
        </svg>
      )
    case 'give':
      return (
        <svg {...common}>
          <g {...stroke}>
            <rect x="4.4" y="7.6" width="11.2" height="8.2" rx="1.2" />
            <path d="M4.4 10.6h11.2" />
            <path d="M10 7.6v8.2" />
            <path d="M10 7.6 8.1 5.1" />
            <path d="m10 7.6 1.9-2.5" />
          </g>
        </svg>
      )
    case 'tend':
      return (
        <svg {...common}>
          <g {...stroke}>
            <path d="M4.4 11.2a5.6 5.6 0 0 0 11.2 0" />
            <path d="M7.4 7.8V5.2" />
            <path d="M10 7.2V4.2" />
            <path d="M12.6 7.8V5.2" />
          </g>
        </svg>
      )
    default:
      return <svg {...common} />
  }
}
