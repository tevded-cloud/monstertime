# fix:genetics

All fixes are in and measured. Final report.

## 1. Files touched

- `D:\Programs\monstertime\src\dna\express.ts`
- `D:\Programs\monstertime\src\dna\alleles.ts`
- `D:\Programs\monstertime\src\dna\actions.ts`

`rng.ts` and `index.ts` unchanged. Nothing outside `src/dna/` touched. No git, no build, no tsc run.

## 2. Findings fixed, and how

**FIX 1, morphs carried no per-group identity.** `deriveMorphs(genome, pressures, count)` now takes the genome. A new `morphTuning(seed)` runs `makeRng('morph:' + seed)` and draws a bias and a gain per proportion (`MORPH_BIAS 0.2`, gain `0.68` to `1.40`). The bias sits *inside* `softStep`, so the output stays in 0..1 with no clamp. Only `rng.next()` (Math.imul integer stream) plus add/multiply/divide: no `Math.exp`/`pow`/trig, no `Math.random`, no clock. `Morphs` and `Creature` types untouched. Egg still comes out exactly 0.5 on every proportion because `MORPH_WARMUP` is unchanged.

**FIX 2, whole axes with no allele.** 22 new alleles (catalogue 69 to 91, 11-12 per locus). All 64 locus/axis cells now have an allele leading on that axis (was 14 uncovered). Four cells whose only answer was a stage-4 striking allele (`horn|bond`, `wing|bond`, `spine|bond`, `aura|roam`) got an early answer, plus second early answers at `ear|craft`, `ear|resonance`, `eye|roam`, `tail|roam`, which were the cells committed groups were still going bald in. No existing allele was blunted. Two supporting changes in `rollGenome`: the carried count is now a share of the locus (`round(pool/3) + rng.int(3)`) instead of a fixed 2-4, so adding alleles does not thin every group's potential; and picks after the first are discounted by `SAME_ANSWER = 0.2` when they lead on an axis already answered at that locus, so a locus is a spread rather than three versions of one answer.

**FIX 3, credit.** `creditFor` now filters to people who were actually present *before* any lean is measured: at least 2 actions, and at least half of what an even share of the group's effort was at lock time (`CREDIT_MIN_ACTIONS 2`, `CREDIT_MIN_SHARE 0.5`, expressed as `actions * people >= total * share` so it stays exact arithmetic). Leans and totals are then computed inside that pool, which is also what fixes the mirror case: the whale is the only one in the pool, so their lean resolves to them instead of reading as zero. If nobody clears the floor the whole room is used, which preserves solo play and the first-evening case. `signatureVariant` now returns null unless every credited person has at least `KEPT_MIN_ACTIONS = 3` actions, and only counts variants that push one of the allele's *lead* axes, not any axis with weight above zero.

**FIX 4, inverted rarity ladder.** `hasEarned` no longer divides by `STAGE_ACTIONS[allele.minStage]`. The required rate is read off the threshold alone: `PACE_BASE 0.38 + PACE_SLOPE 0.114 * sqrt(threshold)`, so it is monotone in threshold by construction and inversion is not expressible. `minStage` still gates availability.

**FIX 5, early pool skew.** Which four variants are stage-gated changed, with zero push-value edits. Gated set is now `feed.honeycomb`, `train.standGround`, `sing.sayItsName`, `give.mapScrap` (was `train.standGround`, `explore.burnedWood`, `give.mapScrap`, `tend.checkTeeth`). The new set spans all eight axes; the old one spanned six, which made an even early pool arithmetically impossible.

**FIX 6, escalation contract.** I made the **code match the comment**. `resolveLoci` tracks `heldIsLive` (whether the incumbent survived its own `minStage` and `hasEarned` checks) and only applies the escalation discount when it did. A trait the group has stopped supporting is now displaced on the full sticky margin, not on a discount. The `ESCALATION_MAX` comment gained a sentence pointing at the new condition.

## 3. Deliberately not fixed

