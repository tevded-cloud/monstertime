// types.ts: the shared contract.
//
// Everything in MonsterTime is derived, never stored. The server keeps exactly
// two things per group: a secret seed and an ordered list of what people did.
// The creature is a pure function of those two, so any client can rebuild the
// identical animal, and a disagreement between two screens is a bug with one
// obvious place to look rather than a sync problem with none.
//
// Nothing in this file may import anything. Every other module depends on it.

// ---------------------------------------------------------------------------
// Pressures
// ---------------------------------------------------------------------------

// The eight ways a group's behaviour pushes on a creature. These are not
// stats and are never shown as numbers: they are the environment the genome
// is read against. Deliberately includes opposing pairs (bond/ferocity,
// vigor/stillness, roam/stillness) so a group cannot max everything by simply
// doing more. Doing everything is itself a shape, and a bland one.
export const PRESSURE_AXES = [
  'nourish',
  'vigor',
  'roam',
  'resonance',
  'craft',
  'bond',
  'ferocity',
  'stillness',
] as const

export type PressureAxis = (typeof PRESSURE_AXES)[number]

// Every axis present, values unbounded above 0. Read through normalise() in
// the dna module rather than compared raw.
export type Pressures = Record<PressureAxis, number>

// A single action's push. Sparse: absent axes mean zero.
export type PressureDelta = Partial<Record<PressureAxis, number>>

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const ACTION_KINDS = ['feed', 'train', 'explore', 'sing', 'give', 'tend'] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

// One thing a person can do, e.g. kind 'feed', id 'feed.emberfruit'. The
// catalogue of these lives in src/dna/actions.ts.
export interface ActionVariant {
  id: string
  kind: ActionKind
  label: string
  // One line, written to the person doing it, never describing the outcome.
  // The point is that nobody can read the mechanics off the button.
  blurb: string
  push: PressureDelta
  // Stage below which this variant is not offered.
  minStage?: number
}

// An action that actually happened. Server-authored: the client never invents
// id or at, because those decide ordering and ordering decides the creature.
export interface ActionRecord {
  id: string
  variantId: string
  actorId: string
  actorName: string
  at: number
}

// ---------------------------------------------------------------------------
// Genome
// ---------------------------------------------------------------------------

// The slots a creature can grow something in.
export const LOCI = ['horn', 'ear', 'wing', 'tail', 'spine', 'hide', 'eye', 'aura'] as const
export type Locus = (typeof LOCI)[number]

// An allele is one possible thing at one locus, e.g. 'horn.spiral'. Which
// alleles a group's creature *could* grow is fixed at hatch by the seed and
// never changes. Which ones it *does* grow is decided by pressure. Two groups
// with identical behaviour still diverge, because their carried alleles differ.
export type AlleleId = string

export interface Allele {
  id: AlleleId
  locus: Locus
  label: string
  // Pressure shape this allele answers to. Expression compares the group's
  // normalised pressures against this; closest carried allele wins the locus.
  affinity: PressureDelta
  // How much total pressure must exist on the affinity axes before this can
  // express at all. Keeps rare alleles rare.
  threshold: number
  // Earliest stage this can appear.
  minStage: number
}

export interface Genome {
  // Hex string, crypto-random per group, never sent to the client in full
  // until the creature is adult. It is the thing that makes two groups'
  // creatures incomparable.
  seed: string
  // The alleles this creature carries at each locus: its potential, not its
  // appearance. Typically 2-4 per locus out of a much larger pool.
  carried: Record<Locus, AlleleId[]>
}

// ---------------------------------------------------------------------------
// Expression
// ---------------------------------------------------------------------------

export interface ExpressedTrait {
  locus: Locus
  allele: AlleleId
  // Index into the action log at which this locked in, so the UI can say
  // when it happened and the timeline can replay it.
  atAction: number
  stage: number
  // Actor ids whose actions contributed most of the pressure that did it.
  // This is what makes a trait somebody's, and it is the whole emotional
  // payload of the app.
  credited: string[]
}

export const MORPHS = [
  'bulk',
  'neckLength',
  'limbLength',
  'snoutLength',
  'headSize',
  'eyeSize',
  'tailBase',
  'stance',
] as const
export type Morph = (typeof MORPHS)[number]

// Each 0..1. Continuous, unlike traits, so a creature drifts visibly between
// the discrete moments when a trait locks in.
export type Morphs = Record<Morph, number>

export const STAGES = ['egg', 'hatchling', 'juvenile', 'adolescent', 'adult'] as const
export type StageName = (typeof STAGES)[number]

// One person's standing with the creature.
export interface Bond {
  actorId: string
  actorName: string
  actions: number
  // Which axes this person personally pushed, so the app can say what they
  // are to the creature rather than just how much they clicked.
  contribution: Pressures
  firstAt: number
  lastAt: number
}

// A thing worth remembering, generated at evolution ticks and rare moments.
export interface Memory {
  id: string
  at: number
  atAction: number
  text: string
  actorIds: string[]
}

// The whole animal, derived. Never persisted.
export interface Creature {
  name: string | null
  stage: number
  stageName: StageName
  // 0..1 progress toward the next stage.
  stageProgress: number
  pressures: Pressures
  traits: ExpressedTrait[]
  morphs: Morphs
  bonds: Record<string, Bond>
  memories: Memory[]
  actionCount: number
}

// ---------------------------------------------------------------------------
// Wire
// ---------------------------------------------------------------------------

// What the server stores and sends. Small on purpose: a group that has been
// going for a year is still a few thousand short records.
export interface GroupSnapshot {
  groupId: string
  createdAt: number
  name: string | null
  genome: Genome
  actions: ActionRecord[]
}

// Server -> client.
export type ServerMessage =
  | { type: 'snapshot'; snapshot: GroupSnapshot; present: PresentActor[] }
  | { type: 'action'; action: ActionRecord }
  | { type: 'named'; name: string }
  | { type: 'present'; present: PresentActor[] }
  | { type: 'error'; message: string }

// Client -> server.
export type ClientMessage =
  | { type: 'hello'; actorId: string; actorName: string }
  | { type: 'act'; variantId: string }
  | { type: 'name'; name: string }

export interface PresentActor {
  actorId: string
  actorName: string
}
