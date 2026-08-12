// Stage.tsx: the creature, and the smallest amount of chrome that can sit on
// top of it without competing. Everything here is either the animal, the one
// thing you need to know about it right now, or the link that brings somebody
// else in.

import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { ActionKind, ActionRecord, Creature, Genome, PresentActor } from '../core/types'
import { pastTense, variantById } from '../dna'
import { CreatureView } from '../forge'
import type { ConnectionStatus } from '../net'
import { groupLink, useCopy } from './useGroup'

const KIND_VERB: Record<ActionKind, string> = {
  feed: 'fed it',
  train: 'worked it',
  explore: 'took it out',
  sing: 'sang to it',
  give: 'gave it something',
  tend: 'tended to it',
}

interface StageProps {
  creature: Creature | null
  genome: Genome | null
  actions: ActionRecord[]
  present: PresentActor[]
  status: ConnectionStatus
  // The socket is gone but we still have an animal on screen. Blanking it
  // would be a lie in the other direction: the creature did not stop existing.
  stale: boolean
  // When the creature on screen is the stored one and the socket never opened:
  // the moment it was last seen, or null when this is the live animal. Distinct
  // from `stale`, which is a group we did reach and then lost.
  offlineSince: number | null
  groupId: string
  actorId: string
  // Renames the CREATURE, not the caller. The person's own display name is a
  // separate identity (set at join time) and must never be overwritten by this.
  onRename: (creatureName: string) => void
  // Which side panel to open, on a phone where they are a sheet rather than a
  // rail. Null on a desktop, where both are always on screen in the rail.
  onOpenPanel: ((panel: 'group' | 'chronicle') => void) | null
}

export default function Stage(props: StageProps): JSX.Element {
  const { creature, genome, actions, present, status, stale, offlineSince, groupId, actorId, onRename, onOpenPanel } =
    props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef<CreatureView | null>(null)
  const seen = useRef(-1)
  const [ticker, setTicker] = useState<{ id: string; text: string } | null>(null)

  // CreatureView already watches this exact canvas and resizes itself, which is
  // what makes an orientation change and a mobile address bar sliding away come
  // out right. A second observer here would only mean two buffer reallocations
  // and two camera reframes for every one layout change, which on a phone lands
  // during precisely the moment the layout is moving every frame.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const view = new CreatureView(canvas)
    viewRef.current = view
    return () => {
      view.dispose()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    if (creature && genome) viewRef.current?.setCreature(creature, genome)
  }, [creature, genome])

  // A new action means somebody is on the other end of this right now, which is
  // the feeling the whole app runs on. The first snapshot is skipped: replaying
  // a year of reactions on load would be noise, not presence.
  useEffect(() => {
    const count = actions.length
    if (seen.current < 0 || count <= seen.current) {
      seen.current = count
      return
    }
    seen.current = count
    const last = actions[count - 1]
    const variant = variantById(last.variantId)
    if (variant) viewRef.current?.pulse(variant.kind)
    const mine = last.actorId === actorId
    const who = mine ? 'You' : last.actorName
    // One written sentence per variant rather than a verb glued to the button
    // copy. The labels are not all the same part of speech, so gluing produced
    // "Teddy gave it something. a marrow bone."
    const said = pastTense(last.variantId, mine) ?? KIND_VERB[variant?.kind ?? 'tend']
    setTicker({ id: last.id, text: `${who} ${said}.` })
  }, [actions, actions.length, actorId])

  useEffect(() => {
    if (!ticker) return
    const t = window.setTimeout(() => setTicker(null), 4200)
    return () => window.clearTimeout(t)
  }, [ticker])

  return (
    <div className="stage">
      <canvas className="stage-canvas" ref={canvasRef} />
      <div className="frame" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="topbar">
        <div className="ident">
          <NamePlate name={creature ? creature.name : null} onRename={onRename} />
          <div className="stage-line">
            <span className="label">{creature ? creature.stageName : 'waiting'}</span>
            {/* The bar is the only place how far along this stage is says
                anything at all, so it carries the number rather than hiding
                behind aria-hidden and leaving a reader with the stage name and
                nothing else. */}
            <span
              className="meter"
              role="progressbar"
              aria-label="Growth through this stage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((creature ? creature.stageProgress : 0) * 100)}
            >
              <i style={{ transform: `scaleX(${creature ? creature.stageProgress : 0})` }} />
            </span>
          </div>
        </div>

        <div className="topbar-tools">
          <Status status={status} here={present.length} />
          <ShareButton groupId={groupId} />
          {onOpenPanel && (
            <>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onOpenPanel('chronicle')}
                aria-label="Open the chronicle"
              >
                <ChronicleIcon />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onOpenPanel('group')}
                aria-label="Open the group"
              >
                <PeopleIcon />
              </button>
            </>
          )}
        </div>
      </div>

      {stale && (
        <div className="notice" role="status">
          <span>Connection lost. This is the last thing we saw of it.</span>
          <button type="button" className="btn" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      )}

      {offlineSince !== null && !stale && (
        <div className="notice" role="status">
          <span>Offline. This is your creature {asOf(offlineSince)}.</span>
          <button type="button" className="btn" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      )}

      {/* The live region below is the screen reader's copy of this line. Without
          hiding the visible one a reader gets the same sentence twice, once
          announced and once when it walks the page. */}
      {ticker && !stale && offlineSince === null && (
        <p className="ticker" key={ticker.id} aria-hidden="true">
          {ticker.text}
        </p>
      )}
      <p className="sr" role="status" aria-live="polite">
        {ticker ? ticker.text : ''}
      </p>
    </div>
  )
}

