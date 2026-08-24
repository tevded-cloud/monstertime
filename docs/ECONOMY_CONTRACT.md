# MonsterTime economy contract

Status: proposed build contract, not implemented
Research and planning date: 2026-08-23
Applies to: `D:\Programs\monstertime`

This document turns the economy direction in `docs/DIRECTION.md` and the
2026-08-23 focused external research into testable product promises. It is the
authority for what the economy is allowed to do to a group and its creature.
`RESOURCE_MAP.md` owns the resources and flows; `ECONOMY_VERTICAL_SLICE.md`
owns the first playable proof; `ECONOMY_MODEL.md` owns candidate numbers and
stress cases.

Nothing in this package is implemented yet. The existing uncommitted market
wave must typecheck, test, build, and land before economy code starts.

## 1. Product thesis

The creature is a shared relationship that sometimes creates economic
opportunities. It is not a shared economic asset that has to earn its keep.

The economy exists to produce three things:

1. reasons to keep doing things with an adult creature;
2. group choices whose consequences become part of that creature; and
3. specific memories about who helped, what the creature did, and what the
   group chose.

Coins are scaffolding around those experiences. A higher balance is not the
point of play, and income per minute is not a score.

## 2. Locked promises

These are acceptance rules, not aspirations.

### 2.1 Care never becomes debt

- Zero coins cannot starve, injure, sicken, erase, or permanently weaken a
  creature.
- Ordinary food and ordinary self-care remain available without money.
- No missed-care backlog accumulates while the group is away.
- Returning after any absence produces an interesting current state, never a
  bill, warning, streak loss, or account of suffering caused by absence.
- Nobody is told that another member failed the creature by not opening the app.

### 2.2 Needs are inclinations, not deficit meters

The initial state vocabulary is small:

- interested in food;
- seeking stimulation or novelty;
- seeking company;
- wanting quiet or rest; and
- content.

An unanswered state resolves or transforms naturally. For example, a creature
interested in food may eat an ordinary meal, lose interest, become curious
about something else, or settle down. It does not silently lose health.

State is shown through pose, attention, movement, sound, and available
interactions. An always-on hunger bar is not the default presentation.

### 2.3 Paid food is expressive

Paid food may change:

- substance inputs and later expression;
- preferences;
- immediate reactions;
- memories;
- the available approach to a later activity; or
- a temporary positive mood.

It may not be required to return the creature from danger to neutral. Scarcity
changes what the creature becomes and which interesting choice the group makes;
it never decides whether the creature thrives.

### 2.4 Work is something done with the creature

The first jobs are called commissions or outings. The creature notices or
responds to an opportunity, the group chooses whether to take it, and at least
one member undertakes it with the creature.

The first implementation must not contain:

- passive coins per hour;
- a creature sent away to work while the group does nothing;
- job stamina;
- a daily completion streak;
- punishment for ignoring an offer; or
- large wage multipliers that turn a phenotype into an optimal income build.

Traits should primarily change what happens and how it is remembered. Any coin
difference is secondary and deliberately narrow.

### 2.5 Adulthood remains relational

An adult creature remains worth opening the app for when no commission is
available. It can still react, rest, develop preferences, revisit places,
receive care, reveal new behavior, and accumulate memories.

Breeding, selling, or a job catalogue cannot be used to conceal an empty adult
relationship.

### 2.6 The economy is group scoped

- There is one currency in the first economy: coins.
- Coins never move between groups in the first release.
- There is no player marketplace, exchange rate, premium currency, or
  real-money purchase.
- The leading ownership design is one shared spendable treasury.
- Every earning and spend retains provenance: which members participated, which
  creature was involved, what happened, and when.
- Provenance appears as a concrete Chronicle memory. It is not a leaderboard or
  a contribution score.

Shared treasury is the build hypothesis, not an evidence-free permanent lock.
The required wallet playtest compares it against personal group-bound purses
and pledges before the persistence schema is declared final.

## 3. Participation contract

Participation is additive, not corrective.

If Ana plays and Bo does not, Ana may create a memory, contribute an approach,
or move a proposal forward. Bo misses that experience. Bo does not return to a
sick creature, a debt, or a message blaming the absence.

The system does not attempt to equalize friends by:

- activity quotas;
- top-contributor rewards;
- exclusive economic power for the most active member;
- payouts multiplied directly by participant count;
- reduced creature quality for uneven participation; or
- mandatory simultaneous presence.

A commission must be completable by one member. More members add perspectives,
approaches, names, reactions, or authored texture rather than simply multiplying
the payout.

## 4. Spending and consent

MonsterTime has three decision classes. They must not share one generic voting
rule.

### 4.1 Free ordinary care

Ordinary care costs nothing and requires no vote. A member can offer ordinary
food, company, quiet, or stimulation through the existing action system.

### 4.2 Reversible expressive spending

Special food is an expressive group choice. The first vertical slice must test
a lightweight asynchronous proposal instead of forcing every group to be
online together.

The proposal shows:

- the food in plain language;
- its coin cost;
- the broad kind of influence it may have, without exposing hidden DNA math;
- who proposed it;
- who currently supports it; and
- what happens if it does not resolve.

Failure to resolve never blocks ordinary feeding. The exact support/quorum rule
is a playtest decision owned by `ECONOMY_MODEL.md`, not a hidden constant chosen
during UI implementation.

