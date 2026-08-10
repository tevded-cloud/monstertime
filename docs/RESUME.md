# MonsterTime: resume state

Written 2026-08-08, at the point where a usage cap interrupted the first build.
This file is deliberately self-sufficient: it assumes the reader has none of the
original conversation, and it works from any account or machine.

---

## 1. What MonsterTime is

A friend group collectively raises ONE persistent 3D creature, at
`tevded.com/monstertime`.

Hidden DNA, rolled from a per-group crypto seed, decides which traits the
creature COULD grow. What the group actually does (food, training, exploration,
sounds, objects, treatment) decides which of those genes actually express.
Traits are credited to the specific friends whose behaviour caused them. Two
different friend groups must never end up with the same creature.

Repo: `D:\Programs\monstertime`

---

## 2. Status: what is actually true right now

**Gates, run and passing.** These were run, not assumed:

| Gate | Command | Result |
|---|---|---|
| App, worker and test typecheck | `npm run check` | exit 0, clean |
| Genetics and forge tests | `npm test` | exit 0, 58 passed, under 1s |
| Production build plus service worker | `npm run build` | exit 0, precache 10 files, 836 kB |
| Icon generation | `npm run icons` | exit 0, zero dependencies |
| A real Durable Object | `npm run dev:api` | serves `/api/monstertime/*` on 8787 |

Measured in a real browser, after the review fixes:

- Part coverage reconciles: **91 alleles, 91 registered builders**, 0 missing,
  0 orphans.
- Uniqueness: 5000 groups with different seeds and one identical action log give
  **5000 distinct creatures**, largest identical cohort 1. The largest identical
  trait-only cohort under one-button play is 93 (was 279).
- Committed groups no longer go bald: 8 percent at worst (was 59.5 percent).
- Touch targets on a 375 by 812 phone: all three landing controls clear 44 px of
  hit region, via invisible pads rather than redrawn chrome.
- Renderer caps pixel ratio at 1.5 on coarse pointers (measured: device 2,
  renderer 1.5, buffer 585x900 not 780x1200).
- No raw `vh` anywhere, 5 `dvh` rules, so the iOS address bar cannot clip the
  layout. No horizontal overflow.

**Verified live in a browser** against the dev server, not inferred:

- Landing screen renders, no console errors, WebGL available.
- Genetics: 69 alleles, 36 action variants. `deriveCreature` is deterministic
  (same inputs produced a byte-identical Creature across two calls).
- A 60-action group reached stage 3 (adolescent) with 7 expressed traits, each
  credited to named actors.
- Generated memory lines read well, for example: "Nobody planned ember-crest.
  Sam kept splitting ember-fruit for it, and there it was."
- 3D forge renders: 73 meshes, ~2248 triangles, live GL context, non-blank frame.
- Part coverage reconciles exactly: 69 alleles, 69 registered builders, 0
  missing, 0 orphans. Fallback builder exists and unknown ids fall back to it.

**Known caveat on part registration:** `parts.ts` exports
`registerPlaceholderParts()`, which must be CALLED. Registration is not a side
effect of importing the module. `CreatureView`'s constructor calls it, so the
app is fine, but any code touching `PART.get()` before a view exists will see an
empty registry. That is a real trap for a future test file.

---

## 3. Locked decisions (do not re-litigate these)

1. **State is derived, never stored.** The server keeps only a seed and an
   ordered action list. The creature is a pure function of those two, so the
   client and the Durable Object can be checked against each other rather than
   hoped to agree. Nothing in `src/dna/` may use `Math.random`, `Date.now`, or
   `Math.exp` (not correctly rounded, so it can differ by an ULP between engines).
2. **3D, not vector-traced 2D.** "Morph targets for proportions" is inherently
   3D, so tracing would fight the concept's own spine.
3. **All geometry is placeholder behind a registry seam.** Every visible piece
   is fetched through `PART.get(alleleId)` in `src/forge/registry.ts`. This is
   the same seam as `SPR.get` elsewhere. Code-generated art is a rejected method
   on this account: the intended replacement is hand-authored GLB parts loaded
   into the same registry keys, with no gameplay change.
4. **No accounts.** The group link is the access control, so the group id must
   stay unguessable.
5. **"Downloadable" means an installable PWA**, not a desktop binary. It is the
   only shape satisfying downloadable plus phones plus tablets plus desktop from
   one URL, and it is already the house pattern on this site.

---

## 4. What exists

