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
// Substance
// ---------------------------------------------------------------------------

// What has actually gone INTO the creature, as opposed to what was done to it.
//
// The eight pressure axes describe a relationship: fed, worked, sung to, left
// alone. They are about behaviour, and behaviour is what decides which traits
// grow. That leaves nowhere for the difference between a strawberry and a fish
// to land, because both are simply "nourish", and colour comes from the seed
// alone. So an activity list with four hundred leaves in it would have been
// four hundred buttons that are aliases of thirty six: a choice that looks like
// it matters and does not.
//
// These four are that missing half. How a group treats the creature shapes its
// temperament; what the group puts into it shapes its body. They are read by
// materials.ts rather than by expression, so substance never competes with
// behaviour over a trait: the two channels answer different questions and are
// never asked the same one.
export const SUBSTANCE_AXES = ['ember', 'verdure', 'brine', 'mineral'] as const
export type SubstanceAxis = (typeof SUBSTANCE_AXES)[number]

/** Every axis present, 0 upward. Read normalised, never raw. */
export type Substance = Record<SubstanceAxis, number>

/** What one action puts in. Sparse: absent axes mean nothing of that went in. */
export type SubstanceDelta = Partial<Record<SubstanceAxis, number>>

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
  // What this puts INTO the creature, if anything. Feeding it and giving it
  // things do; singing to it does not. Absent means nothing goes in, which is
  // most of the catalogue and is correct: sitting quietly with an animal
  // changes what it is like, not what it is made of.
  gives?: SubstanceDelta
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
  // What has gone into it, accumulated over the whole log. Drives colour and
  // material rather than traits, so a group can see what they have been
  // feeding it without it competing with what they have been doing to it.
  substance: Substance
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
  // The one time a passcode is ever sent anywhere. Only the hash is kept, so
  // this is the only moment it exists outside the browser that asked for it.
  | { type: 'claimed'; actorId: string; code: string }

// Client -> server.
export type ClientMessage =
  | {
      type: 'hello'
      actorId: string
      actorName: string
      // A Firebase ID token, when this person has signed in. Optional, and the
      // app works without it: somebody who has not signed in is a guest whose
      // actorId is whatever their browser made up, exactly as before.
      //
      // When it IS present and verifies, the server ignores the actorId sent
      // alongside it and issues its own. A signed-in person does not get to say
      // who they are, which is the entire difference between the two.
      token?: string
      // The code that says which member of this group this is. Presented on
      // every connect once somebody has one; absent for a guest who has not
      // claimed a place yet.
      code?: string
    }
  | { type: 'act'; variantId: string }
  | { type: 'name'; name: string }
  // How fast this group wants its creature to live. Anybody in the group may
  // set it: there are no roles here, and a pace one person imposed on everybody
  // else would be the first thing in this app that belonged to one member.
  | { type: 'pace'; pace: number }
  // Claim a place in this group, minting a code that says this is you. Answered
  // once, to the asker alone, and never obtainable again.
  | { type: 'claim' }

export interface PresentActor {
  actorId: string
  actorName: string
}
