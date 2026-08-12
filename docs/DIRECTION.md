# MonsterTime: where this is going

Written 2026-08-11, from a long design conversation after the app went live.
`RESUME.md` says what exists and what state it is in. This says what it is
becoming and, more importantly, WHY each call was made, because the reasons are
the part that gets lost.

Nothing here is built yet except where it says so.

---

## 1. The problem this all comes from

Two creatures from two different groups were put side by side. They were the
same animal in different paint: four legs, long neck, long tail, back plates,
horns. The catalogue has 91 alleles and it is a lot of variety, applied to one
dragon.

The cause is three layers below the alleles:

- `body.ts` builds exactly four limbs and nine segments, and its own header
  states the rule: "one body, deformed. Never a different body per creature."
- All eight morphs are quadruped proportions. They vary a quadruped. Nothing in
  them can change what it is.
- All eight loci are beast trim: horn, ear, wing, tail, spine, hide, eye, aura.
  There is no locus for leg count, fins, antennae, shell, tentacles or beak.

So the reachable shape space is "quadruped, optionally horned, winged, plated".
Adding alleles cannot fix that. The rig has to open up first.

---

## 2. Settled

### 2.1 Body plans, three first, seven the target

GameTev's bestiary already declares body plans from a fixed set of seven:
`quadruped`, `biped`, `multi-limb`, `serpent`, `winged`, `critter`, `blob`.
Fourteen specimens are written against it, each carrying a segment table,
proportion bands, a gait repertoire, a movement envelope and activity data.

**This is a selection problem, not an invention problem.** No eighth plan, and
no invented proportion ranges: they come off the specimens. The standing rule
applies, a trait with no recorded frequency is never rolled, only named.

Ship three first (`quadruped`, `serpent`, `multi-limb`) because they are the
most visibly distant from each other and cover ten of the fourteen specimens.
Seven is the target rather than a maybe. Bugs and birds are not a new category:
`multi-limb` is insects, arachnids and crustaceans and is already in the first
three, and `winged` is birds.

Cost shape: the architecture is paid once and is the expensive part (L). Each
plan after it is about M and gets cheaper as the pattern settles. The art does
not follow that curve, see 5.1.

### 2.2 Time drives growth, and the server writes it into the log

The creature is a pure function of its seed and its ordered action log. That is
what lets every phone and the server agree without syncing anything, and it is
what all 105 tests rest on. Growth from elapsed time appears to break it.

It does not, if the server writes the time in. The Durable Object wakes on an
alarm, appends a growth record, and goes back to sleep. Time enters as entries
in the log, the creature stays a pure function of that log, `src/dna` stays free
of clocks, and the purity test goes on passing. It genuinely grows while every
member has the app closed.

This was argued the other way twice before it was argued correctly. The earlier
answer was describing today's behaviour and defending it, which was not the
question.

### 2.3 The 5000 action cap gets reworked

It is a cost bound, not a design decision: "a log with no bound is a bill with
no bound". The "its life is complete" framing was built on top of a technical
limit and then read back as intent.

Time-driven growth forces the issue, since the server will write rows too. The
answer is to stop keeping every row forever: fold old actions into a checkpoint
(accumulated pressures plus trait history at action N) and replay from there.
Deterministic, unbounded life, bounded storage.

### 2.4 Accounts, by magic link

**This overturns locked decision 4 in `RESUME.md` ("No accounts").** That
decision was right for an app whose only shared state was a creature. It does
not survive an economy: coins, tickets, purchases and votes on top of a
self-asserted `actorId` are forgeable by clearing local storage.

Sign-in is passwordless, by emailed link, and the session persists.

**Signing in is for acting, not for looking.** Opening a group link and watching
the creature stays frictionless and anonymous, because that is how this app
spreads. An account is what lets somebody act, hold coins, vote and keep a list
of their groups. That line also closes the impersonation hole recorded in
`worker/README.md`: trait credit becomes trustworthy, and credit is the entire
emotional payload of the product.

### 2.5 The substance channel

