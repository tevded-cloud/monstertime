# MonsterTime resource map

Status: proposed economy model, not implemented
Date: 2026-08-23
Depends on: `ECONOMY_CONTRACT.md`

This is the complete resource inventory for the first economy slice. Adding a
resource not named here is a design change, not an implementation detail.

## 1. Resource inventory

| Resource or state | Owner | Enters through | Leaves through | Persists | Tradeable |
|---|---|---|---|---|---|
| Coins | One MonsterTime group | Commission resolution; a documented opening balance; selling only in a later design | Egg purchase; special food; later approved expressive sinks | Yes; never expires | No |
| Commission offers | Group and current creature | Adult state and offer selection | Accepted, dismissed, or replaced without penalty | Bounded pending set | No |
| Commission participation | Named group members | A member joins or chooses an approach | Resolution | As event/history | No |
| Special-food proposal | Group | A member proposes an offered food | Purchase, withdrawal, or harmless expiry/replacement | Until resolved | No |
| Special food | Not an inventory in the first slice | Purchase resolution | Consumed immediately into an action/reaction | Its consequences persist, not the item | No |
| Creature inclinations | Current creature | Time, current state, preferences, recent actions | Natural transition or satisfying action | Current state only; no debt backlog | No |
| Substance/action effects | Deterministic creature history | Existing action log, including consumed special food | Never spent; folded by derivation | Yes | No |
| Chronicle memories | Creature/group history | Deterministic derivation plus server facts such as purchases and commissions | Never | Yes | No |

Coins are the only currency. Offers, proposals, states, action effects, and
memories are not alternate money.

## 2. Coin ownership

### Leading design: shared treasury with provenance

The group has one spendable balance. A commission pays the group once, not once
per participant. The economic event separately records the members who took
part and the creature/approach involved.

This avoids:

- money stranded behind a dormant member;
- an eight-person group minting eight times the money for the same event;
- turning emotional contribution into household accounting; and
- making the most active caregiver the group's permanent provider.

It preserves:

- who helped;
- what each person chose;
- whose idea a purchase was;
- how the creature changed the result; and
- concrete Chronicle credit.

### Required challenger: personal group-bound purses

Before the schema is declared final, prototype the current alternative:

- members earn or retain personal coins within one group;
- choosing a purchase means pledging personal coins; and
- no coins transfer across groups.

The comparison must measure fairness, spending anxiety, coordination cost,
inactive-member friction, and whether somebody feels like "the provider."
The challenger is not implemented merely because the pre-hatch market already
uses personal pledges; pre-hatch voting and the adult economy solve different
problems.

## 3. The pre-hatch market boundary

The existing market's 100-coin member purse is an election stake used to choose
one egg. It is currently derived from claimed membership and pledges, not stored
as a lasting wallet.

The proposed bridge for a newly purchased creature is:

```text
opening group treasury
  = (claimed members at resolution * market starting purse)
    - coins actually spent on the winning egg
```

Losing pledges have already been refunded by the market. The remaining value
becomes group property when the group crosses from choosing a creature to
raising it.

Rules:

- The opening credit is written once, in the same atomic resolution that buys
  the egg.
- It has its own immutable economy event and idempotency key.
- A member claiming a place after the market does not mint another opening
  stake. This prevents invite/claim farming.
- A group grandfathered in with a creature and no market starts the adult
  treasury at zero. Its first commission is always accessible without money.
- If the wallet experiment selects personal purses, this bridge must be
  redesigned before code. Do not silently reinterpret the same event.

The opening-balance formula is a proposed design decision and must be included
in the economy model. It is not inherited truth from the current code.

## 4. Faucets and sinks

### 4.1 Coins

| Flow | Kind | Typical frequency | Intended feeling | First-slice status |
|---|---|---|---|---|
| Opening post-market credit | Faucet | Once per new group | The group's unused stake came with it | Model before implementation |
| Commission payout | Faucet | Occasional; offer availability is forgiving | Payment attached to a specific shared experience | Build one |
| Creature sale | Faucet | Rare and irreversible | A weighty relinquishment, not farming | Deferred |
| Egg purchase | Sink | Once per creature | The group's first collective choice | Exists pre-economy |
| Special food | Sink | Repeated and optional | A meaningful expressive choice | Build one |
| Future collection/expression | Sink | Optional | Long-horizon group projects | Deferred |

### 4.2 Design constraints on flow

- A commission pays one group amount. Participant count may alter prose,
  choices, or non-monetary texture, not multiply the faucet linearly.
- The same commission cannot pay twice because a message is retried.
- No sink is required to prevent damage.
- No faucet is a login reward or streak grant.
- No paid resource expires.
- No balancing change may be justified only by a desire to make players wait or
  grind longer.

## 5. Server-authoritative economic facts