```
src/core/types.ts        the shared contract; everything compiles against it
test/                    58 tests: determinism, purity, uniqueness, catalogue,
                         credit, bareness, part coverage
wrangler.dev.jsonc       LOCAL ONLY host for the worker; never deploys
worker/dev-entry.ts      the smallest stand-in for the tevded.com worker
src/dna/                 rng, alleles (69), actions (36), express, index
src/forge/               registry, body, parts, materials, view, index
src/ui/                  main/App/Stage/ActionBar/Crowd/Chronicle/Landing/useGroup
src/net/                 identity, connection, index
worker/monstertime.ts    Durable Object + API, typechecks clean
worker/README.md         the tevded-site integration patch, written by hand
scripts/deploy.mjs       stages dist into tevded-site/public/monstertime
docs/RESEARCH-READING-LIST.md   239 selected reports (see section 6)
```

---

## 5. What is NOT done

Since the first draft of this file, all four skeptic passes ran, their findings
were fixed, an adversarial re-measure confirmed the fixes, the PWA and mobile
layers landed, and then (2026-08-10) the app was run against a real Durable
Object for the first time. What remains:

- **The tevded-site integration, which is the only thing between this and
  being live.** See section 7. It is a decision to make, not a wait.
- **The research reading list is only partly consumed.** 239 reports were
  selected; the mobile and accessibility clusters were read and applied. The
  `creature-anatomy-and-motion`, `social-async-and-retention` and
  `installable-app-and-onboarding` clusters have not been.
- **Bundle is a single 817 kB chunk.** three.js should be split out so the
  landing screen does not pull the whole renderer on a phone.
- **Worker tests.** The genetics and the forge are covered (58 tests); the
  Durable Object is not. `wrangler.dev.jsonc` and
  `@cloudflare/vitest-pool-workers` are both already in place for it, so the
  limits, the stage gating and the 404-writes-nothing rule are the next suite.
- **One residual by design:** `actorId` is self-asserted, so a member can post as
  another member within a group. There are no accounts by design. It is stated in
  `worker/README.md`.
- Landing content is 871 px tall on an 812 px phone, so the join affordance sits
  just below the fold at first paint. It scrolls and its tap region measures
  correctly at 44 px; only discoverability is affected.

### Settled on 2026-08-10

- **There is a git remote.** `tevded-cloud/monstertime`, private. Before this,
  every commit existed on exactly one disk with no deployed bundle as a second
  copy.
- **Two clients derive the same creature from the same log.** This was the
  load-bearing untested assumption: state is derived and never stored, so
  client agreement is what everything else rests on, and the app had never
  spoken to a live server at all. Two browsers on one group, three actions
  taken in the first: the second's rendered trait list matched allele for
  allele from its own socket stream, and a creature derived independently in
  each tab hashed identically (SHA-256 `a0b4d123...384ed0`, 3907 bytes), as did
  the snapshot each was working from. Both tabs share one JS engine, so what is
  proven is client agreement and live socket convergence, not cross-engine
  float agreement; that is what `test/dna/purity.test.ts` guards instead.
- **The two PWA product gaps are fixed** (the dead install entry point and the
  missing offline view). See the commit for what was decided and why.
- **There are tests.** 58, seeded and exact, and sabotage-proved rather than
  assumed. They independently reproduce the recorded figures rather than
  inheriting them: 91 alleles, 5000 of 5000 distinct, 1845 distinct trait sets
  against the reports' 1853, worst bareness 5.0 percent against their 7.2.

### Two things in the older docs that are stale, and must not be acted on

1. `docs/reviews/wave3/wave3-mobile.md` says the device pixel ratio cap is not
   in `view.ts`. It is, at `pixelRatioCap()` line 71, applied at lines 199 and
   282. The review predates the fix.
2. This file used to say the tevded-site work was blocked until another
   session's work settled. That will never clear on its own: that repo has been
   dirty across a dozen apps for days and everything staged in it is already
   deployed. Section 7 is a decision, not a queue.
3. "0.00 drive-by credit" is stale wherever it appears as a current figure.
   `wave3-genome.md` records a 3-click visitor moving to 0.210 after the genome
   rewrite and says the reviewer's 0.00 did not reproduce even on the baseline.
   The invariant that survived, and that `test/dna/credit.test.ts` asserts, is
   that a ONE-click visitor takes sole credit on nothing.

---

## 6. The research library reading list

`docs/RESEARCH-READING-LIST.md` holds 239 reports selected from
`D:\Programs\GameTev\research` by matching report frontmatter against
MonsterTime's design vector. 694 reports were swept. 45 rejected near misses are
listed so the selection can be audited rather than trusted.

**Selection was mechanical, by frontmatter, not by folder name.** Keep it that
way. Picking folders that sound relevant is the failure that put 25 of 235
reports into a fleet once already. Note that `bestiary` is load-bearing here
despite the creature being fictional, because those reports carry skeleton,
gait and morph frequency data, and MonsterTime deforms one body via morphs.

