# verify:originality

I read the DNA and forge modules, then rebuilt the tables in a standalone harness (copies in the scratchpad, no project file touched) and measured. Findings ranked by severity.

---

## 1. The claimed separator does not exist: morphs carry zero per-group identity

`D:\Programs\monstertime\src\dna\express.ts:769` — `morphs: deriveMorphs(pressures, count)`. `deriveMorphs` (`express.ts:485`) takes only the accumulated pressures and the action count. The genome, the seed and the carried alleles are not arguments and are not reachable from it. **Body shape is a pure function of behaviour.**

So the claim "body shape separates the remaining pairs" is false in exactly the case it was measured for. The pairs that collide on traits are the pairs that behaved the same way, and behaving the same way is precisely what makes the morphs equal.

Measured, 5000 groups, different crypto seeds, one identical 110-action log (`feed.emberfruit` x110, three actors):

| | |
|---|---|
| distinct creatures (8 traits + 8 morphs) | **1302 of 5000** |
| largest set of byte-identical creatures | **84 groups** |
| their shared body | `aura.hearthWarm, ear.velvetDrops, eye.lampGold, hide.brineArmour, horn.emberCrest, tail.anchorTail, wing.vestigialBuds`, morphs `0.821429, 0.108696, 0.178571, 0.891304, 0.108696, 0.178571, 0.821429, 0.821429` |

At N=400 with that log: 282 distinct, 46.5% of groups share a creature, and the max morph difference across all 214 colliding pairs is **exactly 0.000000**. Your 293-of-400 figure reproduces (I get 282); the count is right, the conclusion drawn from it is not.

The only thing left separating those 84 groups is colour: `paletteForSeed` (`src/forge/materials.ts:114`) draws a base hue from **4** anchors (`HIDE_ANCHORS`, `materials.ts:68`) and a glow from **3**, plus small HSL jitter. Two of those 84 groups have a 1-in-4 chance of also landing in the same hue family.

I should note the collision rate is behaviour-dependent, and 107-in-400 overstates it for genuinely random clickers. My measurements at 110 actions, 400 groups:

- uniform over all variants: 398 distinct, 1.0% collide
- uniform kind, then uniform variant: 399 distinct, 0.5%
- uniform kind, top button of the tray (what "not thinking" looks like in `ActionBar.tsx`, which renders variants in catalogue order): 393 distinct, 3.5%
- one button forever: 282 distinct, 46.5%

The exposure is not thoughtless clicking. It is **habit**. A group that settles into one thing is the group the design is built to reward, and it is the group that converges:

| behaviour, 2000 groups, 110 actions | distinct trait sets | largest identical cohort |
|---|---|---|
| 70% feed | 879 | 54 groups |
| 90% feed | 661 | 67 groups |
| 70% train | 1662 | 17 |
| 90% tend | 1699 | 8 |
| 70% give | 1921 | 3 |

---

## 2. Whole axes have no allele at some loci, so a committed group is permanently bald there

`src/dna/alleles.ts`. Counting alleles by the axis carrying their top affinity weight:

| axis | alleles with it primary | loci with no primary allele for it |
|---|---|---|
| nourish | 5 | ear, wing, spine, eye |
| vigor | 5 | horn, wing, eye |
| roam | 15 | none |
| resonance | 13 | hide |
| craft | 12 | ear |
| bond | 8 | tail, aura |
| ferocity | 10 | wing, tail |
| stillness | 12 | hide |

Sharpest case: **no ear allele mentions craft at all.** All eight (`alleles.ts:121-192`) key off bond/nourish, ferocity/roam, resonance/roam, stillness/ferocity, roam/vigor, resonance/stillness, vigor/ferocity/stillness, resonance/bond/stillness. A group committed to `give` runs craft at 248 of 570 total pressure, giving craft a centred share of +0.31 while every carried ear allele sits at -0.125 there. Every cosine goes strongly negative, `FIRST_LOCK_MIN` (`express.ts:102`, `:558`) rejects all of them, and the locus never locks.

Verified: a pure-give group **carrying the entire ear pool** grows no ears at 110, 310 or 470 actions. Across 200 random genomes at 90% give, ear is bare in **100%** of groups at 310 and 470 actions.

Same shape elsewhere, persisting past adult:

- 90% sing → **hide bare in ~82%** of groups. Resonance appears exactly once in the nine hide alleles, as a tertiary `1` in `hide.stormPelt` (`alleles.ts:481-488`). A bare hide means `surfaceFor(null)` returns `PLAIN` (`materials.ts:244`), so the group that sings the most gets the plainest skin on the largest visible surface of the animal.
- 90% feed → **spine bare in ~85%**. `spine.giftSpurs` is the only spine allele with any nourish, and it is craft-primary.
- 90% explore → aura bare in 93% at 110 actions.

---

## 3. Credit: one click can take a trait off a group that played for weeks

`express.ts:301-347`. `lean = score/pressureTotal - actions/actionTotal`. When three or four regulars split the work evenly their leans sit at ~0, so the positive-lean mass is tiny, and a single specialised click from a fifth person dominates it. `CREDIT_SHARE = 0.6` then stops the list after that one person.

Measured over 200 groups: three regulars playing ~120 varied actions, plus Dave, who only ever presses "sit near it and do nothing":

| Dave's clicks | share of group effort | traits he is **sole** credit on | traits he is named on |
|---|---|---|---|
| 1 | 0.8% | 0.42 of ~7.6 | 1.70 |
| 2 | 1.6% | **1.64** | 2.31 |
| 3 | 2.4% | 1.99 | 2.76 |
| 10 | 7.7% | 2.64 | 2.78 |

A worked instance, 118 regular actions plus Dave's two:

```
spine  spine.mossRidge  credited: Dave
> A moss ridge came in where travel knuckles had been. Dave kept sitting near it doing nothing.
```

"kept" is generated at `express.ts:626` and `:631-635` with no floor on how many times the person actually did it. Dave did it twice, ever.

The mirror case is as bad. A player who did 108 of 120 actions is credited on 2 of 7 traits, and the memories read `It took on a hearth warmth the week minor1 kept splitting ember-fruit for it.` for a person with 4 total actions.

Solo is fine: `leaning` comes out empty (lean is exactly 0), the fallback at `:324-332` fires and the one player is credited on everything.

Lesser, same area: `signatureVariant` (`express.ts:351`) accepts any variant with `relevance > 0` (`:369`), so it can name an action that pushes only the trait's *minor* axis. Observed: `It grew milestone rings the week minor1 and minor3 kept splitting ember-fruit for it.` `tail.milestoneRings` is `{roam: 2, nourish: 1}`; ember-fruit is `{nourish: 3, ferocity: 1, vigor: 1}` and pushes **zero roam**.

---

## 4. The pace gate inverts the rarity ladder

`hasEarned`, `express.ts:212-218`: `expected = STAGE_ACTIONS[allele.minStage]`, and past that point the allele demands a sustained `threshold / expected` per action, forever. For `minStage: 1`, `expected` is **5**, so a threshold of 12 becomes 2.40 per action for the rest of the creature's life.

Result: the eight UNCOMMON stage-1 alleles are the **hardest things in the catalogue**, harder than the striking ones they are supposed to sit below.

| locus | allele | tier | sustained rate needed |
|---|---|---|---|
| ear | `ear.flatSet` | UNCOMMON, stage 1 | **2.400** |
| ear | `ear.bellCups` | UNCOMMON, stage 1 | **2.000** |
| ear | `ear.pinnedSlits` | RARE, stage 3 | 1.875 |
| ear | `ear.listeningFronds` | STRIKING, stage 4 | 1.727 |
| ear | `ear.mothEars` | RARE, stage 3 | 1.500 |
| ear | `ear.stormFans` | UNCOMMON, stage 2 | 1.222 |

The same inversion holds at all eight loci (78 inverted pairs in total). `hide.travelCoat` needs 2.40 where `hide.lacquerCase` needs 1.64. `spine.pegBack` needs 2.20 where `spine.stillnessBloom` needs 1.59. An evenly-playing group runs at about 1.2 to 1.4 on any pair of axes, so these eight are gettable only inside the 5-action opening window (where `count <= expected` skips the rate check entirely) and are shut out permanently afterwards.

**Dead content list.** Nothing is unreachable in principle, but these never appeared once in 400 random-clicking groups played to adult: `horn.duelRack`, `ear.flatSet`, `wing.nightSpan`, `wing.tetherWings`, `spine.bladeRow`, `spine.warSaddle`, `aura.ironOnTheAir`, `aura.heldBreath`. `ear.flatSet` is the notable one there: threshold 12, `minStage: 1`, nominally a low-tier ear, and it needs 80% of the best achievable rate to hold.

