// Crowd.tsx: who is in the room, and what each of them is to the creature.
//
// Deliberately no counts and no ranking. A person's standing is stated as a
// habit ("takes it out", "keeps it calm") because that is the true thing: the
// creature does not know who clicked most, it only carries the shape of what
// was done to it.

import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { PRESSURE_AXES } from '../core/types'
import type { Bond, Creature, PressureAxis, PresentActor } from '../core/types'
import { claimHandle } from '../net'
import { useInstall } from './install'
import { drawCard, saveCard } from './passcode'
import { forgetGroup, groupLink, knownGroups, setGroupHash, useCopy } from './useGroup'

const HABIT: Record<PressureAxis, string> = {
  nourish: 'feeds it',
  vigor: 'pushes it',
  roam: 'takes it out',
  resonance: 'sings to it',
  craft: 'brings it things',
  bond: 'sits with it',
  ferocity: 'winds it up',
  stillness: 'keeps it calm',
}

interface CrowdProps {
  creature: Creature | null
  present: PresentActor[]
  actorId: string
  groupId: string
  handle: string | null
  pace: number
  onPace: (pace: number) => void
  onClaim: () => void
  freshCode: { actorId: string; code: string } | null
  claimed: boolean
  groupName: string | null
}

export default function Crowd({
  creature,
  present,
  actorId,
  groupId,
  handle,
  pace,
  onPace,
  onClaim,
  freshCode,
  claimed,
  groupName,
}: CrowdProps): JSX.Element {
  const bonds: Record<string, Bond> = creature ? creature.bonds : {}
  const everyone = Object.values(bonds)
  const hereIds = new Set(present.map((p) => p.actorId))
  const away = everyone.filter((b) => !hereIds.has(b.actorId)).sort((a, b) => b.lastAt - a.lastAt)
  const eldest = everyone.reduce<Bond | null>((best, b) => (!best || b.firstAt < best.firstAt ? b : best), null)
  const alone = everyone.length <= 1

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">Here now</span>
        <span className="count">{present.length}</span>
      </div>

      {present.length === 0 ? (
        <p className="empty">Nobody, not even you yet.</p>
      ) : (
        <ul>
          {present.map((p) => (
            <Row
              key={p.actorId}
              name={p.actorName}
              bond={bonds[p.actorId]}
              you={p.actorId === actorId}
              eldest={eldest?.actorId === p.actorId}
            />
          ))}
        </ul>
      )}

      {away.length > 0 && (
        <>
          <div className="label away-head">Away</div>
          <ul>
            {away.map((b) => (
              <Row
                key={b.actorId}
                name={b.actorName}
                bond={b}
                you={b.actorId === actorId}
                eldest={eldest?.actorId === b.actorId}
                away
              />
            ))}
          </ul>
        </>
      )}

      <ClaimRow
        onClaim={onClaim}
        freshCode={freshCode}
        claimed={claimed}
        actorId={actorId}
        present={present}
        groupName={groupName ?? handle ?? 'your group'}
        groupHandle={handle}
      />

      <div className="invite">
        {alone ? (
          <p>One person's habits make a narrow animal. It needs somebody else pulling it a different way.</p>
        ) : (
          <span className="label">Bring somebody in</span>
        )}
        <LinkRow groupId={groupId} />
        <HandleRow groupId={groupId} handle={handle} />
        <PaceRow pace={pace} onPace={onPace} />
        <OtherGroups here={groupId} />
        <InstallRow />
        <LeaveRow />
      </div>
    </div>
  )
}

/**
 * Claiming a place, and the one moment the code exists.
 *
 * The server keeps only a hash and cannot reissue it, so everything about this
 * component is shaped by the fact that closing it loses the code for good.
 * There is no automatic dismissal, no timeout, and the way out says what it is
 * agreeing to rather than "OK".
 */
