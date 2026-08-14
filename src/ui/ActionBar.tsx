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
//
// A sleeping creature is the second reason a thing can be unavailable here, and
// it is nothing like the first. The cooldown is a wait this person has just
// earned and it is over in under a minute, so it is drawn as a hairline that
// retreats and says nothing. Sleep is hours long, it applies to everybody in the
// group at once, and nobody did anything to cause it, so it is said in words and
// it is said before anybody presses anything. That distinction is the whole of
// what this file has to get right: five dead buttons and no sentence is
// indistinguishable from an app that has broken, and the person who reads it
// that way does not come back to check.
//
// Which is why the wake action is routed through this same tray rather than put
// somewhere of its own. It is an ordinary item with an ordinary manner step, so
// waking it gently and waking it firmly are two different things a person can
// choose between while their animal is down, which is the only interesting
// decision on offer at that hour.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import { ACTION_KINDS } from '../core/types'
import type { ActionKind, ActionMethod, ActionVariant, Creature } from '../core/types'
import { availableVariants, methodFits, methodsForKind } from '../dna'
// Reached past src/net's barrel deliberately and not happily. The barrel is the
// public face of that module and this belongs on it; until it is added there,
// the alternative is leaving every sentence the object writes in the console.
import { forgetSentence, readSentence, SENTENCE_MS, subscribeSentence } from '../net/connection'
import { wakingPhrase } from './describe'
import { useSleep } from './useGroup'

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

// Why a kind is offering nothing, said out loud rather than only into the 1px
// box a screen reader reads. Same two reasons and the same ranking as the sr
// span inside the button, because they are the same answer to the same question
// and a second wording would be a second answer that can drift.
//
// The sleeping one is deliberately NOT the sentence the bar is already showing
// while it is asleep. An aria-live region announces a CHANGE, so an answer
// identical to the line already on screen is silence to a screen reader and a
// tap that did nothing to everybody else, which is the whole defect.
const SHUT_ASLEEP = 'Not while it is asleep.'
const SHUT_YOUNG = 'It is too young for this yet.'

/** Something the app has to say about the tap that has just happened, and the
 *  instant it was said, so the newer of two answers wins. */
interface Answer {
  text: string
  at: number
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

  // The same answer the Durable Object refuses actions with, off the same pure
  // function, corrected against the same clock. This screen never works sleep
  // out for itself: a tray that offered a button the server was going to turn
  // away would be worse than a tray that offered nothing.
  const sleep = useSleep()
  const sleeping = sleep !== null && sleep.asleep ? sleep : null
  const asleep = sleeping !== null

  // The cooldown is anchored to the server's timestamp for this person's last
  // action, so reloading the page does not hand anybody a fresh turn. The local
  // stamp only covers the gap before that action echoes back.
  const bond = creature ? creature.bonds[actorId] : undefined
  const since = Math.max(bond ? bond.lastAt : 0, localAt)
  const remaining = since ? Math.max(0, Math.min(COOLDOWN_MS, since + COOLDOWN_MS - now)) : 0
  const cooling = remaining > 0

  // The answer to the last tap, from whichever side answered it.
  //
  // Two things can answer. The object does, when it turns an action away or when
  // it tells the whole group the creature is nearly out of life. This file does,
  // when somebody presses a kind that is offering nothing. They are the same
  // kind of statement, they share one line, and the newer of the two wins: both
  // on screen at once would be the app arguing with itself.
  const fromServer = useSyncExternalStore(subscribeSentence, readSentence, () => null)
  const [fromHere, setFromHere] = useState<Answer | null>(null)
  const answer =
    fromHere === null
      ? fromServer
      : fromServer === null || fromHere.at >= fromServer.at
        ? fromHere
        : fromServer

  // Ours runs out on a clock of its own; the object's runs out inside the store
  // holding it. The same length for both, because they land on the same line and
  // nobody reading it has any way of knowing which of the two they are reading.
  useEffect(() => {
    if (fromHere === null) return
    const t = window.setTimeout(() => setFromHere(null), SENTENCE_MS)
    return () => window.clearTimeout(t)
  }, [fromHere])

