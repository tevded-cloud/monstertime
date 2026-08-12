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
  // How grown the creature was when this happened, in growth points. Written by
  // the server, like id and at, and for the same reason: it decides which stage
  // the pressure landed in.
  //
  // This is how time gets into a creature that is a pure function of its log.
  // Growth accrues from elapsed hours as well as from things people do, and
  // stamping the total onto each row means a replay knows exactly how old the
  // animal was at every step without anybody consulting a clock.
  //
  // Absent on rows written before growth existed, and on fixtures that do not
  // care; readers fall back to the row's index, which is what growth was when
  // one action meant one point.
  growth?: number
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

/**
 * The shape of animal a creature is, decided at hatch and never changed.
 *
 * Taken from GameTev's bestiary, which declares every specimen against this
 * exact set, so the roster is selected rather than invented and each plan
 * arrives with recorded skeletons, proportion bands and gaits behind it. No
 * eighth plan without a specimen asking for one.
 *
 * BUILDABLE is what the forge can currently draw. The rest are named here on
 * purpose: the type is the roster, and a plan with no rig yet should be a
 * compile error waiting to happen rather than a surprise at runtime.
 */
export const BODY_PLANS = [
  'quadruped',
  'serpent',
  'multi-limb',
  'biped',
  'winged',
  'critter',
  'blob',
] as const
export type BodyPlan = (typeof BODY_PLANS)[number]

/** The plans a rig exists for today. Rolling only ever picks from these. */
export const BUILDABLE_PLANS: BodyPlan[] = ['quadruped', 'serpent']

export interface Genome {
  // Hex string, crypto-random per group. It is the thing that makes two groups'
  // creatures incomparable, and it is sent to every viewer on connect: the
  // renderer keys the whole world rebuild on it and derives the group's colours
  // and body proportions from it. An earlier version of this comment claimed the
  // seed stayed hidden until adulthood. That was never true, and it is recorded
  // here because somebody was one step away from building a hidden-roll feature
  // on an invariant that does not hold.
  seed: string
  // Which animal this is, before any question of what it grows. Rolled from
  // the seed and fixed for life, so a group's creature stays one animal that
  // changes while two groups get genuinely different animals.
  plan: BodyPlan
  // The alleles this creature carries at each locus: its potential, not its
  // appearance. How many are drawn is tuned in alleles.ts and trades off against
  // itself, so no count is quoted here: drawing too few leaves committed groups
  // permanently bare at a locus, and drawing too many hands every group the same
  // best answer and collapses two creatures into one.
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
  // What the group calls itself, so somebody can open the app and type it
  // instead of hunting for the link. Null until they pick one. Distinct from
  // `name`, which is the CREATURE's name: one is how you find the group, the
  // other is what the animal is called, and they are not the same thing.
  handle: string | null
  genome: Genome
  actions: ActionRecord[]
  // How grown the creature is right now, in growth points, as of the moment
  // this snapshot was made. Accrues from elapsed time as well as from what
  // people do, so a creature grows while every member has the app shut.
  //
  // Computed rather than stored, from a stored base plus the hours since: a
  // read never writes, which is what keeps growth free. Every client derives
  // from this one number, so nobody's clock is consulted and nobody disagrees.
  growth: number
  // How fast this group wants its creature to live, as a multiplier on the
  // hours. 1 is the default. A group that wants one interaction a day and a
  // long slow animal turns it down; a group that wants to raise one in an
  // evening turns it up.
  pace: number
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