function ClaimRow({
  onClaim,
  freshCode,
  claimed,
  actorId,
  present,
  groupName,
  groupHandle,
}: {
  onClaim: () => void
  freshCode: { actorId: string; code: string } | null
  claimed: boolean
  actorId: string
  present: PresentActor[]
  groupName: string
  groupHandle: string | null
}): JSX.Element | null {
  const [saved, setSaved] = useState(false)
  const [why, setWhy] = useState(false)

  const me = present.find((p) => p.actorId === actorId)
  const myName = me?.actorName ?? 'you'

  if (freshCode !== null && !saved) {
    return (
      <div className="claim claim-fresh">
        <span className="label">This is your code. It is shown once.</span>
        <p className="claim-code">{freshCode.code}</p>
        <p className="hint">
          Type it to be yourself again on any phone. Nobody can look it up or send it again.
        </p>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const card = drawCard({
                code: freshCode.code,
                personName: myName,
                groupName,
                groupHandle,
              })
              if (card !== null) saveCard(card, myName)
            }}
          >
            Save it as a picture
          </button>
          <button type="button" className="btn-text" onClick={() => setWhy(!why)} aria-label="Why">
            ?
          </button>
        </div>
        {why && (
          <p className="hint">
            Saving it puts it in your photos. Email it to yourself as well and you still have it if
            you lose the phone, which is the one thing a saved picture cannot survive.
          </p>
        )}
        <button type="button" className="btn-text" onClick={() => setSaved(true)}>
          I have saved it
        </button>
      </div>
    )
  }

  if (claimed || actorId.startsWith('@')) return null

  return (
    <div className="claim">
      <span className="label">Make this yours</span>
      <p>
        Right now this browser is just a guest, so anybody could turn up as you. Claim a place and
        the things you do stay yours.
      </p>
      <button type="button" className="btn" onClick={onClaim}>
        Claim my place
      </button>
    </div>
  )
}

/**
 * How fast the group wants its creature to live.
 *
 * Named speeds rather than a number, because "1.5" is not a thing anybody
 * wants; a long slow animal or one raised in an evening is. Anybody in the
 * group can change it, which is deliberate: there are no roles here, and a pace
 * one person imposed would be the first thing in this app belonging to one
 * member rather than to everybody.
 */
const PACES: { pace: number; name: string; blurb: string }[] = [
  { pace: 0.25, name: 'Slow', blurb: 'A day at a time. It will be a while.' },
  { pace: 1, name: 'Steady', blurb: 'Hatches overnight if you leave it be.' },
  { pace: 3, name: 'Quick', blurb: 'An evening, if a few of you are on it.' },
  { pace: 6, name: 'One sitting', blurb: 'Grown before anybody goes to bed.' },
]