  // A sentence from the object takes back the cooldown the tap started.
  //
  // localAt exists only to cover the gap before the server's own timestamp for
  // that action echoes back, so when the answer is a sentence instead of an
  // action there is no timestamp coming and the gap it stood in for never
  // opened. Without this, being refused costs a real forty-five seconds during
  // which the line above describes a meal that did not happen.
  //
  // The cap warning comes through here as well and loses nothing by it: the
  // action that tripped it succeeded, so the server's own stamp for it is
  // already in the snapshot and `since` falls straight back onto that.
  const answeredAt = fromServer === null ? 0 : fromServer.at
  useEffect(() => {
    if (answeredAt !== 0) setLocalAt(0)
  }, [answeredAt])

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
    for (const variant of availableVariants(stage, asleep)) grouped.get(variant.kind)?.push(variant)
    return grouped
  }, [stage, asleep])

  // The shortcut's target, taken from the catalogue rather than written down as
  // an id. If a second thing a person may do to a sleeping animal is ever added,
  // this points at the first of them instead of at a variant that used to be the
  // only one, and the kind comes off the variant so the tray it opens is
  // whichever tray that variant actually lives in.
  const wake = useMemo(() => availableVariants(stage, true)[0] ?? null, [stage])

  // It can fall asleep, or wake up, while somebody is standing in the tray with
  // it open. The two states offer disjoint sets, so whatever was picked a second
  // ago is not on the menu any more: leaving it picked would leave a manner list
  // on screen that commits an action the server is about to refuse. Dropping
  // back one level lands on the item list, which is the level that has just
  // rewritten itself and is the only honest thing to be looking at.
  useEffect(() => {
    if (picked !== null && (picked.whileAsleep === true) !== asleep) setPicked(null)
  }, [asleep])

  function shut(): void {
    setOpen(null)
    setShelf(null)
    setPicked(null)
  }

  /**
   * The manners that can actually be true of this item.
   *
   * Filtered rather than listed by kind. Manners hang off the kind, so every
   * singing manner was offered for every singing item, and "whistle from across
   * the field" was offered "up close" and "from across the room" at the same
   * time. The catalogue knows which fit; this asks it rather than repeating the
   * rule, because two answers to one question is the defect this codebase keeps
   * paying for.
   */
  function mannersFor(variant: ActionVariant): ActionMethod[] {
    return methodsForKind(variant.kind).filter((m) => methodFits(variant.id, m.id))
  }

  /** Committed here and only here, whichever way somebody arrived. */
  function commit(variant: ActionVariant, methodId?: string): void {
    onAct(variant.id, methodId)
    setLocalAt(Date.now())
    setLastKind(variant.kind)
    // A fresh tap replaces the answer to the last one. Left standing, a refusal
    // earned a moment ago outranks the settle line for the rest of its twenty
    // seconds and reports it over an action that has just gone through.
    forgetSentence()
    setFromHere(null)
    shut()
  }

  // Order matters here, and the cooldown deliberately sits ABOVE sleep. The
  // sixty seconds after somebody wakes it are the one stretch where the two
  // reasons are both true, and "It is asleep" arriving directly under the line
  // that just said you woke it up reads as the app contradicting itself. The
  // creature's attention is the nearer and the more recent answer, so it is the
  // one on screen, and the sleep sentence comes back when it runs out.
  //
  // An answer to a tap goes above the cooldown, for a reason the cooldown itself
  // creates: commit() starts it off the tap rather than off the server's echo,
  // so in exactly the window where a refusal lands, the settle line is
  // describing an action the object has just declined to record. It stays below
  // "not connected", because a socket that has gone is the reason the NEXT tap
  // will not be answered either, and that outranks the answer to the last one.
  const note = !live
    ? 'Not connected to it right now.'
    : answer !== null
      ? answer.text
      : cooling
        ? lastKind
          ? SETTLE[lastKind]
          : 'It needs a moment.'
        : sleeping !== null
          ? `It is asleep. Up again ${wakingPhrase(sleeping.until - sleeping.now)}.`
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

  // Where the one live thing is offered when nothing else in view is. Either the
  // tray is shut, or it is open on a kind that has just emptied under somebody's
  // hand, and in both cases the alternative is a screen where every target is
  // dead and the only way through is guessing which of the six kinds is the one
  // that still answers. Never alongside a tray that is already showing the wake
  // item, and never on the manner step: two ways to start the same act, both on
  // screen at once, is how a tray turns into a control panel.
  const offerWake = asleep && wake !== null && picked === null && (open === null || shown.length === 0)

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
                {shown.length === 0 && asleep && (
                  // Reachable exactly one way: it went to sleep while this tray
                  // was open, because a kind with nothing in it cannot be opened.
                  // So the sentence says that rather than describing the state,
                  // and the tray stays where it was instead of being yanked shut
                  // under somebody who is mid-reach.
                  <p className="empty">It has gone to sleep. Nothing here until it is up.</p>
                )}
                {shown.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    className="variant"
                    disabled={cooling || !live}
                    onClick={() => {
                      // Some shelves ARE a manner: everything on "from far off"
                      // is done from far off. Asking there is a tap that offers
                      // no decision, so the item commits with the one that fits.
                      const fits = mannersFor(variant)
                      if (fits.length === 1) commit(variant, fits[0].id)
                      else setPicked(variant)
                    }}
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
                {mannersFor(picked).map((method) => (
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

      {offerWake && wake !== null && (
        <div className="rouse">
          <button
            type="button"
            className="btn"
            disabled={cooling || !live}
            onClick={() => {
              // Straight to the manner step, which is the only question a wake
              // actually asks. It opens the real tray on the real item, so the
              // tap that commits is the same tap it is everywhere else and there
              // is one path into commit() rather than two.
              setOpen(wake.kind)
              setShelf(null)
              setPicked(wake)
            }}
          >
            {/* The catalogue's own words, not a second copy of them. A shortcut
                that said something else would be a second name for one act, and
                the group would end up with two names for the thing they do on the
                evenings their creature is down. */}
            {wake.label}
          </button>
        </div>
      )}

      <div className="kinds">
        {ACTION_KINDS.map((kind) => {
          const count = (byKind.get(kind) ?? []).length
          const shutKind = count === 0
          return (
            <button
              key={kind}
              type="button"
              className="kind"
              // aria-disabled and NOT the disabled attribute, which is what this
              // was. A disabled button fires no pointer event and takes no
              // focus, and the stylesheet turns the platform's tap highlight off
              // everywhere, so a thumb landing on Feed at the egg stage produced
              // literally nothing at the place it landed. Three of the six are
              // like that for the whole of a new group's first session, right
              // after they chose the animal together, and the only explanation
              // anywhere on the page was in a box clipped to one pixel.
              aria-disabled={shutKind}
              aria-expanded={open === kind}
              aria-controls={open === kind ? `tray-${kind}` : undefined}
              onClick={() => {
                // The tap lands and is answered. The tray is left exactly as it
                // was: somebody reading a shelf when they brush a shut kind
                // should get the sentence, not lose the thing they were reading.
                if (shutKind) {
                  setFromHere({ text: asleep ? SHUT_ASLEEP : SHUT_YOUNG, at: Date.now() })
                  return
                }
                if (open === kind) shut()
                else {
                  setOpen(kind)
                  setShelf(null)
                  setPicked(null)
                }
              }}
            >
              <KindIcon kind={kind} />
              <span>{KIND_LABEL[kind]}</span>
              {shutKind && (
                // Two different reasons a kind is shut, and a reader gets the
                // right one. "Too young for this yet" said about a grown animal
                // that is merely asleep would send somebody looking for a stage
                // gate that is not there. It stays even though the tap now
                // answers in words: this one is readable BEFORE the press, which
                // is what stops a screen reader user having to press every dead
                // button to find out which of the six is worth pressing.
                <span className="sr">{asleep ? 'not while it is asleep' : 'too young for this yet'}</span>
              )}
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
