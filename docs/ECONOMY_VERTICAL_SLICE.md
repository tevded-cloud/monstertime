# MonsterTime economy vertical slice

Status: implementation-ready design after the gates below, not implemented
Date: 2026-08-23
Depends on: `ECONOMY_CONTRACT.md`, `RESOURCE_MAP.md`, `ECONOMY_MODEL.md`

## 1. Proof question

Can one adult creature create a short, optional, trait-sensitive experience that
earns persistent group coins, lets the group choose one expressive food, visibly
changes the creature, and leaves a specific shared memory without creating
care pressure or turning the creature into an income machine?

If this loop is not pleasant and understandable with one commission and one
food purchase, more jobs, needs, creatures, selling, and breeding are deferred.

## 2. Preconditions

Economy implementation does not start until:

- the current catalogue `past`/`memory` transition is complete;
- `npm run check` passes;
- the full app and worker test suites pass;
- a fresh production build passes after the final source edit;
- the current uncommitted market-hardening wave is reviewed and landed; and
- the wallet comparison has selected the first persistence hypothesis.

The first four design documents may land before those code gates. Economy code
may not.

## 3. Scope

Build:

- one adult-only commission;
- three authored approaches;
- one server-authoritative payout;
- one shared treasury presentation;
- one special-food offer and proposal;
- one atomic special-food purchase;
- one immediate creature reaction;
- one persistent action/substance consequence;
- one commission memory and one purchase/feeding memory; and
- two-client convergence and retry coverage.

Do not build:

- a job board;
- commission streaks or timed failure;
- food inventory;
- traditional needs meters;
- multiple creatures;
- selling/rehoming;
- breeding;
- trading; or
- a general voting framework for irreversible decisions.

## 4. The authored proof: Mrs Bell's seed packets

Working copy, subject to the commission-tone gate:

> Mrs Bell has seed packets to get from the night market to the glasshouse.
> The creature has already pulled one of the bundles toward the door.

This is an invitation created by the creature's behavior. It is not a job alert,
wage notification, or efficiency assignment.

### Approaches

| Approach | Primary creature evidence | What happens | Economic treatment |
|---|---|---|---|
| Carry the lot directly | vigor, size, stubbornness | It tries to move everything in one journey | Guaranteed base result; expression and prose vary |
| Find the short way | roam, craft, curiosity | It investigates alleys and doors, possibly inventing a route | Guaranteed base result; discovery changes memory/reaction |
| Ask for another pair of hands | bond, resonance, social history | It attracts or persuades help in its own manner | Guaranteed base result; participants and social texture vary |

Every approach resolves. Trait fit changes animation, incident, reaction, and
Chronicle text first. Any payout difference is narrow and cannot make one body
plan or temperament the permanent optimal wage build.

### Example memories

- "Maya and Moss carried Mrs Bell's seed packets through the rain. Moss would
  not leave the smallest bundle behind."
- "Jordan let Moss choose the way to the glasshouse. It found a gate nobody had
  noticed and spent longer with the hinge than the shortcut."
- "Ana and Moss brought half the market with them. Mrs Bell paid the group and
  asked them not to do that next time."

These are direction samples, not final production copy.

## 5. Commission state machine

```text
not-eligible
  -> offered                creature is adult and first offer is available
  -> accepted               one claimed member selects an approach
  -> resolving              server owns the transition; client cannot pay itself
  -> resolved               one immutable payout event + one memory fact
  -> acknowledged           clients have shown the result; economic state persists
```

Rules:

- `offered` has no deadline in the slice.
- Ignore/dismiss never changes the creature or treasury.
- One member may complete it without waiting for others.
- Other members may add a named contribution before resolution if the chosen
  interaction shape permits it, but participant count does not multiply pay.
- A second accept/resolution request returns the existing result.
- A dropped response followed by reconnect shows the resolved state and does
  not pay again.

## 6. Moment and session loop

Target, provisional rather than evidence-derived: the first full loop should be
finishable in under five minutes.

```text
NOTICE (seconds)
  creature behavior makes the opportunity legible

CHOOSE (under a minute)
  read three approaches and pick one

DO (one short interaction)
  one meaningful input/choice, not a repeated tap quota

WATCH (seconds)
  creature-specific resolution and immediate feedback

REMEMBER (seconds)
  coins arrive; Chronicle line is available; special food becomes affordable

CHOOSE TO STOP OR CONTINUE
  clean stopping point after commission; food purchase is the one-more hook
```

There is no progress bar requiring dozens of inputs. If the verb is not worth
doing without the payout, revise it before adding commission content.

## 7. Treasury presentation

Show the treasury only on economy-relevant surfaces:

- commission resolution;
- special-food proposal/purchase; and
- an optional group/economy detail surface.

Do not add an always-on Stage HUD number in the first slice.

Resolution copy names the experience before the amount:

> Mrs Bell paid the group 14 coins.

not:

> Commission complete. +14.

The candidate amount is owned by `ECONOMY_MODEL.md` and remains a placeholder
until the model is filled.

## 8. The expressive sink: smoked river fish

Working special food:

> Smoked river fish. Rich, salty, and wrapped in paper that may interest it
> first.

