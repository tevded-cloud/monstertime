// express.ts: turning a seed and a list of things people did into an animal.
//
// The model, in order:
//
// Every action carries a small push across two or three pressure axes. Folding
// the ordered log accumulates those pushes into the group's pressures, and at
// the same time into each person's own pressures, so the app can later say not
// just how much somebody did but what they were to the creature.
//
// Growth happens at ticks, not continuously. The first tick is only five
// actions in, because a group that gets nothing on day one has no reason to
// come back, and the later ones are far enough apart to feel earned. Past
// adult the ticks keep coming on a fixed interval, so a group that has been
// going for a year still has something ahead of them.
//
// At each tick every locus is resolved independently. Among the alleles the
// genome actually carries there, the ones old enough and with enough pressure
// behind them compete, and the winner is whichever one's affinity shape points
// most nearly the same direction as the group's own behaviour. The comparison
// is a correlation, not a dot product: both vectors are centred on an even
// spread first, so what decides a locus is where a group leaned, not how much
// it clicked. A group that does everything equally has no lean and grows the
// plain things, which is correct. Doing everything is a shape, and a bland one.
//
// Expression is sticky. A trait already locked in only loses its locus to a
// clearly better match, because a creature whose horns change every few
// minutes has no history, and history is the entire point.
//
// Credit is the part worth getting right. When a trait locks in, the people
// credited are the ones who actually supplied pressure on the axes that allele
// cares about, ranked and cut off once they account for most of it. Ties break
// on actor id, never on object key order, because two screens disagreeing about
// whose horns those are is the worst bug this app could have.
//
// Body proportions are the genome's side of the same reading. The same lean
// lands differently on two creatures, because each seed draws its own bias and
// stretch for every proportion, so two groups who fell into the same habit
// still get animals that stand differently. Behaviour still decides which way
// a proportion goes; the seed decides how far, and from where.
//
// Everything here is pure. No clock, no ambient state, and the only draws are
// from the group's own seed through the same generator the genome came from:
// the action timestamps come from the log, and the log comes from the server.
// The client and the Durable Object run this same function over the same
// inputs and must agree, so every decision that affects a trait is built from
// addition, multiplication, division and square root and nothing else. Those
// four are the operations IEEE 754 requires to be correctly rounded, which is
// the property that matters: each one returns the same bits on every engine.
// Division is in that list and is used all over this file, in centring a shape,
// in the cosine, in stage progress. The operations that genuinely do differ
// between engines are the transcendentals, because the standard never required
// them to agree, which is why nothing here calls exp, pow, log or a trig
// function and why the morphs use a rational curve rather than an exponential.

import { LOCI, MORPHS, PRESSURE_AXES, STAGES } from '../core/types'
import type {
  ActionRecord,
  Allele,
  AlleleId,
  Bond,
  Creature,
  ExpressedTrait,
  Genome,
  Locus,
  Memory,
  Morph,
  Morphs,
  PressureAxis,
  PressureDelta,
  Pressures,
  StageName,
} from '../core/types'
import { VARIANT_MEMORY, variantById } from './actions'
import { affinityShape, alleleById, centredShape, cosine } from './alleles'
import { makeRng } from './rng'

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

// Cumulative action counts at which each stage begins. Front loaded on purpose:
// five actions is one evening for a group of four, and the last stretch is
// long enough that reaching adult means something.
const STAGE_ACTIONS = [0, 5, 18, 48, 110]

// Past adult the creature keeps resolving on this interval. Nothing about a
// living thing should be finished.
const MOLT_EVERY = 40

// How much better a challenger has to be before it takes a locus off the
// allele already sitting there, plus a bonus the incumbent earns for every
// tick it survives. A trait that has been there since the creature was small
// is close to permanent, which is the point: the horns are supposed to be a
// record of something, not a readout.
const STICK_MARGIN = 0.22
const TENURE_BONUS = 0.03
const TENURE_CAP = 0.15

