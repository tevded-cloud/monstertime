# MonsterTime economy model

Status: deterministic mechanical pass implemented; human gates remain open
Date: 2026-08-23

Executable model: `scripts/economy-model.mjs`

Preserved output: `docs/ECONOMY_MODEL_RESULTS.md`
Depends on: `ECONOMY_CONTRACT.md`, `RESOURCE_MAP.md`

## 1. Purpose

This model chooses safe candidate ranges and exposes structural failures before
implementation. It does not optimize retention, daily active use, or revenue.

It must answer:

- Can every group reach the first expressive purchase through ordinary play?
- Does group size change story texture without multiplying the money supply?
- Can a highly active member play without making everyone else feel useless?
- Can an absent or dormant member strand money or block ordinary spending?
- Do coins retain enough meaning that a purchase remains a choice?
- Can a group ignore every paid sink without harming its creature?
- Does any wallet/governance rule create provider resentment or unilateral
  control?

Exact payouts, prices, offer cadence, active-member windows, and support
thresholds remain variables until the model and playtest produce evidence.

## 2. Modeled resources

Only coins have a numeric balance in the first model.

```text
opening credit (optional, once)
  + commission payouts
  - special-food purchases
  = current treasury
```

Ordinary food, inclinations, traits, substance, actions, and memories are
modeled only as availability/behavior constraints. They are not assigned a
shadow coin price.

## 3. Candidate parameters

| Parameter | Meaning | Candidate treatment |
|---|---|---|
| `marketPursePerClaim` | Existing pre-hatch stake | Current rule; include as historical input |
| `openingCreditPolicy` | What survives the egg purchase | Compare zero vs pooled unused market stake |
| `commissionBasePay` | One group payout | Range, not participant multiplied |
| `traitPaySpread` | Max pay difference caused by approach/fit | Keep narrow; compare zero and small spread |
| `offerCadence` | How another paid opportunity appears | Compare immediate, banked elapsed-time, and bounded offer queue |
| `offerBankCap` | Opportunities retained during absence | Small candidate range; no lost streak |
| `specialFoodCost` | First expressive sink | Range relative to one commission and opening credit |
| `ordinarySupportPolicy` | How shared money is spent | Compare candidates below |
| `activeDefinition` | Who ordinary policy waits for | Explicit scenario input, never UI guesswork |
| `proposalLifetime` | Whether unresolved proposals wait/replace | No coin loss; compare indefinite-with-withdrawal vs harmless replacement |

No number becomes production truth merely because it makes the spreadsheet
balance. Product comprehension and emotional response remain separate gates.

## 4. Population scenarios

Run every wallet and governance candidate against:

| Scenario | Group | Participation shape |
|---|---:|---|
| Solo | 1 | One consistent member |
| Pair-even | 2 | Similar activity |
| Pair-uneven | 2 | One frequent, one occasional |
| Pair-dormant | 2 | One active, one absent after early play |
| Small-even | 4 | Similar activity with asynchronous timing |
| Small-provider | 4 | One member performs most commissions |
| Full-uneven | 8 | Two frequent, three occasional, three dormant |
| Join-late | 4 then 5 | Member claims a seat after market/purchase |
| Restore-device | any | Existing member returns through passcode |
| Grandfathered | any | Creature predates market/economy and starts with no ledger |

For each, simulate casual, typical, intensive, and sink-avoiding behavior. These
are scenario labels until playtest supplies credible rates; they are not claims
about real players.

## 5. Wallet experiment

### Candidate A: shared treasury plus provenance

```text
one commission -> one group payout
participant names -> event + Chronicle
all approved purchases -> one group balance
```

Measure:

- Does everyone correctly say the coins belong to the group?
- Does the frequent player feel their work is being spent by others?
- Does the occasional player still feel legitimate?
- Can dormant membership block a purchase?
- Can one member drain the treasury?
- Do people remember who helped without a personal balance?

### Candidate B: personal group-bound purses plus pledges

```text
commission payout -> split or attributed personal balances
purchase -> personal pledges combine
no transfer outside the group
```

Test both split rules if this candidate survives initial review:

- equal split among group membership; and
- credit only to participants.

Measure:

- Are coins stranded behind dormant members?
- Does one member become the provider?
- Do low-earning but emotionally important actions feel devalued?
- Does purchase coordination feel meaningful or administrative?
- Can a late joiner participate without an arbitrary grant/exploit?

### Selection rule

Select the wallet that best preserves group ownership and contribution identity
with the least inactivity friction. Do not select solely by fewer database
tables or faster purchase completion.

The leading hypothesis is Candidate A.

## 6. Ordinary-spend policy candidates

Apply only to reversible expressive purchases. Selling/rehoming requires a
future contract.

### Policy 1: present-member support

Only currently connected claimed members count. Useful for immediate play, but
it may let one person wait for an empty room and spend everything.

### Policy 2: recently-active support

A defined recent-activity set counts. Better asynchronous representation, but a
window can become a hidden blocker and must be visible.

### Policy 3: proposal plus bounded objection period

A proposal resolves after a disclosed period unless enough opposition exists.
Works asynchronously, but waiting can feel like a timer and needs a harmless
free-care route while pending.

### Policy 4: low-cost agency, higher-cost support

Any claimed member may make a small reversible expressive purchase; purchases
above a disclosed share/amount need support. Reduces snack bureaucracy but adds
a threshold and tests the older direction that food choices are voted.

### Policy 5: personal pledges

