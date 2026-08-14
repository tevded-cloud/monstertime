// stance.ts: what the animal is doing when nobody is doing anything to it.
//
// The problem this exists to solve is that an idle creature is where a group
// spends most of its time. Traits lock in at growth ticks and morphs drift over
// weeks, so for hours at a stretch the screen shows an animal standing still,
// and two groups who raised very different creatures were looking at the same
// picture of standing still. A pose is the cheapest possible fix: no new data,
// nothing stored, nobody asked to choose anything, just the pressures that were
// already there read once more for a different question.
//
// It is read as a lean rather than as a volume, which is the same reading every
// other decision in this module makes. A group that pressed every button evenly
// has not leaned anywhere, and gets a creature that is simply standing there.
// That is the correct answer and not a fallback: doing everything is a shape,
// and this is what that shape looks like from across a yard.
//
// Nothing here is shown as a word. The pose is drawn, and the reason it must
// never be captioned is the reason nothing else in this app is: a group that
// can read "squaring up" off a screen and work out which button caused it will
// press that button, and then every creature is the same creature.

import { PRESSURE_AXES } from '../core/types'
import type { PressureAxis, Pressures, Stance } from '../core/types'
import { centredShape } from './alleles'

// Which lean puts the animal in which pose.
//
// Eight axes onto six poses, because a pose has to be genuinely distinct from
// the others at a glance and on two very different rigs. The two doubled ones
// are doubled where the body does the same thing for both: a creature that has
// mostly been fed and one that has mostly been given things are both nose down
// over something between their feet, and a creature that has been worked and
// one that has been pushed are both squared up waiting for the next thing. The
// other six axes each ask for something a serpent and a quadruped can both do
// and neither can fake with another pose.
/** Which pose each axis asks for. Exported so a test can assert the RULE rather
 *  than a memory of one week's tuning: the cases in test/dna/stance.test.ts
 *  used to name an answer and quote the numbers behind it, and went red when
 *  the shelves were built out for saying the old numbers rather than for
 *  anything being wrong. A second copy over there would be two answers to one
 *  question, which is the defect this codebase keeps paying for. */
export const STANCE_FOR: Record<PressureAxis, Stance> = {
  // Head down, working at something on the ground in front of it.
  nourish: 'nosing',
  craft: 'nosing',
  // Weight set, chest and shoulders up, head level and forward.
  vigor: 'squaring',
  ferocity: 'squaring',
  // Head high and turned away, reading the air off somewhere else.
  roam: 'scenting',
  // Head cocked over, dead still, everything it has pointed at one sound.
  resonance: 'listening',
  // Tipped toward whoever is nearest, head out for contact.
  bond: 'leaning',
  // Down on the ground, weight off its legs, tucked into itself.
  stillness: 'curled',
}

// How far above an even share the top axis has to sit before the creature is
// doing anything in particular.
//
// Measured rather than picked. A group that presses every button in the
// catalogue evenly has a largest axis of +0.005, which is not that group
// leaning anywhere, it is the catalogue's own two percent of slack showing
// through. A group with a real habit sits an order of magnitude above that:
// nine actions in ten on one kind reads between +0.16 and +0.39 depending on
// the kind, and a group that only ever presses one button reads +0.37 and up.
// Two hundredths sits in the empty ground between them, so a genuine habit
// always moves the pose and no amount of even clicking ever does.
const LEAN_MIN = 0.02

/**
 * The pose, read off the pressures and nothing else.
 *
 * Ties break on the catalogue's own axis order rather than on whichever one a
 * loop happened to reach first, for the same reason trait credit does: two
 * screens showing the same creature standing differently is a bug with no
 * obvious place to look.
 */
export function deriveStance(pressures: Pressures): Stance {
  const values = new Array<number>(PRESSURE_AXES.length)
  for (let i = 0; i < PRESSURE_AXES.length; i++) values[i] = pressures[PRESSURE_AXES[i]]
  const shape = centredShape(values)

  let leader = 0
  for (let i = 1; i < shape.length; i++) {
    if (shape[i] > shape[leader]) leader = i
  }
  if (shape[leader] < LEAN_MIN) return 'standing'
  return STANCE_FOR[PRESSURE_AXES[leader]]
}