- **Near-duplicate variants** (review finding 6, `explore.burnedWood` vs `give.shedSkin` at cosine 0.953). Not in my brief, and fixing it means retuning pushes, which would have re-broken the FIX 5 balance I just measured.
- **Residual bareness for very committed groups.** The catalogue holes are closed but a group can still fail to *draw* the allele that answers its habit. That is the intended scarcity mechanic ("they were never offered the same options"), not a hole. Numbers below.
- **A specialist who is 20% of the group sweeping most loci.** At 10 or more clicks Dave takes sole credit on ~6.5 of 8 traits. That is the design as written (the three regulars playing perfectly evenly "shaped nothing in particular"), not the drive-by defect, which was 1 to 3 clicks and is gone. Flagging it rather than silently retuning the model.

## 4. Measurements

Harness re-synced from the real project files before every run: `C:\Users\teddy\AppData\Local\Temp\claude\D--Programs\01a1285f-c4e0-4667-96be-19061613ee29\scratchpad\mt\` (`sync.mjs`, `morphsep.mjs`, `bare2.mjs`, `cells.mjs`, `credit2.mjs`, `rates2.mjs`, `sigcheck2.mjs`, `det.mjs`, `poolsearch*.mjs`).

**FIX 1.** 5000 groups, different seeds, one identical 110-action log:

| | before | after |
|---|---|---|
| distinct creatures | 1346 (review: 1302) | **5000** |
| largest byte-identical cohort | 89 groups (review: 84) | **1 group** |

Distinctness alone is cheap, so I also measured the size of the gap. Over 400 seeds on that log there were 539 trait-set collisions; across those colliding pairs the largest-proportion gap ran min **0.0320**, median **0.0922**, max 0.2294 (was **exactly 0.000000**). No colliding pair is within 0.02 on every proportion. Behaviour still outranks the seed on the body: mean per-proportion change 0.318 across behaviours vs 0.097 across seeds, ratio **3.29:1**.

**FIX 2.** Locus/axis cells with no allele leading on that axis: **14 to 0** of 64. Mean bare loci for a 90%-committed group, 300 random genomes:

| behaviour | 110 actions | 310 | 470 |
|---|---|---|---|
| feed | 0.97 | 0.90 | 0.97 |
| train | 0.23 | 0.34 | 0.05 |
| explore | 0.99 | 0.34 | 0.29 |
| sing | 0.81 | 0.82 | 1.09 |
| give | 0.45 | 0.67 | 0.66 |
| tend | 0.07 | 0.01 | 0.05 |

The named cases: 90% give leaves ear bare in **0%** of groups at 310 and 470 (was 100%); 90% sing leaves hide bare below 20% (was ~82%); 90% feed leaves spine bare below 20% (was ~85%); 90% explore leaves aura bare in 24% at 110 and below 20% after (was 93%). Worst remaining cell across all 48 combinations at any horizon is 36%.

**FIX 3.** Same Dave harness, 200 groups per row:

| Dave's clicks | share of effort | sole credit before | sole credit after |
|---|---|---|---|
| 1 | 0.8% | 0.41 | **0.00** |
| 2 | 1.6% | **1.69** | **0.00** |
| 3 | 2.4% | 1.95 | **0.00** |
| 5 | 4.0% | 2.00 | **0.00** |
| 10 | 7.7% | 2.48 | 6.47 |

The whale case inverts correctly: the player doing 108 of 120 is now credited on **8 of 8** traits (was 2 of 7), and the minors with 4 actions each are named on none. Solo is unbroken: Alice credited on all 8. Scanning 3000 mixed groups: **38887** "kept" sentences generated, **0** naming anybody with fewer than three actions (2 leaked before I tightened the gate to cover every name in the list, not just the phrase supplier). Scanning 2000 groups for the minor-axis bug: **28522** named-action memories checked, **0** naming an action that pushes none of the trait's lead axis.

**FIX 4.** Ear locus, required sustained rate:

| allele | tier | before | after |
|---|---|---|---|
| `ear.velvetDrops` | COMMON s1 | 0.600 | 0.577 |
| `ear.bellCups` | UNCOMMON s1 | **2.000** | 0.740 |
| `ear.flatSet` | UNCOMMON s1 | **2.400** | 0.775 |
| `ear.stormFans` | UNCOMMON s2 | 1.222 | 0.915 |
| `ear.mothEars` | RARE s3 | 1.500 | 1.347 |
| `ear.pinnedSlits` | RARE s3 | 1.875 | 1.461 |
| `ear.listeningFronds` | STRIKING s4 | 1.727 | 1.951 |

Inverted pairs across all eight loci: **78 to 0**. No allele's required rate exceeds the best achievable rate. Of the eight that never appeared in 400 random-clicking groups played to adult, **four now appear** (`ear.flatSet`, `wing.nightSpan`, `spine.bladeRow`, `aura.ironOnTheAir`); the other four (`horn.duelRack`, `wing.tetherWings`, `spine.warSaddle`, `aura.heldBreath`) are all stage-4 striking and still do not, which is correct, since random clicking has no lean. Total never-expressed dropped from 8 of 69 to **6 of 91**, and all six are striking. Confirmed those are still reachable: `horn.duelRack`, `wing.tetherWings`, `spine.warSaddle` and `ear.listeningFronds` each express **200/200** in genomes that carry them under shape-tracking dedicated play at 310 actions.

**FIX 5.** Max axis deviation: early 32-variant pool **18.01% to 4.35%** (ferocity was -18.0%; worst axis now -3.1%). Full 36-variant catalogue unchanged at **3.58%**. Both pools span all eight axes. I searched all one-per-kind 4-subsets (4.02% was the global best, 4.35% the best that keeps `standGround` and `mapScrap` gated) and then hill-climbed push magnitudes on the 0.5 grid with rank and total preserved: no improvement available, so no push value was touched.

**Regression checks.** 500 groups, random logs to 400 actions: replays of the same seed and log that differed: **0**; one-hex-digit seed changes producing an identical creature: **0**. 2000 near-zero-state groups: morphs outside 0..1: **0**, non-finite: **0**; zero-action creature is 0.5 on every proportion. Behaviour signal improved: same genome different behaviour now differs on **7.31 of 8** loci (was 6.47), same behaviour different genome 4.56 (was 4.59). All three files are pure ASCII with no em or en dashes; no `Math.exp`/`pow`/`log`/trig/`random`/`Date.now`, no enums, namespaces or parameter properties introduced.

## 5. Deviations and follow-ups

- **`rollGenome` behaviour changed beyond adding alleles** (carried count is now a share of the locus, and picks are spread-weighted). Adding alleles already changes every existing seed's genome, so this is not additional churn, but it is more than "add alleles" and you should know it is in the diff. Without it, adding alleles made bareness *worse*, which I measured: dropping the mean carried from 4.5 to 4.0 pushed mean bare loci for a 90% sing group from 1.65 to 1.88.
- **Two design constants I picked and you may want to argue with**: `MORPH_BIAS 0.2` (body separation vs behaviour legibility, currently 3.29:1 in behaviour's favour) and `CREDIT_MIN_SHARE 0.5` (half an even share). At 0.34 a five-click burst early in a group's life still took sole credit on 4.55 of 8 traits, which is why it is 0.5.
- **`explore.burnedWood` and `tend.checkTeeth` are now available from action 1**, and `feed.honeycomb` and `sing.sayItsName` are not. That is a player-visible content change to the action tray, driven by the balance arithmetic, not a preference.
- **`STAGE_ACTIONS` no longer feeds `hasEarned`.** It is still used by `stageFor`, `isGrowthTick`, `progressFor` and `stageMemory`, so it is not unused, but the coupling between stage thresholds and allele pacing is gone by design.
- Nothing here touches `worker/`, `src/forge/`, `src/net/` or `src/core/types.ts`.

## NEW ALLELE IDS

These 22 need placeholder builders registered in `src/forge` (I could not add them, that directory is not mine):

```
horn.liftKnobs        horn.tallyHorns
ear.butterLobes       ear.shellEars       ear.wickTips      ear.foldedTin
wing.harvestFolds     wing.roostCloak     wing.oarSpans     wing.cleaverWings
tail.lapCurl          tail.dustBanner     tail.clubTail
spine.larderHump      spine.handholds
hide.deepFelt         hide.drumHide
eye.honeyRings        eye.quickWhites     eye.weatherEyes
aura.someoneComing    aura.coldAirOffIt
```

`hide.drumHide` and `hide.deepFelt` are the highest priority of these: they are the two that stop a sing-committed or tend-committed group rendering the `PLAIN` surface on the animal's largest visible area.