No shared spend occurs; members pledge their own group-bound purses. Preserves
direct consent but inherits the wallet candidate's provider and dormant-money
risks.

The model must show, per group scenario:

- time/steps to resolution;
- fraction of proposals permanently waiting;
- unilateral-spend exposure;
- dormant-member dependence;
- number of messages/taps required; and
- whether one-member groups still work.

The playtest then measures fairness and comprehension. The model cannot measure
resentment.

## 7. Flow simulation

For each scenario and parameter set:

```text
initialize group and market history
derive or assign opening treasury under the candidate policy

for each simulated opportunity:
  choose whether active members accept or ignore
  if accepted:
    resolve exactly once
    add one group payout (or wallet-candidate equivalent)
    record participant provenance

  choose whether group proposes available special food
  run the selected support policy
  if approved and affordable:
    subtract once
    record purchase/action

  advance participation/absence state
  assert invariants

report balances, flows, waiting proposals, participation attribution,
purchase access, and idempotency/concurrency outcomes
```

Use seeded scenarios so a failing case can be replayed exactly.

## 8. Stress cases

### Economic

- Intensive group takes every available commission and avoids every sink.
- Casual group buys the first special food as soon as it can.
- Group repeatedly buys every offered food.
- Eight-member group participates together in every commission.
- One-member group must fund the same first expressive choice.
- Opening credit after cheapest versus dearest egg.
- Grandfathered group with zero opening credit.
- Member joins after opening credit was written.

### Governance

- One active member plus seven dormant members.
- One member supports and one explicitly opposes.
- Equal support for two competing foods.
- Proposer becomes dormant.
- Membership changes while proposal waits.
- Passcode restore makes the same person visible on another device.

### Transport and storage

- Double click sends the same request twice.
- Two devices send the same member action concurrently.
- Two different members resolve the last required support simultaneously.
- Server commits and response is lost.
- Client retries after reconnect.
- Cold object wakes and reads old ledger schema.
- Purchase and food action fail at each possible write boundary.

## 9. Mechanical invariants checked every step

- Balance equals opening credit plus faucets minus sinks.
- Balance is a finite, non-negative whole number.
- Request ids are unique per committed economic effect.
- One commission id has at most one payout event.
- One proposal has at most one purchase event.
- Participant count does not linearly multiply shared-treasury payout.
- Joining/restoring cannot mint coins.
- Ignoring an offer changes no balance or creature welfare state.
- Absence changes no balance except already-committed events.
- Failed operations change neither money nor action history.
- Every committed spend has exactly one matching consequence/history fact.

## 10. Health signals

The model reports per scenario and time horizon:

- total faucet coins;
- total sink coins;
- ending balance distribution;
- time/opportunities to first expressive purchase;
- sink utilization;
- fraction of commission opportunities accepted;
- fraction of proposals resolved, waiting, withdrawn, or refused;
- share of economic events attributed to each member;
- number of blocked actions caused only by dormant membership;
- number of duplicate requests safely replayed; and
- reconciliation difference between cached and ledger-derived balances.

There is no target daily-active-use metric. A lower accepted-commission rate is
not automatically a problem if groups still understand and value the system.

## 11. Model failure conditions

A candidate fails before playtest if:

- any group can become unable to provide ordinary care;
- the first expressive purchase is unreachable without an opening grant that
  old groups cannot receive;
- group size multiplies income faster than available meaningful sinks;
- a dormant member can permanently lock every special-food choice;
- a new or restored member can mint money;
- a retry duplicates income or spending;
- a balance can become negative;
- the only stable economy requires a daily obligation or expiring resource; or
- the same optimal approach dominates every creature because of pay.

## 12. Playtest decisions the model cannot make

After mechanically viable candidates remain, direct play decides:

- shared treasury versus personal purses;
- whether contribution provenance is sufficiently visible;
- whether a spend rule feels fair rather than merely terminating;
- whether a frequent member feels exploited or proud;
- whether an occasional member feels welcome or illegitimate;
- whether commission language feels companionable or extractive;
- whether the creature is still valued when it earns nothing; and
- whether returning after absence produces curiosity rather than guilt.

Record observed behavior separately from interview answers. A player saying a
rule is fair while repeatedly avoiding the group treasury is evidence of a
different kind than the sentence alone.

## 13. Recommended first modeling sequence

1. Implement a small deterministic model, not production persistence.
2. Compare zero opening balance against pooled unused market stake.
3. Compare shared treasury against the two personal-purse split rules.
4. Eliminate candidates that fail arithmetic, inactivity, or group-size stress.
5. Prototype the remaining wallet/spend surfaces without a live economy.
6. Run the human questions in `ECONOMY_VERTICAL_SLICE.md`.
7. Select the first persistence schema at the wallet human gate.
8. Fill candidate payout/cost ranges for one commission and one food.
9. Re-run all scenarios and preserve the chosen inputs with the results.
10. Only then implement the Durable Object ledger and playable slice.

## 14. Model completion gate

- [ ] Every parameter has a named range and reason.
- [ ] All population and stress scenarios run from fixed seeds.
- [ ] All mechanical invariants pass.
- [x] Rejected wallet candidates have recorded failure reasons.
- [ ] The chosen candidate is mechanically viable for 1-to-8-member groups.
- [ ] The human wallet and commission-tone gates have been run.
- [x] Candidate payout and food cost are labeled provisional.
- [x] Results distinguish model output, observed playtest behavior, player
      statements, and product-owner decisions.
