// Crowd.tsx: who is in the room, and what each of them is to the creature.
//
// Deliberately no counts and no ranking. A person's standing is stated as a
// habit ("takes it out", "keeps it calm") because that is the true thing: the
// creature does not know who clicked most, it only carries the shape of what
// was done to it.

import type { JSX } from 'react'
import { PRESSURE_AXES } from '../core/types'
import type { Bond, Creature, PressureAxis, PresentActor } from '../core/types'
import { groupLink, useCopy } from './useGroup'

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
}

export default function Crowd({ creature, present, actorId, groupId }: CrowdProps): JSX.Element {
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

      <div className="invite">
        {alone ? (
          <p>One person's habits make a narrow animal. It needs somebody else pulling it a different way.</p>
        ) : (
          <span className="label">Bring somebody in</span>
        )}
        <LinkRow groupId={groupId} />
      </div>
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
