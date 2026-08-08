// The forge's public face. Everything else in here is an implementation
// detail that is expected to be replaced when authored assets arrive.
//
// The registry is re-exported alongside the view because it is the seam a
// future GLB loader plugs into, and a seam nobody can find is not a seam.

export { CreatureView } from './view'
export { PART, type PartBuilder, type PartOpts } from './registry'
