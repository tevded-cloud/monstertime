# recheck:genetics (adversarial re-measure)

All measurements complete. Final report follows.

---

REVIEW: independent re-measurement of the D:\Programs\monstertime\src\dna rewrite (uncommitted working tree, express.ts/alleles.ts/actions.ts modified). No separate claims report exists in the repo; the agent's claims live in the rewritten code comments, cited per item below. Harness: fresh copies in scratchpad\rv\ (central.mjs, habit.mjs, bald.mjs, credit.mjs, ladder.mjs, pool.mjs, det.mjs, probe.mjs, striking.mjs, striking2.mjs, sig.mjs). I did not reuse the fix agent's own mt\ harness. No project file touched.

**1. Central promise (5000 groups, crypto seeds, one identical feed.emberfruit x110 log)**
- Claimed (express.ts:594-602): seed-derived morph bias/gain gives every group per-seed identity.
- Measured: 5000 of 5000 byte-distinct creatures (traits plus morphs), largest identical cohort 1. Morph vectors alone: 5000 distinct. Pre-fix was 1302 distinct, 84 identical.
- Verdict: AGREES. No shared creature exists to report.
- Caveat that feeds new defect 1: the trait-only cohort GREW. Largest identical 8-trait set is now ~280-310 of 5000 (two independent runs: 307, 284) vs 84 pre-fix. Byte-distinctness is carried entirely by morphs.

**2. Realistic habit cases (2000 groups, 110 actions, per-group random logs and seeds)**
- Measured (distinct trait sets / largest trait cohort, then full creature): 70% feed 897/118, 90% feed 738/117, 70% train 1704/9, 90% tend 1664/10, 70% give 1937/5. Pre-fix: 879/54, 661/67, 1662/17, 1699/8, 1921/3. Full creatures (traits plus morphs): 2000/2000 distinct, largest cohort 1, in every row.
- Verdict: full-creature convergence is fixed; trait-level convergence is essentially unchanged, and the largest feed cohort roughly doubled (67 to 117). The separator is real but it is morphs only.

**3. Baldness (90% committed, 200 groups, at 310 and 470 actions)**
- Claimed (alleles.ts:18-24): every locus answers to every axis, no permanent hole. Verified structurally: all 8 loci have every axis both as some allele's primary and mentioned (probe.mjs).
- Measured bare fractions: 90% give: ear 6.5%/8.5% (pre-fix 100%), tail 26%/21%, wing 15.5%/20.5%, hide 14.5%. 90% sing: hide 1.5%/3% (pre-fix ~82%), aura ~15%. 90% feed: spine 18%/11% (pre-fix ~85%), horn 16-20%. 90% explore: aura 10.5%/14.5% (pre-fix 93%).
- Verdict: the catalogued holes are gone and the headline numbers collapse. But 59-63% of give-committed groups still have at least one bare locus at 470 actions, from genome draw luck, not the catalogue. See new defect 2.

**4. Credit (three regulars ~120 varied actions plus a drive-by, 200 groups per row)**
- Claimed (express.ts:118-132, 343-372): presence floors (2 actions minimum, half an even share) drop visitors; "kept" requires 3 actions.
- Measured sole-credit averages: 1 click 0.000, 2 clicks 0.000 (pre-fix 1.64), 3 clicks 0.000, 10 clicks 0.170 (pre-fix 2.64; the 0.17 comes from logs where the ten clicks cluster early, when the visitor genuinely was ~20% of the room). "kept" audit over all runs: 0 memories name anyone with fewer than 3 actions at the tick. Mirror case (108-of-120 player): sole credit on 7.99 of 7.99 traits, 4-action minors never named, 0 "kept" memories about them.
- Verdict: AGREES, fixed. Bonus: the pre-fix minor-axis phrase bug is also fixed, 1196 phrase memories audited, 0 name an action that does not push the allele's lead axis (sig.mjs).

**5. Rarity ladder**
- Claimed (express.ts:224-249): rate read off the threshold alone, monotone by construction.
- Measured: rate = 0.38 + 0.114*sqrt(threshold) over all 91 alleles; 0 tier/rate inversions within every locus and 0 even cross-locus. Pre-fix: 78.
- Verdict: AGREES. Escalation (express.ts:94-106, 719-724) works: duelRack, warSaddle, listeningFronds express in 100% of carriers under tracking play; stillnessBloom expresses 100% when the mix actually balances resonance with stillness, and is correctly blocked when the plain allele matches the shape better.

**6. Early pool balance**
- Claimed (actions.ts:24-32): full catalogue within 4%, early 32-variant pool within 4.5%.
- Measured: full 3.58% max deviation (roam), early pool 4.35% max (roam). Pre-fix early pool: 18.0%. Held-back four (feed.honeycomb, train.standGround, sing.sayItsName, give.mapScrap) cover all eight axes.
- Verdict: AGREES exactly.

**7. Determinism**
- Measured: grep of src\dna finds no Math.random, Date.now, performance.now, Math.exp/pow/trig/log, no `**`, no localeCompare, no Object.keys/for-in/JSON anywhere. Only Math.imul/floor/sqrt/min/max/round on decision paths; the morph fix draws through the same integer xoshiro rng (express.ts:603-613). Runtime: 300 varied groups, inputs re-serialized with reversed and sorted key insertion order plus fresh-object replays, 0 mismatches.
- Verdict: AGREES. One doc inaccuracy: express.ts:46-48 claims the only arithmetic is addition, multiplication and square root; division is used throughout (express.ts:171, 197, 390, 575). Division is IEEE-correctly-rounded so determinism holds, but the comment as written is false.

**NEW DEFECTS INTRODUCED BY THE REWRITE**

1. Trait-silhouette convergence got worse under committed play, and the morph separation has a thin tail. src\dna\alleles.ts:953 (`wanted = max(2, round(pool/3) + rng.int(3))` gives 4-6 carried per locus, pools of 11-12) means an extreme habit shape finds its best-matching allele in nearly every genome: the largest identical trait cohort under one-button feed grew from 84 to ~300 of 5000, and 90% feed from 67 to 117 of 2000. Within that cohort the closest morph pair differs by only 0.0157 max across all eight proportions (mean pair 0.107): scenario: two one-button groups compare screenshots, same 8 traits, proportions indistinguishable to the eye, and the forge's 4 hide hue anchors give roughly 1-in-4 odds of the same hue family on any such pair. Byte-level uniqueness holds; perceptual uniqueness does not in the tail.

2. Permanent habit baldness persists via draw luck. rollGenome (src\dna\alleles.ts:946-983) does not guarantee a carried allele answering each axis at each locus, so at 470 actions 59.5% of 90%-give groups still have at least one bare locus (tail 21-26%, wing 15-20%, hide 14.5%). The player experience the fix's own comment calls "a hole" (alleles.ts:18-24) still happens at one locus for most committed groups; it is now seed-dependent rarity instead of a catalogue hole. Scenario: a give-committed group whose genome lacks tail.braided never grows any tail, forever.

3. Stale contract comment: src\core\types.ts:105-106 still says "Typically 2-4 per locus"; the rewrite made it 4-6. Plus the express.ts:46-48 arithmetic claim above. Minor, but both are exactly the kind of measured-sounding claim this module keeps failing on.

Where my numbers and the code comments disagree (even-group pair rate: comment says ~1.3, catalogue arithmetic gives 1.25), the measurement wins; none of those gaps change a verdict.