// The exception to stickiness. Several striking alleles point the same
// direction as the plain one at their locus and differ only in how much
// commitment they ask for: a moss ridge and a stillness bloom both answer to
// the same quiet, one just needs far more of it. Direction alone can never
// separate those, so the demanding version would be permanently locked out by
// the plain version that got there first. A challenger that asks for
// substantially more than the incumbent, and has already been paid for, is
// allowed to win on an equal match. That is not a trait flickering, it is a
// creature growing into what it already was. Only on an equal match, though,
// and only against an incumbent that is itself still in the running: see
// resolveLoci, which will not spend this on a trait the group has stopped
// supporting.
const ESCALATION_MAX = 0.45

// A locus stays bare rather than lock in something the group's behaviour points
// away from. The pace gate in hasEarned does the work of keeping striking traits
// rare; this only has to catch the case where a lean points the opposite way
// from everything a genome carries.
//
// The number is geometry, not taste, and getting it wrong here was expensive.
// Shapes are centred on an even spread, so two things with nothing to do with
// each other do not score zero against each other, they score below it: two
// single axis directions sit at exactly -1/(axes-1), and the median allele
// scores -0.14 against a habit picked at random. A floor of +0.04, which is
// what this was, therefore vetoed everything merely unrelated rather than
// everything opposed, and that veto was almost the whole of the permanent
// baldness. Measured at 470 actions, 56% of groups that gave nine times out of
// ten had a locus that never grew anything, and in 246 of 249 such cases that
// locus was carrying an allele that had been earned and was sitting just under
// the floor at -0.09. Set at the unrelated mark, a locus stays bare only while
// everything it carries points further away than two unrelated things do.
const FIRST_LOCK_MIN = -1 / (PRESSURE_AXES.length - 1)

// Share of the credited lean that the named people have to account for.
const CREDIT_SHARE = 0.6
const CREDIT_MAX = 3

// What it takes to be in the running for a name on a trait at all. A lean on
// its own is not enough: when three or four regulars split the work evenly
// their leans all sit near zero, so the entire positive-lean mass can be one
// specialised click from somebody who turned up once, and that person then
// takes the horns off the people who raised the thing. So a name also costs
// presence: more than a single action, and at least half of what an even share
// of the group's effort would have been by the time the trait locked. Anyone
// below that was a visitor, and putting a visitor's name on a trait makes every
// other name on every other trait worth less.
const CREDIT_MIN_ACTIONS = 2
const CREDIT_MIN_SHARE = 0.5

// Actions before somebody can be said to have kept doing something. The
// memories are written about habits, and two clicks is not a habit.
const KEPT_MIN_ACTIONS = 3

// Actions before the morphs reach full swing, so an egg is round and neutral
// and the body drifts as behaviour piles up.
const MORPH_WARMUP = 12

const AXIS_INDEX = {} as Record<PressureAxis, number>
for (let i = 0; i < PRESSURE_AXES.length; i++) AXIS_INDEX[PRESSURE_AXES[i]] = i

// ---------------------------------------------------------------------------
// Pressure maths
// ---------------------------------------------------------------------------

export function emptyPressures(): Pressures {
  const pressures = {} as Pressures
  for (const axis of PRESSURE_AXES) pressures[axis] = 0
  return pressures
}

function addDelta(target: Pressures, delta: PressureDelta): void {
  for (const axis of PRESSURE_AXES) {
    const amount = delta[axis]
    if (amount !== undefined) target[axis] += amount
  }
}

// Centring, the cosine and an allele's own shape all live in alleles.ts, next
// to the draw that has to agree with them: the genome is dealt on a promise
// about what a group will find an answer to, and the promise only holds while
// both halves measure "answers" the same way.
function pressureShape(pressures: Pressures): number[] {
  const values = new Array<number>(PRESSURE_AXES.length)
  for (let i = 0; i < PRESSURE_AXES.length; i++) values[i] = pressures[PRESSURE_AXES[i]]
  return centredShape(values)
}

// Raw accumulated pressure on the axes this allele answers to.
function affinityLoad(pressures: Pressures, allele: Allele): number {
  let load = 0
  for (const axis of PRESSURE_AXES) {
    const weight = allele.affinity[axis]
    if (weight !== undefined && weight > 0) load += pressures[axis]
  }
  return load
}

