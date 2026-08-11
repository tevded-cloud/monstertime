// App.tsx: which of the three screens you are on, and nothing else.
//
// Routing is location.hash and only location.hash. A group is a link somebody
// pasted into a chat, so the address bar is the entire navigation model: no
// history stack to keep in step, and a shared URL always lands on the animal.

import { useEffect, useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { ActionRecord } from '../core/types'
import ActionBar from './ActionBar'
import Chronicle from './Chronicle'
import Crowd from './Crowd'
import Landing, { Sigil } from './Landing'
import Stage from './Stage'
import { forgetGroup, useGroup, useMediaQuery, useNamed } from './useGroup'

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
  //
  // Not reached when there is a stored snapshot for this group: the creature is
  // already on screen, marked as of when it was last seen, and telling somebody
  // holding a perfectly good copy of their animal that we could not find it
  // would be false as well as unhelpful.
  if (!group.everConnected && waited && !group.offline) {
    return <Lost groupId={groupId} />
  }

  const actions = group.snapshot ? group.snapshot.actions : NO_ACTIONS
  const stale = group.everConnected && (group.status === 'closed' || group.status === 'error')
  // Held back until the socket has actually given up. While it is still
  // connecting the status pill already says so, and announcing a creature as
  // offline half a second before it goes live would be its own small lie.
  const offlineSince =
    group.offline && (group.status === 'closed' || group.status === 'error') ? group.cachedAt : null

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
          offlineSince={offlineSince}
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

      {!compact && (
        // Named because a landmark a reader can jump to is worth nothing if the
        // list of them reads "complementary" and leaves you to guess.
        <aside className="rail" aria-label="The group and the chronicle">
          {panels}
        </aside>
      )}

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

// How far the sheet has to be pulled down before letting go closes it. Short
// enough to feel like a flick, long enough that a thumb resting on the head
// while reading does not dismiss the thing being read.
const DRAG_TO_CLOSE_PX = 80

function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDialogElement | null>(null)
  const from = useRef<number | null>(null)
  const pulled = useRef(0)
  const [drag, setDrag] = useState(0)

  // A real <dialog> rather than a hand-rolled overlay, because it brings the
  // focus trap and the Escape key with it and both would otherwise be work we
  // would get subtly wrong.
  //
  // What it does NOT bring is any way out that a phone has. Escape is a key,
  // and a modal dialog swallows the back gesture, so until the two handlers
  // below existed the close button was the only exit: one 32px target, and if
  // a tap on it missed or was swallowed (iOS eats the first tap on the page
  // after the share sheet dismisses, which is exactly when somebody is in here
  // sending an invite) the group menu could not be closed at all.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
    if (open) setDrag(0)
  }, [open])

  // Tapping the dimmed area closes it. A <dialog> does not do this on its own.
  // The backdrop is not a separate element, so a press on it targets the dialog
  // itself; the rect test is what tells that apart from a press on the sheet's
  // own bottom inset padding, which is inside and must not close.
  function onBackdrop(e: ReactPointerEvent<HTMLDialogElement>): void {
    const el = ref.current
    if (!el || e.target !== el) return
    const box = el.getBoundingClientRect()
    const inside =
      e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom
    if (!inside) onClose()
  }

  // Pull down to dismiss, from the head only. The body scrolls, and a drag that
  // started there would have to arbitrate between scrolling and dismissing on
  // every touch; the head never scrolls, so there is nothing to arbitrate.
  function onGrabStart(e: ReactPointerEvent<HTMLDivElement>): void {
    // A press that began on a control belongs to that control, not to the
    // sheet. This line is load bearing: capturing the pointer here retargets
    // the pointerup to the head, so the browser computes the click on the head
    // rather than on the button it started on, and the close button lights up
    // under the finger and never fires. That is not a theory, it is what
    // shipped.
    if (e.target instanceof Element && e.target.closest('button') !== null) return

    from.current = e.clientY
    pulled.current = 0
    try {
      // Keeps the move events coming if the finger leaves the head mid-pull.
      // Non-fatal on purpose: a refused capture costs a drag that ends early,
      // while letting it throw here would take the whole press handler down and
      // with it the head this sheet is dismissed from.
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Nothing to do. The pull still works while the finger stays on the head.
    }
  }

  function onGrabMove(e: ReactPointerEvent<HTMLDivElement>): void {
    if (from.current === null) return
    // Downward only. Pulling up must not lift the sheet off the bottom edge.
    const dy = Math.max(0, e.clientY - from.current)
    // Kept in a ref as well as in state because the decision below is made from
    // it. Reading the state variable there means reading whatever the closure
    // captured, which is a render behind whenever the last move and the release
    // land in one task: the sheet is visibly pulled halfway down the screen and
    // the release still measures it as barely moved, so it springs back.
    pulled.current = dy
    setDrag(dy)
  }

  function onGrabEnd(): void {
    if (from.current === null) return
    from.current = null
    const dy = pulled.current
    pulled.current = 0
    if (dy > DRAG_TO_CLOSE_PX) onClose()
    else setDrag(0)
  }

  // A cancelled pointer is the system taking the gesture away, not somebody
  // letting go, so it always returns the sheet rather than dismissing it.
  function onGrabCancel(): void {
    from.current = null
    pulled.current = 0
    setDrag(0)
  }

  return (
    <dialog
      className={drag > 0 ? 'sheet is-dragging' : 'sheet'}
      ref={ref}
      style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
      onClose={onClose}
      onCancel={onClose}
      onPointerDown={onBackdrop}
      aria-label="The group and the chronicle"
    >
      <div
        className="sheet-head"
        onPointerDown={onGrabStart}
        onPointerMove={onGrabMove}
        onPointerUp={onGrabEnd}
        onPointerCancel={onGrabCancel}
      >
        <span className="sheet-grip" aria-hidden="true" />
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
    <main className="lost">
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
            // Forget first. This is the one place somebody says they are done
            // with a group, and without it an installed copy would restore the
            // link they just walked away from on the very next launch.
            forgetGroup()
            location.hash = ''
          }}
        >
          Start one of your own instead
        </button>
      </div>
    </main>
  )
}