The five clusters, none of which have extracted requirements yet:
`accessibility`, `mobile-touch-responsive`, `installable-app-and-onboarding`,
`creature-anatomy-and-motion`, `social-async-and-retention`.

---

## 7. tevded-site integration (NOT applied, and why)

`tevded.com` is one Cloudflare Worker. It already runs a Worker with a
SQLite-backed Durable Object, added for ColorTime's shared rooms. That is the
pattern to follow, and it confirms shared state is free on this plan: the
creator's own comment in `wrangler.jsonc` records that SQLite is "what puts
rooms on the free plan".

MonsterTime needs, in `D:\Programs\tevded-site`:

1. `wrangler.jsonc`: add `"/api/monstertime/*"` to `assets.run_worker_first`;
   add a second `durable_objects` binding `MONSTER_GROUP` for class
   `MonsterGroup`; add a NEW migration `{ "tag": "v2", "new_sqlite_classes":
   ["MonsterGroup"] }`, leaving `v1` in place.
2. `worker/index.ts`: import and delegate to `handleMonsterTime`, re-export
   `MonsterGroup`, keep the existing `env.ASSETS.fetch(request)` fallthrough.
3. `public/_redirects`: add `/monstertime /monstertime/ 301`.
4. `public/_headers`: add the manifest content-type and `sw.js` no-cache plus
   `Service-Worker-Allowed: /monstertime/` entries, matching the symptime block.

**Still not applied, and the reason has changed.** The original reason was that
another session held the repo. That is no longer a thing to wait for: it has
been dirty across a dozen apps for days and everything staged in it is already
deployed. This is now a decision about a production migration.

What makes it one, confirmed against the files on 2026-08-10:

- `wrangler.jsonc` has exactly one binding (`ROOMS`/`Room`), one migration
  (`v1`), and `run_worker_first` scoped to `/colortime/room/*` with a comment
  saying that is deliberately the only path. The patch adds a second Durable
  Object binding and a `v2` migration tag to the SAME worker backing ColorTime's
  live shared rooms with real SQLite DO state. `v1` must not be edited.
- `test/site/routing.test.ts` in that repo exists specifically to assert that
  the site with the script and the site without answer identically. Adding a
  MonsterTime branch to `worker/index.ts` needs that test extended, and
  `npm test` there green before and after.
- The cross-repo import `../../monstertime/worker/monstertime` pulls this
  repo's `src/dna` into tevded-site's `tsc -b`, which `npm run deploy` runs. It
  also means a clone of tevded-site cannot build without monstertime sitting
  beside it. `worker/README.md` rules out copying the genetics, so this needs a
  real answer: submodule, or a vendoring step in the build.

**The deploy surface is the hazard, not the patch.** `npm run deploy` there
publishes FILESYSTEM STATE, not git: vite copies all of `public/` into `dist/`,
untracked folders included, so `git status` in that repo describes neither what
is live nor what is not. `public/` currently holds 15 app folders. Among them
`public/titime` is fully staged and wired into `_headers` and `_redirects`,
while titime's own `docs/VERIFICATION.md` says it must not be published. Any
deploy, for any reason, publishes it. Use `wrangler versions upload` for a
preview URL rather than promoting blind.

Judging whether something is live: every path returns 200, because a missing
file under a `_headers` rule returns the site fallback wearing the right
Content-Type. Judge by `<title>` and byte size, never the status code. The
fallback was 1251 bytes and is now 892; both are titled `tevded`, so the title
is the reliable tell and the size is not. Send `Cache-Control: no-cache`, since
edge caches keep serving the old fallback after a real file lands. A deploy can
also fail once with a Cloudflare API error and succeed on retry with nothing
changed, so retry before believing it.

See `worker/README.md` for the exact patch text.

---

## 8. How to continue

**In a NEW session or on the other account**, this file is enough. Do this in
order:

1. `cd D:\Programs\monstertime && npm install`
2. Run the gates in section 2 and confirm they still pass.
3. Highest value first: the **worker and transport skeptic pass**, since it is
   the only fully uncovered risk and it can take down the whole domain.
4. Then the PWA unit, then the mobile/responsive unit grounded in the reading
   list, then the requirement extracts if wanted.

**In the ORIGINAL session only**, the two workflows can be resumed so completed
agents replay from cache instead of re-running:

- build + verify: run id `wf_f0be7bcf-697`, script at
  `~\.claude\projects\D--Programs\01a1285f-c4e0-4667-96be-19061613ee29\workflows\scripts\monstertime-oneshot-wf_f0be7bcf-697.js`
- library selection: run id `wf_505cc890-82c`, script alongside it

Resume is same-session only. From another account, re-dispatch fresh using this
file as the brief.

**Effort mode:** ultracode suits the remaining fan-out (skeptics, requirement
extracts). Drop to high for the fixes, the commits, and the tevded-site patch.