Today an action carries one thing: how the group behaved. Feeding pushes
`nourish`. Colour comes from `paletteForSeed`, the seed and nothing else. So
strawberries and fish are the same action in different words, and an expanded
activity list would be 300 buttons that are aliases of 36.

So an action now carries two things:

- **Method** (thrown to it, put in a bowl, from your hand) feeds the eight
  pressure axes. This is what pressure already is: the relationship.
- **Category and item** (fruit, then strawberry) feeds a second channel into
  material, colour, density and size, which is seed-locked today and therefore
  inert.

How you treat it shapes its temperament. What goes into it shapes its body.
That is what makes an expanded activity list real rather than cosmetic, and it
is what makes a beastpedia entry worth reading: it is that colour because of
what the group fed it, not because of a dice roll at hatch.

**Balance has to become compositional.** The 36 pushes today are hand authored
so that each axis lands within four percent of even across the catalogue, and
that balance is load bearing. Hundreds of leaves cannot be hand balanced. The
push is composed from category, item and method, so balance is a property of a
few dozen components rather than of every leaf.

### 2.6 Resetting existing creatures is accepted

Changing `rollGenome` to add a plan axis changes what every existing group has.
That is accepted rather than versioned. It is early and there are few groups.

---

## 3. The economy

Money out is eggs and food. Money in is jobs and selling. Votes decide both.
All of it is group scoped, which is the important part: the group buys the egg,
splits the payday, votes to sell, and holds the collection. Only "my groups"
and anything traded between groups needs identity to reach across.

Shape, not yet designed in detail:

- A group forms first and everyone is invited before anything is bought, so the
  creature belongs to the group rather than to whoever made it. This is the
  point of the whole feature.
- Eggs are chosen together from a few on offer at different prices, with
  visible differences (colour, and whatever else is decided pre-hatch) so there
  is a reason to want a particular one. How the cost is shared, evenly or by
  what each person offers, is open.
- Food costing money makes the substance channel bite. **Scarcity must change
  what the creature becomes, not whether it thrives.** A broke group with a
  starving animal is a bad feeling to build into something whose whole appeal
  is affection.
- Jobs are the engine, and they also answer a question nothing else does: there
  is currently nothing to do after adult.
- Selling a grown one is the only irreversible group decision in the design. It
  means selling something with your friends' names written through it, so it
  needs real weight rather than a majority click, and the chronicle already
  exists to remember it forever.

**Tonal fork worth deciding deliberately:** today the creature is an end in
itself. Give it a wage and it is partly an instrument. That is a legitimate
direction and plenty of games are built on it, but it is a different feeling and
it is easier to choose now than to notice in three months.

---

## 4. The rest, agreed but not yet designed

- **Pace is the group's dial.** One interaction a day for depth, or a twenty
  hour sprint to adulthood. Cheap once time-driven growth exists. Hatching runs
  on a clock that interaction accelerates, with diminishing returns.
- **Poses, sleep and moods.** A named-state machine with real transitions
  replacing one-shot pulses. Poses are per rig, so this is designed against two
  body plans from the start or it gets rebuilt. Gaits and resting postures come
  off the bestiary. Sleep is not a property of the creature, it is a property of
  right now, so it lives in the worker and the UI and never in `src/dna`.
- **Waking is a choice, not an accident.** Quiet actions may wake it, loud ones
  startle it, and the cost of each is part of the mood system.
- **Sleep schedule** derives from the animal the creature draws on, and the
  bestiary carries activity data for all fourteen specimens.
- **Status is shown, not stated.** Bored, hungry, wanting attention, content.
  `emotional respone research.md` on the Desktop is the method: it is written
  about human NPCs for another project, but its governing principle is exactly
  right here, that you are not simulating psychology, you are building a visual
  language of signals the player learns to read. Its idle micro-motion section
  is the difference between a living creature and a model that sits there.
- **A beastpedia entry** per creature: size, colours, phenotype, personality,
  preferences, who caused what. Mostly a rendering job over data that already
  exists, with three genuine gaps: morphs are 0..1 and have no real units,
  colours have no names, and personality is not modelled. It should read like a
  bestiary specimen report, because that is the house format and there are
  fourteen of them to copy.
  Worth separating what the creature IS from what the group DOES to it. "Prefers
  to be sung to" and "gets sung to a lot" are different sentences and the
  interesting case is when they disagree.