// Whether a group has actually paid for this allele.
//
// Two gates, and the second one matters more than it looks. The first is the
// threshold as written: enough pressure has to have landed on the axes this
// allele answers to. On its own that gate rots, because pressure only ever
// accumulates, so given a long enough group every allele eventually clears
// every threshold and rarity stops meaning anything.
//
// So the threshold also sets a pace: a rate that has to hold for the life of
// the creature, not just be reached once. The rate is read off the threshold
// and nothing else, which is the only way the ladder can be trusted. The
// earlier version divided the threshold by the action count of the allele's
// own minimum stage, and since that count is five for anything available at
// hatchling, a stage one uncommon asking for twelve was really asking for 2.4
// per action forever, which is more than any striking allele in the catalogue
// asks for. The rarity ladder ran backwards at every locus. Reading the pace
// off the threshold makes it monotone by construction: something that wants
// more in total also wants it faster, so nothing can be both cheaper and
// harder than the thing above it.
//
// The curve is square root rather than straight so the bottom of the ladder
// stays generous. A group that presses every button evenly runs at 1.26 on any
// pair of axes, which puts the plain things well inside reach, the rare
// ones at the edge of it and the striking ones out of it: not because an even
// group did too little, but because it never committed to anything. Doing
// everything is a shape, and this is where the shape gets read.
const PACE_BASE = 0.38
const PACE_SLOPE = 0.114

function hasEarned(pressures: Pressures, allele: Allele, count: number): boolean {
  const load = affinityLoad(pressures, allele)
  if (load < allele.threshold) return false
  if (count <= 0) return true
  const rate = PACE_BASE + PACE_SLOPE * Math.sqrt(allele.threshold)
  return load >= rate * count
}

