// registry.ts: the seam between gameplay and art.
//
// EVERYTHING THE BUILDERS IN parts.ts PRODUCE IS A PLACEHOLDER. It is code
// generated geometry, which is exactly the thing that does not ship. It exists
// so the rest of the app can be built, played and judged before a single asset
// arrives, and it is meant to be deleted.
//
// The replacement is hand authored GLB parts. A loader registers a builder
// under the same allele id, that builder returns the loaded Object3D instead of
// assembling primitives, and nothing else in the codebase changes: no gameplay
// file, no dna file, no UI file, not even view.ts, because every visible piece
// of a creature is fetched from this table by allele id and by nothing else.
//
// The one thing outside the table is the body itself, which body.ts builds and
// deforms. That is a separate seam for the same reason (an authored skinned
// mesh drops in there later), and it is separate because the body is the rig
// the parts hang off, not a part.
//
// THE SOCKET CONTRACT, which authored parts must also honour:
//   A part is built in socket local space.
//   +Y is the direction the part grows away from the body.
//   +Z is the direction the creature is facing.
//   The socket already carries the anatomy's scale, so 1 unit is one socket
//   width: about one head width at the head, one body width at the flank. A
//   builder that draws a horn 1.2 long gets a horn slightly longer than the
//   skull is wide, on every creature, at every stage, without asking.

import * as THREE from 'three'
import type { AlleleId, Locus } from '../core/types'
import type { MaterialKit, Palette } from './materials'

export interface PartOpts {
  alleleId: AlleleId
  locus: Locus
  palette: Palette
  materials: MaterialKit
  // -1 for the left member of a mirrored pair, +1 for the right, 0 when the
  // part is unique. A builder may ignore it; asymmetric parts should not.
  side: number
  // Position in a run of sockets, for example which plate along the spine.
  index: number
  count: number
  // How grown the creature is, 0 at hatching and 1 at adult. A part reads
  // bigger on an older animal without needing a second allele.
  growth: number
  // Deterministic per creature randomness. Two groups carrying the same allele
  // still get visibly different horns out of it.
  rand: () => number
}

export interface PartBuilder {
  (opts: PartOpts): THREE.Object3D
}

const builders = new Map<AlleleId, PartBuilder>()

export const PART = {
  get(alleleId: AlleleId): PartBuilder | undefined {
    return builders.get(alleleId)
  },
  register(alleleId: AlleleId, build: PartBuilder): void {
    builders.set(alleleId, build)
  },
}

// Ids that currently have a builder. The orchestrator and a dev check can use
// this to prove every allele the dna module defines is covered.
export function registeredIds(): AlleleId[] {
  return [...builders.keys()].sort()
}

const warned = new Set<AlleleId>()

// A trait the group actually grew, rendered as nothing, is the worst possible
// failure: it looks like the game is broken and it looks like the group's
// action did not count. So an unknown id gets a stub that is impossible to
// mistake for finished art, plus one console line naming the id.
export const FALLBACK_PART: PartBuilder = (opts) => {
  if (!warned.has(opts.alleleId)) {
    warned.add(opts.alleleId)
    console.warn(`[forge] no part builder registered for "${opts.alleleId}" (${opts.locus}), drawing a stub`)
  }
  const group = new THREE.Group()
  group.name = `stub:${opts.alleleId}`

  const spike = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), opts.materials.keratin)
  spike.scale.set(0.8, 2.2, 0.8)
  spike.position.y = 0.34
  spike.castShadow = true
  group.add(spike)

  // The band is the tell. Finished parts never carry one, so a stub is never
  // mistaken for a part somebody meant to look like that.
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 4, 8), opts.materials.glow)
  band.rotation.x = Math.PI / 2
  band.position.y = 0.2
  group.add(band)

  return group
}

// Two loci are not sockets. A hide allele is a surface treatment applied by
// materials.ts and has no mesh of its own, and an aura is built in creature
// root space rather than at a socket, where 1 unit is about one body length.
// Both still go through the table, so PART.get is total over every allele the
// dna module defines and an authored decal or effect can replace either.

export function builderFor(alleleId: AlleleId): PartBuilder {
  return builders.get(alleleId) ?? FALLBACK_PART
}