The creature remains a pure derivation of its legitimate inputs. Coins are not
DNA and cannot be reconstructed from the action log alone once jobs and
purchases exist.

The Durable Object should own an append-only economic event ledger. The exact
SQL is an implementation decision, but the logical contract is:

```ts
interface EconomyEvent {
  id: string              // immutable server event id
  requestId: string       // idempotency key for the triggering client request
  kind:
    | 'opening-credit'
    | 'commission-paid'
    | 'special-food-bought'
    | 'adjustment'        // exceptional, reason required; never silent
  amount: number          // positive faucet, negative sink; whole coins
  at: number              // server time
  actorIds: string[]      // participants/proposer; may be empty only when justified
  subjectId: string       // commission id, food id, or market purchase id
  detail: unknown         // versioned kind-specific facts needed for history/audit
}
```

The group id is implicit in Durable Object storage. If events are ever exported
outside that boundary, the group id must travel with them.

Treasury balance is either:

- the sum of immutable events; or
- a cached balance updated atomically with the event and continuously checked
  against the ledger.

There must never be a separately updated balance with no reconcilable event.

## 6. Required invariants

### Arithmetic

- All coin amounts are finite whole numbers.
- Treasury never becomes negative.
- A sink cannot resolve unless sufficient funds exist at the server at that
  instant.
- One request id creates at most one economic event.
- Replaying a successful request returns the existing result.
- Failed, refused, or withdrawn operations create no balance change.

### Authority and identity

- Only a claimed group member can accept a commission approach, propose/support
  a paid food, or cause a spend.
- The actor comes from the connection's verified group seat, never a client
  supplied actor id.
- An unclaimed visitor may observe the treasury and proposals but cannot move
  coins.
- Passcode recovery must recover the same economic identity and must not create
  a new stake or balance.

### Concurrency

- Two clients resolving the same commission cannot both receive payment.
- Two simultaneous purchases against the same balance serialize; at most one
  may spend money that exists only once.
- A member joining or reconnecting sees the same treasury, offer, proposal, and
  resolved history as an already-connected member.
- Cold reads do not rewrite or normalize the ledger.

### History

- Every `commission-paid` event carries the facts needed to write one specific
  memory without consulting transient UI state.
- Every `special-food-bought` event corresponds to exactly one consumed action
  or an explicitly atomic combined operation. Money cannot disappear while the
  food action fails to land.
- The client that watched resolution and a client arriving later derive the
  same economic Chronicle entries.

## 7. Commission offers

Offers are opportunities, not currency and not obligations.

First-slice rules:

- The first adult commission is always available.
- Ignoring it has no cost.
- A group has at most one active commission in the playable proof.
- Acceptance does not start a hostile countdown.
- Resolution produces one payout and one memory.
- Offer cadence after the first proof is a model parameter. If time-based offers
  are later used, missed time must bank or harmlessly replace opportunities
  rather than destroy a streak.

## 8. Special food

The first slice has no food inventory. A successful proposal performs one
atomic operation:

```text
validate proposal and support rule
  -> validate current treasury
  -> write negative economy event
  -> append the corresponding food action / durable fact
  -> resolve proposal
  -> broadcast one converged snapshot/result
```

If the food action cannot be written, the money is not spent. If the response is
lost after commit, retry returns the same completed purchase.

Food copy exposes a broad consequence such as "rich and smoky" or "sharp and
green," not exact hidden trait weights.

## 9. Snapshot boundary

The group view eventually needs enough economy state to render without a chain
of follow-up fetches:

- current treasury balance;
- current commission offer and state;
- current special-food proposal and support;
- recent economic result needed for immediate feedback; and
- immutable economic facts needed by the Chronicle/creature derivation.

Do not place the full lifelong ledger in every websocket broadcast. Define a
compact current snapshot plus a bounded/history route if the Chronicle needs
older events. The exact split belongs to implementation design after the
vertical-slice contract is approved.

## 10. Migration and compatibility

The implementation plan must explicitly cover:

1. pre-market grandfathered creatures;
2. groups that bought an egg before an economy ledger existed;
3. groups still at the market when the economy deploys;
4. members claiming or restoring a seat after purchase;
5. duplicate/retried requests from an older service worker; and
6. snapshots with no economy field.

Absence always means the old behavior plus a zero/default economy, never a 500
or an invented purchase.

## 11. Resource-map gate

Before implementation begins:

- [ ] The wallet playtest selects or deliberately postpones the ownership
      schema.
- [ ] The opening-balance rule is modeled for every group size.
- [ ] One commission faucet and one special-food sink have candidate ranges.
- [ ] Intensive, casual, absent, and sink-avoiding groups are simulated.
- [ ] No resource outside this inventory has appeared in the design.
- [ ] Atomicity and idempotency tests are specified before the first write path.