- **The chronicle gets its own button** instead of being buried in the group
  panel.
- **Ambience and music**, in ColorTime's spirit, medieval in flavour. Layered
  authored stems mixed by creature state is the reliable route and matches the
  authored-assets rule. Fully generative music is the same class of thing as
  procedural art, which is a rejected method for visuals on this account. Open
  whether that rejection extends to audio.

---

## 5. What will actually decide the scope

### 5.1 The art, not the engineering

Every visible piece of the creature is drawn by code today. That method was
tested and rejected on this account, so the endgame is a person authoring each
piece as a model. It is 91 pieces for one body plan. A beetle's leg is not a
reskin of a dragon's leg, so plans multiply the count rather than sharing it.

Nothing in this document is limited by how hard the code is. It is limited by
that number.

### 5.2 Accounts touch the whole domain

tevded.com serves fifteen apps from one Worker. An auth system living there
either serves all of them, which is a large win, or has to be deliberately
fenced to this one. Decide which before building it, not after.

### 5.3 It is not a simple little game any more

That is fine and it is the right direction. It does change what finished means,
and it is worth saying out loud once.

---

## 6. Order of work

1. ~~**Body plan spike.**~~ Done. Two rigs, `quadruped` and `serpent`, plan
   rolled from its own rng stream so a third can be added without rerolling
   every existing group. The question it was built to answer, whether two
   groups read as different animals or the shared material treatment makes even
   a snake look like a dragon, is still awaiting a verdict by eye.
2. ~~Poses and sleep, designed against both rigs.~~ Done. A creature keeps its
   own hours (diurnal, nocturnal or crepuscular, rolled from the seed), the
   server refuses everything except waking it while it is down, and waking it is
   an ordinary action that takes manners. Idle stance comes off the dominant
   pressure axis. **The next unit is the one this uncovered**, see 7.0 below:
   the genome is re-rolled from the seed on every read, so the action catalogue
   is production state and adding a variant re-deals live creatures. There is a
   pin gate on it now; the real fix is to freeze the genome at creation, and
   that is a migration over every existing group, so it gets its own unit.
3. ~~Time-driven growth and the log rework~~, which unlocked the pace dial.
4. ~~Accounts.~~ Landed as passcodes instead, which retired the whole
   dependency: the server mints a code, keeps only its hash, and shows it once.
5. ~~The substance channel and the expanded activity tree.~~ Both done. The
   tree is three levels, and the split underneath it is the part worth keeping
   in mind for everything that comes after: an ITEM says what went into the
   creature and pushes nourish and body, a MANNER says how it was done and only
   ever pushes the relationship axes, at a third the weight. Manners inside one
   kind sit on three different axes on purpose, so the leaves balance
   compositionally and nobody has to hand-tune them. That is what makes the
   tree extensible: a new shelf of items is a content decision, and the
   measurement in `test/dna/tree.test.ts` is what says whether it was a good
   one.
6. ~~The beastpedia.~~ Done.

---

## 7. Still open

0. Should the genome be frozen at creation instead of re-rolled on every read?
   Freezing it kills a whole class of accident (a content edit quietly changing
   what living creatures carry) at the cost of a migration touching every group,
   which has to reproduce today's roll exactly or it causes the very thing it
   prevents. Recommended, as its own unit with its own skeptic pass.
0b. Is the manner layer worth its extra tap? It is one point against an item's
   three to five, and it changes which trait wins in 175 of 200 groups, so it
   is not decoration. Whether it feels like a decision or like friction on a
   45 second cooldown is a question only using it answers.
1. Does the group set the body plan by what it does before the egg hatches, or
   does the plan come from the seed alone? A longer egg phase only earns its
   keep under the first answer.
2. Does the creature earn its keep, or is it an end in itself? See the tonal
   fork in section 3.
3. Does the rejection of generated art extend to generated audio?
4. Does auth serve all of tevded.com or only this app?
