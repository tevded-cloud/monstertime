// reactions.ts: what this creature does with the moment that just happened.
//
// The action catalogue names the choice. It must not also tell the player the
// outcome before they make it, and a fixed line per item would make a creature
// with months of history answer exactly like a stranger's. This is therefore a
// reading of the derived animal AFTER the server-authored action reaches the
// log. Its stance carries the group's accumulated way of raising it; its seed
// and the action id choose small variations without ambient randomness.

import type { ActionKind, ActionRecord, Creature, Genome, Stance } from '../core/types'
import { variantById } from './actions'
import { makeRng } from './rng'

const OPENING: Record<ActionKind, readonly string[]> = {
  feed: ['It settles over the food', 'It takes in the meal'],
  train: ['It meets the work', 'It gives itself to the exercise'],
  explore: ['It takes in the place', 'It enters the outing'],
  sing: ['It holds on to the sound', 'It receives the song'],
  give: ['It investigates what you brought', 'It considers the offering'],
  tend: ['It lets the care happen', 'It receives the attention'],
}

// These are descriptions of an observable manner, not names for the hidden
// axes. The stance is already the creature's visible, history-derived posture,
// so the prose and body cannot disagree about what sort of animal is answering.
const TEMPERAMENT: Record<Stance, readonly string[]> = {
  standing: ['without giving much away.', 'as though this were entirely ordinary.'],
  nosing: ['with patient, practical attention.', 'and examines each part before choosing one.'],
  squaring: ['with its whole body committed.', 'as if the moment were something to meet head-on.'],
  scenting: ['but keeps catching at whatever lies beyond it.', 'then looks past it toward the wider world.'],
  listening: ['and pauses over a detail you cannot hear.', 'as though there were a second, quieter part to it.'],
  leaning: ['then checks your face before settling.', 'and keeps one part of its attention on you.'],
  curled: ['slowly, without spending a movement.', 'and lets the moment come to it.'],
}

/** A deterministic reaction to one completed action, or null for an old or
 * unknown row the current catalogue cannot truthfully describe. */
export function reactionTo(creature: Creature, genome: Genome, action: ActionRecord): string | null {
  const variant = variantById(action.variantId)
  if (variant === undefined) return null

  const rng = makeRng(
    `reaction:${genome.seed}:${action.id}:${action.variantId}:${action.methodId ?? ''}:${creature.actionCount}:${creature.stance}`,
  )
  const openings = OPENING[variant.kind]
  const endings = TEMPERAMENT[creature.stance]
  return `${openings[rng.int(openings.length)]} ${endings[rng.int(endings.length)]}`
}
