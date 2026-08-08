# wave3:genome

Both files are clean and verified.

## Files touched
- `D:\Programs\monstertime\src\dna\alleles.ts`
- `D:\Programs\monstertime\src\dna\express.ts`

No allele was added, removed or renamed. All 91 ids are byte-identical to before.

## What I found before changing anything

The brief assumed bareness came from the draw failing to carry an axis-matching allele. I measured the actual cause first (300 groups, 90% give, 470 actions, baseline code): of 249 bare loci, **only 3** failed the `hasEarned` pressure/pace gate. **246 had an earned allele sitting and waiting**, blocked by `FIRST_LOCK_MIN = 0.04`, at a mean best cosine of **-0.094**. And in **249 of 249** cases the full pool held a legal answer, so the draw was also at fault.

That 0.04 floor was the deeper bug. Shapes are centred on an even spread, so in this space *unrelated* is negative, not zero: two single-axis directions sit at exactly -1/7, and the median allele scores **-0.137** against a randomly picked habit. A floor of +0.04 vetoed everything merely unrelated, not everything opposed, which is not what its own comment claimed it did.

I also measured why coverage and divergence fight: a habit direction is answered by a mean of only **1.88 early alleles per locus** (worst case 1: horn/feed is `emberCrest` alone). Guaranteeing an answer everywhere therefore *forces* specific alleles into most genomes. That arithmetic, not a tuning failure, is why the last rewrite could not win both.

## What I did
**alleles.ts** — three-pass draw replacing the single weighted loop:
1. Small spread core (2 to 3), each pick discounted by actual cosine against what is already carried, not by lead-axis-set equality.
2. Gap-filling against the six habit directions summed off `ACTION_VARIANTS` (new import; no cycle, `actions.ts` imports only types). Shuffled per genome, hatchling-only candidates, capped at 4 total, and picked **flat** rather than by rarity weight. Flat is load-bearing: rarity-weighted repair scored 218 on the cohort test, flat scored 93.
3. One allele the creature cannot grow yet, so a genome of gap-fills is not all hatchling parts.

Shape maths (`centredShape`, `shapeOfDelta`, `cosine`, `affinityShape`) moved here and is now exported; `express.ts` imports it instead of keeping a second copy. The draw's promise is only worth something if "answers" means exactly what expression means by it.

**express.ts** — `FIRST_LOCK_MIN` is now `-1 / (PRESSURE_AXES.length - 1)`, derived rather than picked.

## Measurements (identical seeds and logs, before vs after)

| | before | after | target |
|---|---|---|---|
| a. largest trait cohort, 5000 groups, one 110-action one-button log | 279 | **93** | well under 300 |
| a. largest trait cohort, 2000 groups, 90% feed | 107 | **30** | well under 117 |
| b. bare locus at 470, 90% give | 55.8% | **0.4%** | well under 59.5% |
| b. 90% sing | 36.0% | **1.2%** | |
| b. 90% feed | 53.8% | **7.2%** | |
| b. 90% explore | 35.8% | **0.4%** | |

Distinct trait sets under one-button play rose 1336 to 1853. My harness reproduces the baseline exactly (279 / 107 / 54.0 / 31.6 / 48.0 / 36.0), which is what validates the comparison.

The cap is the whole tradeoff and I measured it on the shipped config: cap 3 gives cohort 15 but 35% feed bareness; cap 4 gives 93 and 8%; cap 5 gives 257 and under 1%.

## Not regressed (all re-measured on the shipped files)
5000 of 5000 byte-distinct creatures, largest full-creature cohort 1. 0 rarity-ladder inversions across 91 alleles. 0 key-order replay mismatches in 200 groups; no `Math.random`, `Date.now`, `exp/pow/log/trig`, `**`, `Object.keys` or `for...in`. 8.00 of 8 loci filled at both 110 and 470 actions. Trait swaps over 470 actions 13.68 to 13.98 (no churn increase). Stage-4 striking allele carriage 72.8% to 82.5%, expressed 0.16 to 0.21 per creature; stage-3+ expressed 0.85 to 1.08.

## One honest number that moved the wrong way
Credit floors: a 1-click visitor still gets 0.00, but a 3-click visitor's sole credit went 0.175 to 0.210 traits per group, and a 10-click visitor's 1.91 to 2.09. I attributed it: with the lock floor held at 0.04 and only the draw changed, it is 0.200 / 2.100, so it is fewer bare loci, not a broken floor. My harness does not reproduce the reviewer's 0.00 for 3 clicks on the *baseline* either (it gives 0.175), so that figure is harness-dependent, not an invariant I broke. `"kept"` naming somebody under 3 actions: **0** across all runs.

## Documentation corrected
- `express.ts` header: the addition/multiplication/square-root claim was false. Now names division, says the four correctly-rounded IEEE ops are the guarantee, and says the real hazard is transcendentals.
- `express.ts`: even-play pair rate was "about 1.3"; catalogue arithmetic gives **1.2604**, now written as 1.26.
- `alleles.ts` header no longer quotes a carried-per-locus count at all; the mean is 4.97 and would go stale again.

## Deliberately not done
No expression-side seed jitter on trait scores. It was the obvious way to break the last of the cohort, and I measured why it cannot work here: at horn under one-button feed the gap between `emberCrest` (0.93) and the runner-up (0.215) is 0.7, so any jitter honest enough to only reorder near-ties changes nothing, and one big enough to flip it would make trait choice arbitrary. That locus stays at ~100% `emberCrest`, and given one horn in the catalogue answers feeding, I think that is the correct answer rather than a defect.

## For the orchestrator
No `types.ts` or `package.json` change needed. Two notes:
- `src/dna/index.ts` (not mine) exports `ALLELES, alleleById, rollGenome`. `alleles.ts` now also exports `centredShape`, `shapeOfDelta`, `cosine`, `affinityShape`. Nothing outside `src/dna` needs them, so I left `index.ts` alone; add them only if the render agent asks.
- `alleles.ts` now imports `./actions`. Verified no cycle: `actions.ts` imports only `../core/types`.