// Affinity as weights summing to one, used for splitting credit.
function affinityWeights(allele: Allele): Record<PressureAxis, number> {
  const weights = {} as Record<PressureAxis, number>
  let total = 0
  for (const axis of PRESSURE_AXES) {
    const value = allele.affinity[axis]
    const positive = value !== undefined && value > 0 ? value : 0
    weights[axis] = positive
    total += positive
  }
  if (total > 0) {
    for (const axis of PRESSURE_AXES) weights[axis] = weights[axis] / total
  }
  return weights
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

function stageFor(count: number): number {
  let stage = 0
  for (let i = 1; i < STAGE_ACTIONS.length; i++) {
    if (count >= STAGE_ACTIONS[i]) stage = i
  }
  return stage
}

function isGrowthTick(count: number): boolean {
  if (count <= 0) return false
  for (let i = 1; i < STAGE_ACTIONS.length; i++) {
    if (count === STAGE_ACTIONS[i]) return true
  }
  const past = count - STAGE_ACTIONS[STAGE_ACTIONS.length - 1]
  return past > 0 && past % MOLT_EVERY === 0
}

// Progress toward the next growth tick rather than toward the next stage name,
// because past adult there is no next name but there is always a next tick.
function progressFor(count: number): number {
  const last = STAGE_ACTIONS[STAGE_ACTIONS.length - 1]
  if (count >= last) {
    return ((count - last) % MOLT_EVERY) / MOLT_EVERY
  }
  const stage = stageFor(count)
  const from = STAGE_ACTIONS[stage]
  const to = STAGE_ACTIONS[stage + 1]
  return (count - from) / (to - from)
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

interface ActorStat {
  actorId: string
  actorName: string
  actions: number
  contribution: Pressures
  firstAt: number
  lastAt: number
  variants: Map<string, number>
}

function orderedActors(actors: Map<string, ActorStat>): ActorStat[] {
  const list = [...actors.values()]
  list.sort((a, b) => (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0))
  return list
}

// Who actually grew this.
//
// Not whoever clicked the most. Somebody who took a third of the turns and
// supplied a third of everything shaped nothing in particular, and putting
// their name on the horns would make every name on every trait meaningless.
// So each person is scored on the axes this allele cares about, weighted by
// how much it cares, and then measured against their share of the group's
// effort. What earns a name is the gap: pushing these axes harder than you
// pushed anything else. The list stops once the people on it account for most
// of that gap, and ties break on actor id so the answer can never depend on
// which order a Map happened to be built in.
//
// The gap alone is not enough, though, which is the thing this got wrong for a
// long time. A lean is a ratio, and a ratio is loudest when the denominator is
// small, so somebody who turned up once and pressed one specialised button had
// the largest lean in the group by a distance and walked off with the horns.
// So the gap is only read among people who were actually there, and everybody
// else is dropped before any of it is measured.
function creditFor(allele: Allele, actors: Map<string, ActorStat>): string[] {
  const weights = affinityWeights(allele)
  const scored: { id: string; score: number; actions: number }[] = []
  let actionTotal = 0
  for (const actor of orderedActors(actors)) {
    let score = 0
    for (const axis of PRESSURE_AXES) {
      if (weights[axis] > 0) score += weights[axis] * actor.contribution[axis]
    }
    scored.push({ id: actor.actorId, score, actions: actor.actions })
    actionTotal += actor.actions
  }
  if (scored.length === 0 || actionTotal <= 0) return []

  // Multiplied out rather than divided so the floor is exact arithmetic on
  // both engines: actions / count >= share / people.
  const present = scored.filter(
    (entry) =>
      entry.actions >= CREDIT_MIN_ACTIONS &&
      entry.actions * scored.length >= actionTotal * CREDIT_MIN_SHARE,
  )
  // A group where nobody clears the floor is a group in its first evening.
  // Everybody is a visitor then, so fall back to reading the whole room.
  const pool = present.length > 0 ? present : scored

  // Leans are measured inside the pool, not against the whole log, so the
  // question is who among the people who were actually here pushed these axes
  // hardest. That is also what fixes the mirror case: somebody carrying nine
  // tenths of the group on their own is the only one in the pool, so the lean
  // that used to read as zero now resolves to them.
  let pressureTotal = 0
  let poolActions = 0
  for (const entry of pool) {
    pressureTotal += entry.score
    poolActions += entry.actions
  }
  if (pressureTotal <= 0 || poolActions <= 0) return []

  const leaning = pool
    .map((entry) => ({
      id: entry.id,
      lean: entry.score / pressureTotal - entry.actions / poolActions,
    }))
    .filter((entry) => entry.lean > 0)

  if (leaning.length === 0) {
    // One person on their own, or a group so evenly spread that nobody leaned.
    // The trait belongs to whoever put the most into it, and to nobody else.
    let best = pool[0]
    for (const entry of pool) {
      if (entry.score > best.score) best = entry
    }
    return best.score > 0 ? [best.id] : []
  }

  leaning.sort((a, b) => (b.lean !== a.lean ? b.lean - a.lean : a.id < b.id ? -1 : 1))
  let mass = 0
  for (const entry of leaning) mass += entry.lean

  const credited: string[] = []
  let running = 0
  for (const entry of leaning) {
    credited.push(entry.id)
    running += entry.lean
    if (credited.length >= CREDIT_MAX) break
    if (running >= mass * CREDIT_SHARE) break
  }
  return credited
}

// The thing the credited people kept doing that pushed on this allele's axes.
// Used to make a memory specific instead of decorative.
//
// Two things have to be true before an action gets named. It has to push the
// axis the allele actually leads on, not merely touch one of its minor ones:
// any relevance above zero was enough before, which is how the app came to say
// it grew milestone rings because somebody kept splitting ember-fruit, when
// milestone rings are roam and ember-fruit pushes no roam whatsoever. And the
// people being quoted have to have been around long enough for "kept" to be
// true of them. When either one fails there is no phrase at all, and the memory
// falls back to the plainer sentence, which is better than a specific lie.
function signatureVariant(
  allele: Allele,
  credited: string[],
  actors: Map<string, ActorStat>,
): string | null {
  // Everybody about to be named has to clear the bar, not just whoever
  // happens to supply the winning variant: the sentence says all of them kept
  // doing it, so one name in the list that did not makes the sentence false.
  for (const actorId of credited) {
    const actor = actors.get(actorId)
    if (actor === undefined || actor.actions < KEPT_MIN_ACTIONS) return null
  }
  const weights = affinityWeights(allele)
  let lead = 0
  for (const axis of PRESSURE_AXES) {
    if (weights[axis] > lead) lead = weights[axis]
  }
  const tally = new Map<string, number>()
  for (const actorId of credited) {
    const actor = actors.get(actorId)
    if (actor === undefined) continue
    for (const [variantId, count] of actor.variants) {
      const variant = variantById(variantId)
      if (variant === undefined) continue
      let relevance = 0
      let onLead = false
      for (const axis of PRESSURE_AXES) {
        const push = variant.push[axis]
        if (push === undefined || push <= 0 || weights[axis] <= 0) continue
        relevance += weights[axis] * push
        if (weights[axis] === lead) onLead = true
      }
      if (!onLead || relevance <= 0) continue
      tally.set(variantId, (tally.get(variantId) ?? 0) + relevance * count)
    }
  }
  let bestId: string | null = null
  let bestScore = 0
  for (const [variantId, score] of [...tally.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    if (score > bestScore) {
      bestScore = score
      bestId = variantId
    }
  }
  return bestId
}

// ---------------------------------------------------------------------------
// Memory copy
// ---------------------------------------------------------------------------

const STAGE_LINES: string[] = [
  '',
  'It cracked the shell open from the inside.',
  'It stopped fitting in two hands.',
  'It started going where it wanted.',
  'It stopped being something anyone could carry.',
]

const MOLT_LINES: string[] = [
  'It shed, and came back heavier.',
  'The way it stands changed overnight.',
  'It went quiet for two days, and then it was different.',
  'It grew again, slower this time.',
]

const AXIS_CLAUSE: Record<PressureAxis, string> = {
  nourish: 'By then it had mostly been fed.',
  vigor: 'By then it had mostly been worked.',
  roam: 'By then it had mostly been taken places.',
  resonance: 'By then it had mostly been sung to.',
  craft: 'By then it had mostly been given things.',
  bond: 'By then it had mostly been sat with.',
  ferocity: 'By then it had mostly been pushed.',
  stillness: 'By then it had mostly been left alone.',
}

function joinNames(names: string[]): string {
  if (names.length === 0) return 'nobody in particular'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function namesOf(ids: string[], actors: Map<string, ActorStat>): string[] {
  const names: string[] = []
  for (const id of ids) {
    const actor = actors.get(id)
    if (actor !== undefined) names.push(actor.actorName)
  }
  return names
}

// An aura is not something a creature grows, so it gets its own verb.
function growVerb(locus: Locus): string {
  return locus === 'aura' ? 'took on' : 'grew'
}

function dominantAxis(pressures: Pressures): PressureAxis {
  let best: PressureAxis = PRESSURE_AXES[0]
  let bestValue = -1
  for (const axis of PRESSURE_AXES) {
    if (pressures[axis] > bestValue) {
      bestValue = pressures[axis]
      best = axis
    }
  }
  return best
}

function busiestActors(actors: Map<string, ActorStat>): string[] {
  const list = orderedActors(actors)
  list.sort((a, b) =>
    b.actions !== a.actions ? b.actions - a.actions : a.actorId < b.actorId ? -1 : 1,
  )
  return list.slice(0, 3).map((actor) => actor.actorId)
}

// ---------------------------------------------------------------------------
// Morphs
// ---------------------------------------------------------------------------

// Which lean pushes each proportion which way. Read 0 as the low end of the
// name and 1 as the high end: bulk 0 is spare, bulk 1 is heavy. stance is the
// one that needs saying out loud, because the word does not imply a direction:
// 0 is low and settled, 1 is upright and squared off.
const MORPH_SHAPE: Record<Morph, { up: PressureAxis[]; down: PressureAxis[] }> = {
  bulk: { up: ['nourish', 'stillness'], down: ['vigor', 'roam'] },
  neckLength: { up: ['roam', 'resonance'], down: ['nourish', 'ferocity'] },
  limbLength: { up: ['roam', 'vigor'], down: ['nourish', 'stillness'] },
  snoutLength: { up: ['nourish', 'ferocity'], down: ['craft', 'resonance'] },
  headSize: { up: ['craft', 'resonance'], down: ['vigor', 'nourish'] },
  eyeSize: { up: ['stillness', 'resonance'], down: ['ferocity', 'vigor'] },
  tailBase: { up: ['nourish', 'bond'], down: ['roam', 'vigor'] },
  stance: { up: ['ferocity', 'vigor'], down: ['bond', 'stillness'] },
}

// A rational sigmoid rather than a logistic one. Same shape, but built from
// arithmetic that is exact on every engine, so two clients never disagree
// about the body by a hair.
function softStep(x: number): number {
  const scaled = x * 4.5
  const magnitude = scaled < 0 ? -scaled : scaled
  return 0.5 + 0.5 * (scaled / (1 + magnitude))
}

// How far a seed is allowed to move a proportion on its own, and how much it
// is allowed to stretch or damp the group's lean on that proportion. Sized
// against the leans real behaviour produces, which run to about four tenths:
// enough that two groups who did the same thing still stand differently, small
// enough that behaviour keeps deciding the direction. A group that feeds
// heavily is heavy on every seed, it is just heavy in its own way.
const MORPH_BIAS = 0.2
const MORPH_GAIN_MIN = 0.68
const MORPH_GAIN_SPAN = 0.72

interface MorphTuning {
  bias: number
  gain: number
}

// The body's share of the genome.
//
// Body shape used to be a pure function of what a group did, which meant it
// carried no identity at all: two groups with different seeds and the same
// habit came out with a body identical to six decimal places, so the thing
// that was supposed to separate groups who behave alike separated nothing.
// Drawing a bias and a gain per proportion from the seed makes the body a
// reading of behaviour through a particular animal, which is what it was
// always described as. Same seeded generator as the genome draw, so it stays
// integer arithmetic and the client and the Durable Object agree exactly.
function morphTuning(seed: string): Record<Morph, MorphTuning> {
  const rng = makeRng(`morph:${seed}`)
  const tuning = {} as Record<Morph, MorphTuning>
  for (const morph of MORPHS) {
    tuning[morph] = {
      bias: (rng.next() * 2 - 1) * MORPH_BIAS,
      gain: MORPH_GAIN_MIN + rng.next() * MORPH_GAIN_SPAN,
    }
  }
  return tuning
}

function deriveMorphs(genome: Genome, pressures: Pressures, count: number): Morphs {
  const shape = pressureShape(pressures)
  const tuning = morphTuning(genome.seed)
  const warmth = count >= MORPH_WARMUP ? 1 : count / MORPH_WARMUP
  const morphs = {} as Morphs
  for (const morph of MORPHS) {
    const spec = MORPH_SHAPE[morph]
    let lean = 0
    for (const axis of spec.up) lean += shape[AXIS_INDEX[axis]]
    for (const axis of spec.down) lean -= shape[AXIS_INDEX[axis]]
    // Bias sits inside the curve, so it shifts where the creature settles
    // without ever pushing a proportion outside its own range.
    const settled = softStep(lean * tuning[morph].gain + tuning[morph].bias)
    morphs[morph] = 0.5 + (settled - 0.5) * warmth
  }
  return morphs
}

// ---------------------------------------------------------------------------
// Expression
// ---------------------------------------------------------------------------

interface LockResult {
  locus: Locus
  allele: Allele
  replaced: Allele | null
}

// What a locus has already been through. Kept alongside the trait rather than
// on it, because ExpressedTrait is the shared contract and this is bookkeeping.
interface LocusLore {
  // Everything that has ever held this locus. A creature does not un-grow back
  // into something it used to be: without this, a group whose habits drift back
  // and forth swaps the same two horns for each other forever, and the trait
  // stops being a record of anything.
  past: Set<AlleleId>
  // Growth ticks the current trait has survived.
  tenure: number
}

function resolveLoci(
  genome: Genome,
  pressures: Pressures,
  stage: number,
  count: number,
  actors: Map<string, ActorStat>,
  traits: Map<Locus, ExpressedTrait>,
  lore: Map<Locus, LocusLore>,
): LockResult[] {
  const shape = pressureShape(pressures)
  const locked: LockResult[] = []

  for (const locus of LOCI) {
    const history = lore.get(locus) ?? { past: new Set<AlleleId>(), tenure: 0 }
    lore.set(locus, history)
    const current = traits.get(locus)
    if (current !== undefined) history.tenure += 1

    const carried = genome.carried[locus] ?? []
    const candidates: { allele: Allele; score: number }[] = []
    // Whether the trait sitting here is still something the group's behaviour
    // supports. It matters below: the escalation exception is only ever meant
    // to settle a tie between two live answers to the same lean.
    let heldIsLive = false
    for (const id of carried) {
      const allele = alleleById(id)
      if (allele === undefined) continue
      if (allele.minStage > stage) continue
      if (!hasEarned(pressures, allele, count)) continue
      if (allele.id !== current?.allele && history.past.has(allele.id)) continue
      if (allele.id === current?.allele) heldIsLive = true
      candidates.push({ allele, score: cosine(shape, affinityShape(allele)) })
    }
    if (candidates.length === 0) continue

    candidates.sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.allele.id < b.allele.id ? -1 : 1,
    )
    const best = candidates[0]

    if (current === undefined) {
      if (best.score < FIRST_LOCK_MIN) continue
      traits.set(locus, {
        locus,
        allele: best.allele.id,
        atAction: count,
        stage,
        credited: creditFor(best.allele, actors),
      })
      history.past.add(best.allele.id)
      history.tenure = 0
      locked.push({ locus, allele: best.allele, replaced: null })
      continue
    }

    if (best.allele.id === current.allele) continue
    const held = alleleById(current.allele)
    const heldScore = held === undefined ? -1 : cosine(shape, affinityShape(held))
    const earned = Math.min(TENURE_CAP, TENURE_BONUS * history.tenure)
    // Only when the incumbent is still a live candidate, which is the case the
    // exception was written for. If it has dropped out of the running the
    // challenger is not growing into what the creature already was, it is
    // replacing something the group stopped supporting, and there is no reason
    // to let it do that on a worse match than the one it is displacing.
    const escalation =
      heldIsLive && held !== undefined && best.allele.threshold > held.threshold
        ? ESCALATION_MAX *
          Math.min(1, (best.allele.threshold - held.threshold) / held.threshold)
        : 0
    if (best.score <= heldScore + STICK_MARGIN + earned - escalation) continue

    traits.set(locus, {
      locus,
      allele: best.allele.id,
      atAction: count,
      stage,
      credited: creditFor(best.allele, actors),
    })
    history.past.add(best.allele.id)
    history.tenure = 0
    locked.push({ locus, allele: best.allele, replaced: held ?? null })
  }

  return locked
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1)
}

// Several loci often lock on the same tick, so the phrasing rotates. Six
// identical sentences in a row would read as a form letter and undo the work
// the sentences are doing. The rotation is picked from the locus and the action
// count, so it is stable: replaying the same log writes the same words.
function traitMemory(
  result: LockResult,
  trait: ExpressedTrait,
  actors: Map<string, ActorStat>,
  at: number,
  count: number,
): Memory {
  const names = joinNames(namesOf(trait.credited, actors))
  const variantId = signatureVariant(result.allele, trait.credited, actors)
  const phrase = variantId === null ? null : (VARIANT_MEMORY[variantId] ?? null)
  const label = result.allele.label
  const turn = (count + LOCI.indexOf(result.locus)) % 3

  let text: string
  if (result.replaced !== null) {
    if (phrase === null) {
      text = `It traded ${result.replaced.label} for ${label}. That was mostly ${names}.`
    } else if (turn === 0) {
      text = `It traded ${result.replaced.label} for ${label}, the month ${names} kept ${phrase}.`
    } else {
      text = `${capitalise(label)} came in where ${result.replaced.label} had been. ${names} kept ${phrase}.`
    }
  } else if (phrase === null) {
    text = `It ${growVerb(result.locus)} ${label}. That was mostly ${names}.`
  } else if (turn === 0) {
    text = `It ${growVerb(result.locus)} ${label} the week ${names} kept ${phrase}.`
  } else if (turn === 1) {
    text = `${names} kept ${phrase}. It ${growVerb(result.locus)} ${label}.`
  } else {
    text = `Nobody planned ${label}. ${names} kept ${phrase}, and there it was.`
  }

  return {
    id: `t.${result.locus}.${count}`,
    at,
    atAction: count,
    text,
    actorIds: [...trait.credited],
  }
}

function stageMemory(
  stage: number,
  pressures: Pressures,
  actors: Map<string, ActorStat>,
  at: number,
  count: number,
): Memory {
  const past = count - STAGE_ACTIONS[STAGE_ACTIONS.length - 1]
  const opening =
    past > 0
      ? MOLT_LINES[(Math.floor(past / MOLT_EVERY) - 1) % MOLT_LINES.length]
      : STAGE_LINES[stage]
  return {
    id: `s.${count}`,
    at,
    atAction: count,
    text: `${opening} ${AXIS_CLAUSE[dominantAxis(pressures)]}`,
    actorIds: busiestActors(actors),
  }
}

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------

export function deriveCreature(
  genome: Genome,
  actions: ActionRecord[],
  name: string | null,
): Creature {
  const pressures = emptyPressures()
  const actors = new Map<string, ActorStat>()
  const traits = new Map<Locus, ExpressedTrait>()
  const lore = new Map<Locus, LocusLore>()
  const memories: Memory[] = []

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const count = i + 1
    const variant = variantById(action.variantId)

    let actor = actors.get(action.actorId)
    if (actor === undefined) {
      actor = {
        actorId: action.actorId,
        actorName: action.actorName,
        actions: 0,
        contribution: emptyPressures(),
        firstAt: action.at,
        lastAt: action.at,
        variants: new Map<string, number>(),
      }
      actors.set(action.actorId, actor)
    }
    // The most recent name wins, so somebody who renames themselves is not two
    // people in the bond list.
    actor.actorName = action.actorName
    actor.actions += 1
    actor.lastAt = action.at

    // An unrecognised variant still counts as somebody showing up, it just does
    // not push anything. Old logs stay replayable when the catalogue changes.
    if (variant !== undefined) {
      addDelta(pressures, variant.push)
      addDelta(actor.contribution, variant.push)
      actor.variants.set(variant.id, (actor.variants.get(variant.id) ?? 0) + 1)
    }

    if (count === 1) {
      const phrase = variant === undefined ? null : (VARIANT_MEMORY[variant.id] ?? null)
      memories.push({
        id: 'a.first',
        at: action.at,
        atAction: 1,
        text:
          phrase === null
            ? `${actor.actorName} got to it first.`
            : `${actor.actorName} started it off, ${phrase}.`,
        actorIds: [actor.actorId],
      })
    }

    if (isGrowthTick(count)) {
      const stage = stageFor(count)
      const locked = resolveLoci(genome, pressures, stage, count, actors, traits, lore)
      memories.push(stageMemory(stage, pressures, actors, action.at, count))
      for (const result of locked) {
        const trait = traits.get(result.locus)
        if (trait === undefined) continue
        memories.push(traitMemory(result, trait, actors, action.at, count))
      }
    }
  }

  const count = actions.length
  const stage = stageFor(count)

  const bonds: Record<string, Bond> = {}
  for (const actor of orderedActors(actors)) {
    bonds[actor.actorId] = {
      actorId: actor.actorId,
      actorName: actor.actorName,
      actions: actor.actions,
      contribution: actor.contribution,
      firstAt: actor.firstAt,
      lastAt: actor.lastAt,
    }
  }

  const expressed: ExpressedTrait[] = []
  for (const locus of LOCI) {
    const trait = traits.get(locus)
    if (trait !== undefined) expressed.push(trait)
  }

  return {
    name,
    stage,
    stageName: STAGES[stage] as StageName,
    stageProgress: progressFor(count),
    pressures,
    traits: expressed,
    morphs: deriveMorphs(genome, pressures, count),
    bonds,
    memories,
    actionCount: count,
  }
}
