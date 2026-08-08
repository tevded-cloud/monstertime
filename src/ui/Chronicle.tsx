// Chronicle.tsx: the payoff surface.
//
// Two kinds of moment share one rule down the margin: things that merely
// happened, and the moments a trait locked in for good. The second kind carries
// names, because "Ana is why it has those ears" is the sentence this whole app
// exists to produce.

import { useMemo } from 'react'
import type { JSX } from 'react'
import { STAGES } from '../core/types'
import type { ActionRecord, Bond, Creature } from '../core/types'
import { alleleById } from '../dna'

interface ChronicleProps {
  creature: Creature | null
  actions: ActionRecord[]
}

interface Entry {
  key: string
  trait: boolean
  atAction: number
  at: number
  locus?: string
  title?: string
  text?: string
  credit: string
}

export default function Chronicle({ creature, actions }: ChronicleProps): JSX.Element {
  const entries = useMemo(() => build(creature, actions), [creature, actions, actions.length])

  return (
    <div className="panel chronicle">
      <div className="panel-head">
        <span className="label">Chronicle</span>
        <span className="count">{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <p className="empty">Nothing yet. The first thing anybody does to it turns up here, and stays.</p>
      ) : (
        <ol className="entries">
          {entries.map((entry) => (
            <li key={entry.key} className={entry.trait ? 'entry entry-trait' : 'entry'}>
              {entry.locus && <div className="label">{entry.locus}</div>}
              {entry.title && <p className="entry-title">{entry.title}</p>}
              {entry.text && <p className="entry-text">{entry.text}</p>}
              <div className="entry-meta">
                {entry.credit && <span className="entry-cred">{entry.credit}</span>}
                <span className="entry-time">{ago(entry.at)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function build(creature: Creature | null, actions: ActionRecord[]): Entry[] {
  if (!creature) return []
  const bonds = creature.bonds
  const out: Entry[] = []

  for (const trait of creature.traits) {
    const allele = alleleById(trait.allele)
    const stamp = actions[trait.atAction]
    out.push({
      key: `t:${trait.locus}:${trait.allele}:${trait.atAction}`,
      trait: true,
      atAction: trait.atAction,
      at: stamp ? stamp.at : 0,
      locus: `${trait.locus}, ${STAGES[trait.stage] ?? 'egg'}`,
      title: allele ? allele.label : trait.allele,
      credit: credit(trait.credited, bonds),
    })
  }

  for (const memory of creature.memories) {
    out.push({
      key: `m:${memory.id}`,
      trait: false,
      atAction: memory.atAction,
      at: memory.at,
      text: memory.text,
      credit: credit(memory.actorIds, bonds),
    })
  }

  // Newest first, and when a trait locked in on the same action that produced a
  // memory the trait reads above it: the lock is the headline, the memory is
  // the context underneath.
  out.sort((a, b) => b.atAction - a.atAction || Number(b.trait) - Number(a.trait))
  return out
}

function credit(ids: string[], bonds: Record<string, Bond>): string {
  const names = ids.map((id) => bonds[id]?.actorName).filter((n): n is string => Boolean(n))
  if (names.length === 0) return ''
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${list} did this.`
}

function ago(at: number): string {
  if (!at) return ''
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