// When the stored creature was last seen. Phrased as a point in time rather
// than a duration, because "as of this morning" is what somebody needs in order
// to know whether anything has happened since, and a bare "2h ago" reads as how
// stale the app is rather than how old the animal is.
function asOf(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (seconds < 90) return 'as of a moment ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `as of ${minutes} minutes ago`
  const sameDay = new Date(at).toDateString() === new Date().toDateString()
  const clock = new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `as of ${clock}`
  const day = new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return `as of ${day}, ${clock}`
}

// Renders and edits the CREATURE's name. This is not the visitor's own name:
// see the onRename comment on StageProps for why that distinction matters.
function NamePlate({
  name: creatureName,
  onRename,
}: {
  name: string | null
  onRename: (creatureName: string) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function commit(): void {
    const clean = draft.trim().replace(/\s+/g, ' ').slice(0, 28)
    if (clean) onRename(clean)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="name-input"
        autoFocus
        maxLength={28}
        value={draft}
        aria-label="Name the creature"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className="creature-name"
      onClick={() => {
        setDraft(creatureName ?? '')
        setEditing(true)
      }}
    >
      {creatureName ?? <span className="name-unset">Give it a name</span>}
    </button>
  )
}

function Status({ status, here }: { status: ConnectionStatus; here: number }): JSX.Element {
  const live = status === 'open'
  const text = live
    ? here > 1
      ? `${here} here`
      : 'only you here'
    : status === 'connecting'
      ? 'finding it'
      : 'offline'
  return (
    <span className="status" role="status">
      <span className={live ? 'dot dot-live' : 'dot'} />
      <span className="status-text">{text}</span>
    </span>
  )
}

function ShareButton({ groupId }: { groupId: string }): JSX.Element {
  const { copied, copy } = useCopy()
  return (
    <button
      type="button"
      className={copied ? 'btn is-copied' : 'btn'}
      onClick={() => copy(groupLink(groupId))}
    >
      {copied ? <CheckIcon /> : <LinkIcon />}
      {copied ? 'Link copied' : 'Share'}
    </button>
  )
}

function LinkIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M8.6 11.4a3 3 0 0 0 4.3 0l2-2a3 3 0 0 0-4.2-4.3l-.8.8" />
        <path d="M11.4 8.6a3 3 0 0 0-4.3 0l-2 2a3 3 0 0 0 4.2 4.3l.8-.8" />
      </g>
    </svg>
  )
}

function CheckIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 10.4 8 14l7.5-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// A stack of entries with a rule down the margin, which is what the chronicle
// itself looks like. Drawn rather than a glyph, same as every other icon here.
function ChronicleIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M5 3.6v12.8" />
        <path d="M8.4 5.6h7" />
        <path d="M8.4 9.4h7" />
        <path d="M8.4 13.2h4.6" />
      </g>
    </svg>
  )
}

function PeopleIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <circle cx="7.6" cy="7.6" r="2.6" />
        <path d="M3.2 16c.7-2.4 2.4-3.6 4.4-3.6S11.3 13.6 12 16" />
        <circle cx="14.2" cy="7.2" r="2" />
        <path d="M13.4 12.5c1.9.2 3.1 1.3 3.6 3.5" />
      </g>
    </svg>
  )
}