Broad disclosed influence: brine/substance and a strong sensory reaction. Exact
DNA weights remain hidden.

The purchase produces:

1. an asynchronous proposal appropriate to the selected wallet/governance
   policy;
2. one atomic negative coin event;
3. one corresponding feed/action fact;
4. an immediate authored creature reaction; and
5. a persistent memory/substance consequence through existing derivation.

Ordinary fish or another ordinary meal remains available for free. Failure to
buy this item is not hunger failure.

## 9. Proposal behavior

The first shared-treasury prototype exposes a policy seam rather than burying a
quorum in the component:

```ts
interface OrdinarySpendPolicy {
  outcome(input: {
    claimed: string[]
    active: string[]
    supporters: string[]
    opposers: string[]
    cost: number
    balance: number
  }): 'waiting' | 'approved' | 'refused'
}
```

Candidate policies are simulated and playtested in `ECONOMY_MODEL.md`. The UI
must be able to say:

- who proposed the food;
- who supports or opposes it;
- whether it is waiting;
- what rule would resolve it; and
- how to withdraw without losing coins.

No rule may require dormant members forever. No rule may let one undefined
"owner" permanently control a group. Single-member groups must remain usable.

## 10. Required UI surfaces

### Stage cue

The adult creature's behavior exposes the offer. A small contextual action opens
the commission; no global job notification is required.

### Commission sheet

- plain-language premise;
- accept/ignore;
- three approaches;
- visible participants if any;
- no countdown, stamina, recommended power, or payout optimization table.

### Resolution

- what the creature did;
- who participated;
- what was memorable;
- the payment sentence; and
- continue/close.

### Special-food proposal

- food and broad influence;
- cost and current treasury;
- proposer/support state;
- visible waiting/refusal/result sentence; and
- ordinary free-care route still reachable.

### Chronicle

Commission and food events appear in chronological context with the creature's
other development. They are memories, not a separate financial statement.

## 11. Technical boundaries

- Worker/Durable Object authorizes commission acceptance, resolution, payment,
  proposal support, and purchase.
- Client supplies a request id; server makes it idempotent.
- Client never supplies a trusted actor id or payout amount.
- Commission definition/approaches may be shared deterministic data, but the
  resolved event and money are server facts.
- The food purchase and action append are atomic from the player's perspective.
- Economy state does not enter `src/dna` as ambient mutable/global state.
- Creature derivation consumes explicit action/history facts and remains pure.
- Cold GET/snapshot reads perform no cleanup writes.

## 12. Mechanical verification

### Pure/model tests

- every wallet candidate conserves coins;
- every ordinary-spend policy handles 1-to-8-member groups;
- no policy waits forever solely because a member is classified dormant;
- commission payout is independent of duplicate participant messages;
- food purchase cannot produce a negative balance.

### Worker tests

- unclaimed visitor cannot accept, support, or buy;
- one accept resolves once;
- simultaneous accepts converge on one commission event;
- replayed request id returns the original result;
- disconnect after commit and retry does not duplicate payment;
- simultaneous purchases against one balance serialize;
- insufficient funds changes nothing;
- purchase and food action are both present or both absent;
- client present at resolution and late-arriving client receive equal state;
- old group with no economy fields reads as a valid zero/default economy;
- cold read writes zero rows.

### App tests

- offer is reachable from the creature state;
- ignore has no warning/punishment;
- three approaches have accessible names and explanations;
- every refusal/result is rendered;
- pending proposal says what it awaits;
- free ordinary care remains reachable while a proposal waits;
- treasury is not added as permanent HUD clutter; and
- reconnect replaces optimistic state with the server result.

### Full gates

- `npm run check`;
- `npm test`;
- `npm run build` after the final source edit;
- local two-client Durable Object flow; and
- phone, tablet, and desktop browser verification.

## 13. Human playtest protocol

Run with at least:

- one solo group;
- one pair;
- one 4-or-more-person group;
- one deliberately uneven pair; and
- one simulated dormant-member group.

After the commission, ask without leading:

- What happened?
- Whose money is it?
- What did the creature contribute?
- Did this feel like helping someone with the creature, or sending it to work?
- Would you do another one without the coins?
- Was anybody required who was not present?

After the food choice:

- Who made that decision?
- Did the rule feel fair?
- Did anybody's contribution feel taken from them?
- Was it clear that ordinary care remained possible?

After a simulated long absence:

- Do you feel curious, guilty, responsible, behind, relieved, or indifferent?

The slice fails its product gate if guilt/obligation is the dominant return
emotion, if participants call the creature an employee/income source, or if
wallet ownership is unclear after explanation-free play.

## 14. Exit criteria

The vertical slice is complete only when:

- [ ] one adult commission closes end to end;
- [ ] one server-authoritative payout persists across reconnects;
- [ ] duplicate messages cannot duplicate coins;
- [ ] the selected wallet/proposal policy is understandable to the group;
- [ ] one special food is bought atomically;
- [ ] its reaction is immediately visible;
- [ ] its consequence persists through the existing creature/action system;
- [ ] both economic events produce specific Chronicle memories;
- [ ] a broke group retains free ordinary care;
- [ ] a long absence creates no debt or harm; and
- [ ] the playtest language describes a shared experience, not pet labor.