**The 12-striking claim verifies.** With a realistic genome that carries it (2 to 4 alleles at the locus) and dedicated play, all twelve express: 200/200 for each of `horn.duelRack`, `wing.tetherWings`, `spine.warSaddle`, `ear.listeningFronds`, and 110 actions is enough for nine of the twelve (`aura.heldBreath` needs 230). Note that this only works if the group's *shape* tracks the allele, not just its load: a load-maximising player gets `spine.bladeRow` instead of `spine.warSaddle` and `wing.ashSails` instead of `wing.tetherWings`.

---

## 5. The 3.6% balance claim reproduces for the catalogue, but not for the pool that is live when it matters

Recomputed from `src/dna/actions.ts`. Over all 36 variants, total 181.5, even share 22.6875:

| axis | total | deviation |
|---|---|---|
| roam | 23.5 | **+3.58%** |
| bond / ferocity / stillness | 23.0 | +1.38% |
| resonance / craft | 22.5 | -0.83% |
| nourish / vigor | 22.0 | **-3.03%** |

Max absolute deviation **3.58%**. The claim and the file comment at `actions.ts:19` both hold.

But four variants carry `minStage: 2` (`train.standGround`, `explore.burnedWood`, `give.mapScrap`, `tend.checkTeeth`) and `availableVariants` (`actions.ts:304`) hides them below stage 2. Stage 2 starts at 18 actions, so **every action from 1 to 18 draws from a 32-variant pool** that is badly skewed:

| axis | total | deviation |
|---|---|---|
| resonance | 22.5 | **+11.80%** |
| nourish | 22.0 | +9.32% |
| bond | 21.5 | +6.83% |
| stillness | 21.0 | +4.35% |
| roam | 19.5 | -3.11% |
| vigor / craft | 19.0 | -5.59% |
| ferocity | 16.5 | **-18.01%** |

Max absolute deviation **18.0%**, five times the claimed figure. Three of the four missing variants are the ferocity-heavy ones. The reasoning in the file comment is the reason this matters: expression reads lean away from even, so a group pressing every button equally through egg and hatchling reads as resonance-and-nourish-leaning and ferocity-averse. That covers the ticks at 5 and 18, where the first traits lock in and then get `STICK_MARGIN` 0.22 plus accruing `TENURE_BONUS` protecting them.

---

## 6. Legibility holds at the kind level; a few variants are near-duplicates

Measured over 200 genomes crossed with six 90%-committed behaviour styles at 110 actions:

- same genome, different behaviour: **6.47 of 8 loci differ**
- same behaviour, different genome: 4.59 of 8

Behaviour outweighs draw, so this is not a slot machine. The six kinds are also separated: centred kind-shape cosines run from -0.56 (`explore` vs `tend`) to +0.31 (`feed` vs `tend`), with only `train`/`explore` at +0.03 and `explore`/`sing` at +0.05 near-orthogonal rather than aligned. Mean cosine within a kind 0.403, across kinds -0.099.

The exception is individual variants that duplicate each other across kinds:

| pair | cosine |
|---|---|
| `explore.burnedWood` vs `give.shedSkin` | **0.953** |
| `train.chaseYard` vs `explore.ridgeline` | 0.917 |
| `train.holdStill` vs `tend.sitNearby` | 0.893 |
| `train.climbRope` vs `explore.ridgeline` | 0.889 |
| `train.sparPadded` vs `tend.checkTeeth` | 0.885 |
| `explore.riverbank` vs `sing.whistleFar` | 0.878 |

"Taking it into the burned wood" and "giving it a shed skin" are mechanically the same act to within 5%. Low severity on its own, but it is what makes the `train`/`explore` pair the weakest axis of the six.

---

Harness files, if useful: `C:\Users\teddy\AppData\Local\Temp\claude\D--Programs\01a1285f-c4e0-4667-96be-19061613ee29\scratchpad\mt\` (`final.mjs`, `sim2.mjs`, `sim3.mjs`, `sim4.mjs`, `bare.mjs`, `rates.mjs`, `credit.mjs`, `driveby.mjs`, `signal.mjs`, `cov.mjs`, `striking2.mjs`). They import copies of the five DNA files with import specifiers rewritten for Node's type stripping; no project file was modified.