### 4.3 Irreversible creature decisions

Selling, rehoming, or otherwise relinquishing a creature is outside the first
economy slice. Before it can be designed, the project must separately decide:

- whether the action is called selling, rehoming, retirement, or something
  else, and what actually happens in the fiction;
- who counts as active, dormant, or unreachable;
- whether dissent is a veto;
- what cooling-off and final-confirmation flow applies;
- what happens when membership changes during the decision; and
- how the permanent Beastpedia and Chronicle record is presented.

No implementation may reduce that decision to an ordinary purchase threshold
or a single majority button.

## 5. Absence and time

- Commission offers may wait or accumulate to a small cap; missing a real-time
  window cannot delete value or harm the creature.
- No login streak or consecutive-day multiplier exists.
- No paid resource expires.
- A long-absent group can always take a commission and recover economic choice.
- Offline reconciliation selects a current behavior from stored facts and
  elapsed time. It does not replay one care failure per missed interval.

The desired return sentence is "look what it is doing now," not "look what
happened because you left."

## 6. Chronicle and identity

Every economic change that affects the balance must answer:

- What happened?
- Why did coins enter or leave?
- Which group did it belong to?
- Which members participated or proposed the choice?
- Which creature was involved?
- When did it happen?
- Which unique request/event caused it?

The Chronicle uses those facts to write specific memories. The same facts may
support troubleshooting, but the player-facing surface must not become an
accounting statement.

Examples of the intended register:

- "Maya and Jordan helped carry Mrs Bell's seed packets through the rain."
- "Ana chose the smoked river fish. It inspected the paper before the fish."

Do not write "The group earned 14 XP" or "Productivity increased by 12%."

## 7. Economy UX rules

- Show coins where a spending or earning decision needs them; do not add a
  permanent HUD counter by default.
- Use ordinary language: commission, help, brought back, chose, cost.
- Do not use worker-efficiency, yield, idle-income, streak, claim reward, or
  optimization language.
- A refusal or server error must have a visible sentence and must not consume
  coins.
- A pending proposal must say what it is waiting for.
- A reconnect must converge on the server's answer without duplicating a
  payout, purchase, or Chronicle line.

## 8. Explicit non-goals for the first slice

- multiple creatures;
- selling or rehoming;
- breeding or lineage;
- cross-group trading;
- player marketplaces;
- food inventory management;
- multiple currencies;
- passive employment;
- daily tasks or streaks;
- traditional hunger, sickness, or health upkeep;
- a broad job catalogue;
- leaderboards; and
- monetization.

## 9. Human decision gates

Implementation must pause for the product owner at these points:

1. **Wallet gate:** shared treasury plus provenance versus personal group-bound
   purses plus pledging, after the comparison prototype.
2. **Commission tone gate:** confirm that the first authored commission feels
   like an experience with the creature rather than sending it to work.
3. **Ordinary spending gate:** choose the support/quorum rule after testing it
   with uneven and dormant groups.
4. **Adult-purpose gate:** observe what people attempt after adulthood before
   planning breeding.
5. **Relinquishment gate:** decide whether the feature should exist and what it
   means before any schema or UI is built for it.

## 10. Evidence basis and limits

Local GameTev constraints used here:

- `game-systems/cozy-sim-systems-floor/report.md`: low pressure, persistent
  progress, no permanent fail state, minimal HUD, and no forced economy readout.
- `genres/life-sims/report.md`: needs as a light metronome, slow and recoverable
  state, self-directed motivation, and no care chore trap.
- `game-design/core-loop-and-progression-structure/report.md`: one short deep
  loop, a shaped session, anticipation/care rather than survival pressure, and
  fewer nested loops at small scope.
- `monetization/in-game-economy-design-balancing/report.md`: one complete
  resource inventory, per-resource faucets and sinks, stress modeling, and
  meaningful cozy sinks rather than decay or waiting.

The supplied 2026-08-23 external report adds:

- quantitative evidence that virtual pets can produce real attachment;
- a large Neko Atsume survey supporting progress-while-away engagement;
- a daily-engagement study documenting obligation, FOMO, and chore responses;
- direct but qualitative shared-pet reports about uneven participation,
  custody, guilt, and care pressure;
- comparative evidence for shared and separate co-op money; and
- experimental evidence that majority and unanimity each have governance
  failure modes, while deliberation matters.

Those findings establish risks and hypotheses. They do not establish an exact
wallet, quorum, inactivity interval, price, payout, or session length for a
2-to-8-friend MonsterTime group. Those remain model and playtest questions.

## 11. Contract acceptance checklist

Before an economy wave can ship:

- [ ] A broke group can still care for and enjoy its creature.
- [ ] A simulated long absence creates no damage, debt, warning, or lost streak.
- [ ] No commission must be completed to preserve prior progress.
- [ ] The creature remains worth visiting with no commission active.
- [ ] A commission is completable by one member and richer, not merely more
      lucrative, with several.
- [ ] Every balance change is server-authoritative, attributable, idempotent,
      and visible in an appropriate Chronicle memory.
- [ ] No ordinary disagreement can block basic care.
- [ ] No dormant member can permanently lock reversible ordinary play.
- [ ] No irreversible creature decision exists without its separate governance
      contract.
- [ ] Playtesters describe the first commission as something they did with the
      creature, not something they sent it away to grind.
