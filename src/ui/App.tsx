// App.tsx: which of the three screens you are on, and nothing else.
//
// Routing is location.hash and only location.hash. A group is a link somebody
// pasted into a chat, so the address bar is the entire navigation model: no
// history stack to keep in step, and a shared URL always lands on the animal.

import { useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { ActionRecord } from '../core/types'
import ActionBar from './ActionBar'
import Chronicle from './Chronicle'
import Crowd from './Crowd'
import Landing, { Sigil } from './Landing'
import Stage from './Stage'
import { useGroup, useMediaQuery, useNamed } from './useGroup'

// How long a group is given to answer before we stop saying "finding it" and
// admit something is wrong. Long enough to cover a slow handshake on a phone.
const PATIENCE_MS = 8000

export default function App(): JSX.Element {
  const group = useGroup()
  const named = useNamed()
  const compact = useMediaQuery('(max-width: 900px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [waited, setWaited] = useState(false)

  const groupId = group.groupId
  useEffect(() => {
    setWaited(false)
    if (!groupId) return
    const t = window.setTimeout(() => setWaited(true), PATIENCE_MS)
    return () => window.clearTimeout(t)
  }, [groupId])

  if (!groupId) return <Landing mode="new" />
  if (!named) return <Landing mode="join" />

  // A socket that opened and then said nothing for eight seconds is as broken as
  // one that never opened, so the status is not consulted here. If the snapshot
  // does turn up late this screen replaces itself with the creature.
  if (!group.everConnected && waited) {
    return <Lost groupId={groupId} />
  }

  const actions = group.snapshot ? group.snapshot.actions : NO_ACTIONS
  const stale = group.everConnected && (group.status === 'closed' || group.status === 'error')

  const panels = (
    <>
      <Crowd creature={group.creature} present={group.present} actorId={group.actor.id} groupId={groupId} />
      <Chronicle creature={group.creature} actions={actions} />
    </>
  )

  return (
    <div className="app">
      <main className="stage-col">
        <Stage
          creature={group.creature}
          genome={group.genome}
          actions={actions}
          present={group.present}
          status={group.status}
          stale={stale}
          groupId={groupId}
          actorId={group.actor.id}
          onRename={group.rename}
          onOpenGroup={compact ? () => setSheetOpen(true) : null}
        />
        <ActionBar
          creature={group.creature}
          actorId={group.actor.id}
          live={group.status === 'open'}
          onAct={group.act}
        />
      </main>

      {!compact && <aside className="rail">{panels}</aside>}

      {compact && (
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
          {panels}
        </Sheet>
      )}
    </div>
  )
}

// One stable empty array so a group with no snapshot yet does not hand its
// children a fresh identity on every render and invalidate their memos.
const NO_ACTIONS: ActionRecord[] = []

function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDialogElement | null>(null)

  // A real <dialog> rather than a hand-rolled overlay, because it brings the
  // focus trap and the Escape key with it and both would otherwise be work we
  // would get subtly wrong.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog className="sheet" ref={ref} onClose={onClose} onCancel={onClose} aria-label="The group and the chronicle">
      <div className="sheet-head">
        <span className="label">The group</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  )
}

function Lost({ groupId }: { groupId: string }): JSX.Element {
  return (
    <div className="lost">
      <div className="mark">
        <Sigil />
        <span>MonsterTime</span>
      </div>
      <h1>We could not reach that creature.</h1>
      <p className="premise">
        Either the link is not quite right or it is not answering just now. The code we tried was <code>{groupId}</code>.
      </p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          Try again
        </button>
        <button
          type="button"
          className="btn-text"
          onClick={() => {
            location.hash = ''
          }}
        >
          Start one of your own instead
        </button>
      </div>
    </div>
  )
}
