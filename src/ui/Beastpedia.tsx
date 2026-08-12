// Beastpedia.tsx: the page about your creature.
//
// Everything on it has existed in the data since the first week and has never
// been said out loud. The app shows an animal and leaves you to infer that it
// is heavy because you fed it, that its skin went that colour because of what
// you fed it, that the horns are Ana's. This is where those become sentences.
//
// It reads like a bestiary specimen report on purpose. There are fourteen of
// those in the research library written about real animals, and giving a
// group's creature the same treatment is the joke and the point at once: it is
// a real animal, and this is its entry.
//
// Two rules, both inherited. No numbers that describe the mechanics, because a
// number is a thing to optimise and an optimised creature is the same creature
// everybody gets. And what the creature IS is kept apart from what the group
// DOES, because the interesting case is when they disagree.

import type { JSX } from 'react'
import { STAGES } from '../core/types'
import type { Bond, Creature, Genome } from '../core/types'
import { alleleById } from '../dna'
import { paletteFor } from '../forge/materials'
import { describe } from './describe'

interface BeastpediaProps {
  creature: Creature | null
  genome: Genome | null
}

export default function Beastpedia({ creature, genome }: BeastpediaProps): JSX.Element {
  if (!creature || !genome) {
    return (
      <div className="panel pedia">
        <p className="empty">Nothing to write about yet.</p>
      </div>
    )
  }

  // The hide colour is worked out the same way the renderer works it out, from
  // the seed and what has gone into the creature, so the page and the animal on
  // screen can never disagree about what colour it is.
  const hsl = { h: 0, s: 0, l: 0 }
  paletteFor(genome.seed, creature.substance).base.getHSL(hsl)
  const entry = describe(creature, genome, hsl)

  const bonds = Object.values(creature.bonds)
  const named = creature.name ?? 'It'

  return (
    <div className="panel pedia">
      <div className="panel-head">
        <span className="label">Specimen</span>
        <span className="count">{STAGES[creature.stage] ?? 'egg'}</span>
      </div>

      <p className="pedia-lead">
        {named} is {entry.kind}, {entry.size}. {capitalise(entry.build)}, and{' '}
        {entry.colour} where the light catches it.
      </p>

      <Section label="What it is made of">
        <p>{entry.diet ?? 'Nothing has been put into it yet.'}</p>
      </Section>

      <Section label="What it is like">
        <p>{capitalise(entry.temperament)}.</p>
      </Section>

      <Section label="What it grew">
        {creature.traits.length === 0 ? (
          <p className="empty">Nothing yet. It is still deciding.</p>
        ) : (
          <ul className="pedia-traits">
            {creature.traits.map((trait) => {
              const allele = alleleById(trait.allele)
              const who = trait.credited
                .map((id) => creature.bonds[id]?.actorName)
                .filter((n): n is string => Boolean(n))
              return (
                <li key={`${trait.locus}:${trait.allele}`}>
                  <span className="pedia-locus">{trait.locus}</span>
                  <span className="pedia-trait">{allele ? allele.label : trait.allele}</span>
                  {who.length > 0 && (
                    <span className="pedia-because">
                      because of {joinNames(who)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section label="Who it belongs to">
        {bonds.length === 0 ? (
          <p className="empty">Nobody has done anything to it yet.</p>
        ) : (
          <ul className="pedia-people">
            {[...bonds]
              .sort((a, b) => b.actions - a.actions)
              .map((bond) => (
                <li key={bond.actorId}>
                  <span className="pedia-who">{bond.actorName}</span>
                  <span className="pedia-role">{standing(bond, creature)}</span>
                </li>
              ))}
          </ul>
        )}
      </Section>

      <p className="pedia-foot">{capitalise(entry.age)}.</p>
    </div>
  )
}

function Section({ label, children }: { label: string; children: JSX.Element | JSX.Element[] }): JSX.Element {
  return (
    <div className="pedia-section">
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

/**
 * What one person is to the creature.
 *
 * Counted in traits caused rather than in actions taken, because "did the most
 * clicking" is not a relationship and this app has never ranked people that
 * way. Somebody who turned up rarely and happened to be there for two locks
 * left more of a mark than somebody who pressed a button four hundred times
 * without ever shifting it, and the sentence should say so.
 */
function standing(bond: Bond, creature: Creature): string {
  const caused = creature.traits.filter((t) => t.credited.includes(bond.actorId)).length
  if (caused === 0) return bond.actions === 1 ? 'came by once' : 'has been around'
  if (caused === 1) return 'is why it has one of these'
  if (caused >= creature.traits.length && creature.traits.length > 1) return 'is why it is like this at all'
  return `is why it has ${caused} of these`
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1)
}