function PaceRow({ pace, onPace }: { pace: number; onPace: (pace: number) => void }): JSX.Element {
  // Nearest, because the server clamps and an older group may be carrying a
  // value no button here offers.
  const current = PACES.reduce((best, p) =>
    Math.abs(p.pace - pace) < Math.abs(best.pace - pace) ? p : best,
  )
  return (
    <div className="pace">
      <span className="label">How fast it grows</span>
      <div className="pace-row">
        {PACES.map((p) => (
          <button
            key={p.pace}
            type="button"
            className={p === current ? 'btn is-on' : 'btn'}
            aria-pressed={p === current}
            onClick={() => onPace(p.pace)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <p className="hint">{current.blurb}</p>
    </div>
  )
}

/**
 * Putting it on the home screen.
 *
 * Offered here rather than as a banner across the top, because a banner is the
 * thing people learn to dismiss without reading, and because this panel is
 * already where somebody goes when they are thinking about keeping the
 * creature rather than looking at it.
 */
function InstallRow(): JSX.Element | null {
  const { state, install } = useInstall()
  const [showRecipe, setShowRecipe] = useState(false)

  if (state === 'installed' || state === 'unavailable') return null

  if (state === 'ios') {
    return (
      <div className="install">
        <button type="button" className="btn-text" onClick={() => setShowRecipe(!showRecipe)}>
          Keep it on your home screen
        </button>
        {showRecipe && (
          // No API for this on iOS. Saying the steps is the whole of what can
          // honestly be done.
          <p className="hint">
            Tap Share at the bottom of Safari, then Add to Home Screen.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="install">
      <button type="button" className="btn-text" onClick={install}>
        Keep it on your home screen
      </button>
    </div>
  )
}

/**
 * The other creatures this browser is part of.
 *
 * Somebody in three groups had three links to keep track of and no way back to
 * any of them except the chat they were sent in. The list is local to this
 * browser rather than to a person, which is the honest limit of it until there
 * are accounts: it follows the device, not you.
 */
function OtherGroups({ here }: { here: string }): JSX.Element | null {
  const others = useMemo(() => knownGroups().filter((g) => g.id !== here), [here])
  if (others.length === 0) return null

  return (
    <div className="others">
      <span className="label">Your other creatures</span>
      <ul>
        {others.map((g) => (
          <li key={g.id}>
            <button type="button" className="btn-text" onClick={() => setGroupHash(g.id)}>
              {g.name ?? g.handle ?? 'an unnamed one'}
              {g.name && g.handle && <span className="others-handle">{g.handle}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The way back to the front door.
 *
 * It has to exist here, because the app now reopens the last group on every
 * launch. Before that, an empty address bar WAS this control; with the group
 * restored there is otherwise nothing anywhere that reaches the screen where a
 * creature is started or another one is opened.
 */
function LeaveRow(): JSX.Element {
  return (
    <button
      type="button"
      className="btn-text leave"
      onClick={() => {
        // Forget before clearing, or the launch after this one restores the
        // group that was just walked away from.
        forgetGroup()
        location.hash = ''
      }}
    >
      Start or open a different creature
    </button>
  )
}

/**
 * What the group calls itself, which is how anybody gets back in without the
 * link. A link lives in one chat thread and is gone the moment that thread
 * moves on; a name is the thing people actually remember.
 */
function HandleRow({ groupId, handle }: { groupId: string; handle: string | null }): JSX.Element {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (handle) {
    return (
      <p className="handle-set">
        Anybody can open this by typing <strong>{handle}</strong> on the front screen.
      </p>
    )
  }

  const wanted = typed.trim().toLowerCase().replace(/\s+/g, '-')

  async function claim(): Promise<void> {
    if (!wanted || busy) return
    setBusy(true)
    setProblem(null)
    try {
      const result = await claimHandle(groupId, wanted)
      if (result === 'taken') setProblem('Another group already goes by that. Try adding a word.')
      if (result === 'unusable') setProblem('Letters, numbers and hyphens, 3 to 32 of them.')
      // On success nothing is set here: the name arrives in the next snapshot
      // from the server, the same way every other shared fact about the group
      // does, so two people looking at this panel cannot disagree about it.
    } catch {
      setProblem('That did not take. Try once more.')
    }
    setBusy(false)
  }

  return (
    <div className="handle-row">
      <label className="label" htmlFor="group-handle">
        Give the group a name to open it by
      </label>
      <div className="link-row">
        <input
          id="group-handle"
          className="text-input"
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={32}
          placeholder="what you all call it"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void claim()
          }}
        />
        <button type="button" className="btn" disabled={!wanted || busy} onClick={() => void claim()}>
          {busy ? 'Asking' : 'Claim'}
        </button>
      </div>
      {problem && <p className="hint hint-bad">{problem}</p>}
    </div>
  )
}

function Row({
  name,
  bond,
  you,
  eldest,
  away,
}: {
  name: string
  bond: Bond | undefined
  you: boolean
  eldest: boolean
  away?: boolean
}): JSX.Element {
  const habit = bond ? HABIT[dominant(bond)] : 'just arrived'
  return (
    <li className={away ? 'who who-away' : 'who'}>
      <span className="who-name">{name}</span>
      {you && <span className="you">you</span>}
      <span className="who-role">
        {habit}
        {eldest && bond && (
          <>
            , and <span className="first">knew it first</span>
          </>
        )}
      </span>
    </li>
  )
}

function dominant(bond: Bond): PressureAxis {
  let best: PressureAxis = 'bond'
  let top = -1
  for (const axis of PRESSURE_AXES) {
    const value = bond.contribution[axis]
    if (value > top) {
      top = value
      best = axis
    }
  }
  return best
}

function LinkRow({ groupId }: { groupId: string }): JSX.Element {
  const { copied, copy } = useCopy()
  const link = groupLink(groupId)
  return (
    <div className="link-row">
      <span className="link-box" title={link}>
        {link.replace(/^https?:\/\//, '')}
      </span>
      <button type="button" className={copied ? 'btn is-copied' : 'btn'} onClick={() => copy(link)}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  )
}
