# MonsterTime economy model results

Status: deterministic mechanical model complete; human wallet and tone gates remain open
Model: `scripts/economy-model.mjs`

These are fixed stress scenarios, not forecasts of real player behavior.

## Candidate result

| Wallet | Mechanical result | Coins allocated to nonparticipants | Inactive-seat spend blocks | Max stranded |
|---|---|---:|---:|---:|
| Shared treasury + provenance | survives | 0 | 0 | 0 |
| Personal purses, equal member split | reject | 3577 | 42 | 144 |
| Personal purses, participant split | survives | 0 | 0 | 24 |

- **Shared treasury + provenance:** Mechanically viable; unilateral-spend perception remains a human governance gate.
- **Personal purses, equal member split:** Reject: equal splits allocate earnings to nonparticipants and strand spendable coins behind absent seats.
- **Personal purses, participant split:** Mechanically viable; earned personal coins can still strand after a contributor leaves, and provider concentration remains a human fairness gate.

## Typical fixed-sequence snapshot

| Scenario | Wallet | Earned | Spent | End | Purchases | Inactive-seat blocks |
|---|---|---:|---:|---:|---:|---:|
| solo | shared | 240 | 168 | 72 | 7 | 0 |
| solo | personal-equal | 240 | 168 | 72 | 7 | 0 |
| solo | personal-participants | 240 | 168 | 72 | 7 | 0 |
| pair-even | shared | 168 | 120 | 48 | 5 | 0 |
| pair-even | personal-equal | 168 | 120 | 48 | 5 | 0 |
| pair-even | personal-participants | 168 | 120 | 48 | 5 | 0 |
| pair-uneven | shared | 168 | 120 | 48 | 5 | 0 |
| pair-uneven | personal-equal | 168 | 120 | 48 | 5 | 0 |
| pair-uneven | personal-participants | 168 | 120 | 48 | 5 | 0 |
| pair-dormant | shared | 192 | 120 | 72 | 5 | 0 |
| pair-dormant | personal-equal | 192 | 96 | 96 | 4 | 1 |
| pair-dormant | personal-participants | 192 | 120 | 72 | 5 | 0 |
| small-even | shared | 264 | 168 | 96 | 7 | 0 |
| small-even | personal-equal | 264 | 120 | 144 | 5 | 2 |
| small-even | personal-participants | 264 | 168 | 96 | 7 | 0 |
| small-provider | shared | 168 | 120 | 48 | 5 | 0 |
| small-provider | personal-equal | 168 | 72 | 96 | 3 | 2 |
| small-provider | personal-participants | 168 | 120 | 48 | 5 | 0 |
| full-uneven | shared | 192 | 144 | 48 | 6 | 0 |
| full-uneven | personal-equal | 192 | 72 | 120 | 3 | 3 |
| full-uneven | personal-participants | 192 | 144 | 48 | 6 | 0 |
| join-late | shared | 168 | 96 | 72 | 4 | 0 |
| join-late | personal-equal | 168 | 72 | 96 | 3 | 1 |
| join-late | personal-participants | 168 | 96 | 72 | 4 | 0 |
| restore-device | shared | 216 | 120 | 96 | 5 | 0 |
| restore-device | personal-equal | 216 | 120 | 96 | 5 | 0 |
| restore-device | personal-participants | 216 | 120 | 96 | 5 | 0 |
| grandfathered | shared | 264 | 192 | 72 | 8 | 0 |
| grandfathered | personal-equal | 264 | 168 | 96 | 7 | 1 |
| grandfathered | personal-participants | 264 | 192 | 72 | 8 | 0 |

## Opening-credit result

| Members | Egg | Price | Pooled unused stake |
|---:|---:|---:|---:|
| 1 | 0 | 75 | 25 |
| 1 | 1 | 105 | unaffordable |
| 1 | 2 | 125 | unaffordable |
| 2 | 0 | 75 | 125 |
| 2 | 1 | 155 | 45 |
| 2 | 2 | 180 | 20 |
| 4 | 0 | 75 | 325 |
| 4 | 1 | 255 | 145 |
| 4 | 2 | 290 | 110 |
| 8 | 0 | 75 | 725 |
| 8 | 1 | 455 | 345 |
| 8 | 2 | 510 | 290 |

Pooled unused stake varies from 20 to 725 coins among affordable market outcomes, while grandfathered groups have zero. Use zero opening economy credit for the first slice; the commission is available at zero.

## First-slice provisional values

- One group commission pays 24 coins, never multiplied by attendance.
- Smoked river fish costs 24 coins.
- Trait pay spread is 0; traits change approach and memory, not first-slice income.
- The first accepted commission can therefore fund one expressive food.
- These values prove the loop. They are not production balance claims.

## Retry proof

The fixed duplicate sequence committed 2 effects, ignored 2 retries, and ended at 0 coins.

## Decision boundary

- Prototype shared treasury plus provenance first.
- Keep participant-attributed personal purses as the human-test challenger.
- Do not prototype equal member splits; the mechanical model rejects them.
- Test bounded objection for the first reversible food, but do not call it fair until groups use it.
- Do not implement production persistence until the wallet and commission-tone playtests select the schema.
