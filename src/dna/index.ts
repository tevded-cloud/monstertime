// dna: the genetics. Everything the rest of the app knows about what a
// creature could be, and everything it knows about reading a group's behaviour
// back into an animal.
//
// The whole module is pure. Given the same seed and the same ordered action
// log it returns the same creature on any machine, which is what lets the
// client render optimistically and the Durable Object stay a dumb, small log.

export { ALLELES, alleleById, rollGenome } from './alleles'
export {
  ACTION_METHODS,
  ACTION_VARIANTS,
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
