# wave3:parts

**Files touched:** `D:\Programs\monstertime\src\forge\parts.ts` (only). 1422 lines to 1917.

**What I did**

Read every one of the 22 alleles in `src/dna/alleles.ts` for label, affinity and tier first, then built each shape to that meaning and to the existing construction style (chain / blade / patch / span / orb, shared `materials`, no new geometry helpers, `side` and `rand` honoured where the part is asymmetric).

- horn (2): `liftKnobs` undercut mushroom knobs (a handle, vigor+bond); `tallyHorns` a pair with cut marks parented one per joint so they follow the bend.
- ear (4): `butterLobes` a lobe too thick to hold itself up, folded over; `shellEars` a ribbon wound up a cone, tight at the head and open at the far end; `wickTips` a plain ear with a twisted frayed cord and one lit thread; `foldedTin` a twice-creased chitin sheet, hemmed and riveted.
- wing (4): `harvestFolds` a pleated sheet with three weights sitting in the hem (deliberately not a flying wing); `roostCloak` a membrane wrapped around an upright axis rather than spread along a flat one, so it reads closed; `oarSpans` two shafts with blades whose taper is above 1 (2.1), which is what separates an oar from a fin; `cleaverWings` a short `span` with a heavy chitin bar along the leading edge, three forward-tipped teeth and a squared-off tip.
- tail (3): `lapCurl` 7.4 rad of curve over 9 segments, so it closes into a coil rather than bending; `dustBanner` a cord flying a torn wave-cut streamer plus loose motes; `clubTail` deliberately unlike `anchorTail` (which is fat, hanging, ringed with studs): held up on a negative curve with an angular chitin head and two forward spikes.
- spine (2): `larderHump` a store leaning off centre with a keratin tie, scaled by `alongSpine`; `handholds` a rung on two posts with a short darker worn sleeve only where a hand lands.
- hide (2): `deepFelt`, `drumHide` appended to `HIDE_IDS`, which is the existing no-mesh path.
- eye (3): `honeyRings` three rings seated on the ball at `sqrt(0.25 - r*r)` so the bands curve with the eye instead of floating in front of it; `quickWhites` a bone ball with a small iris and pupil pushed off centre by `side`; `weatherEyes` a bar pupil long in Z and a pale band swept only across the outward face.
- aura (2): built in a new `extraAuras` table keyed by allele id (see deviation).

**Verification (not a build)**

Static parse of both files: all 91 allele ids in `alleles.ts` appear as top-level entries of a registered structure in `parts.ts`, none missing, none stray. Per structure: horns 11, ears 12, wings 12, tails 11, spines 11, eyes 12, `HIDE_IDS` 11, `AURA_IDS` 9, `extraAuras` 2 = 91 unique, matching the per-locus counts in `alleles.ts`. All eight structures are reached by a `PART.register` loop in `registerPlaceholderParts`. File is 0 non-ASCII characters; braces, parens and brackets balance at 0.

**Deviation**

For the two aura ids I registered dedicated builders in a new `extraAuras` table rather than appending them to `AURA_IDS`. `AURA_IDS` routes through `buildAura(auraFor(id))`, and `auraFor` has no entry for either id, so they fall to its hash: `aura.someoneComing` -> `motes` (hash 1451609775), `aura.coldAirOffIt` -> `stormflick` (hash 3118652966). That path would have given them pixel-identical geometry to `aura.workshopDust` and `aura.stormSmell`, which contradicts the stated rule at materials.ts:344 and the project's perceptual-uniqueness rule. The two builders use the `AURA_NODES` names, so `view.ts` still animates them, and I shaped them to survive the animation they currently inherit (30 and 54 points, against an existing range of 18 to 90).

**Deliberately not done**

No edits to `alleles.ts`, `materials.ts`, `view.ts`, `registry.ts`, `types.ts` or `package.json`. No git, no tsc, no build. The placeholder-pending-GLB framing in the file header is unchanged.

**No change needed in `types.ts` or `package.json`.**

**Changes I need someone who owns those files to make (all in `src/forge/materials.ts`, plus one in `view.ts`)**

1. `hide.deepFelt` misses every keyword in `PATTERN_WORDS` (note "deepfelt" contains "felt", not "pelt") and lands on the hash fallback `crystal`: roughness 0.14, metalness 0.1, relief 0.09. A deep felt currently renders glassy. `hide.drumHide` lands on `plain`, which is merely bland. Suggested `HIDE_SURFACES` entries:

```ts
  // A deep felt: dense nap, no shine anywhere, and it eats the rim light.
  'hide.deepFelt': { pattern: 'fuzzed', roughness: 0.99, metalness: 0, relief: 0.07, sheen: 0, wash: 0.1 },
  // A drum hide: stretched tight over the frame of the animal, one even sheen.
  'hide.drumHide': { pattern: 'banded', roughness: 0.46, metalness: 0.03, relief: 0.014, sheen: 0.03, wash: 0 },
```

2. `view.ts:473` caches the aura node on the Aura *kind*, not the allele id (`if (nextAura !== this.auraKind)`). Now that two aura alleles resolve to the same kind as two existing ones, a creature whose aura moves from `aura.workshopDust` to `aura.someoneComing` keeps the old node and never rebuilds. Fix is to track the allele id alongside the kind in that comparison. Fully distinct motion (rather than just distinct geometry) would want two new `Aura` kinds in materials.ts plus matching `stepAura` cases.
