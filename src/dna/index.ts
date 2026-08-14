// dna: the genetics. Everything the rest of the app knows about what a
// creature could be, and everything it knows about reading a group's behaviour
// back into an animal.
//
// The whole module is pure. Given the same seed and the same ordered action
// log it returns the same creature on any machine, which is what lets the
// client render optimistically and the Durable Object stay a dumb, small log.
//
// Sleep is the one thing here that is not a function of the log, and it is
// exported from the same place on purpose: it is a function of the seed and an
// instant, the instant is an argument, and the server and the app have to call
// the identical copy of it or they will disagree about whether an action was
// allowed to happen.

export { ALLELES, alleleById, rollGenome } from './alleles'
export {
  ACTION_METHODS,
  ACTION_VARIANTS,
  allowedWhileAsleep,
  availableVariants,
  categoriesForKind,
  methodById,
  methodFits,
  methodsForKind,
  pastTense,
  pushOf,
  variantById,
} from './actions'
export { deriveCreature, emptyPressures, emptySubstance, stageOfGrowth } from './express'
export { lastRouseAt, rollActivity, ROUSE_MS, sleepState, sleepStateOf } from './sleep'
export type { SleepState } from './sleep'
export { deriveStance, STANCE_FOR } from './stance'
