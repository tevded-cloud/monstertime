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
| App and worker typecheck | `npm run check` | exit 0, clean |
| Production build plus service worker | `npm run build` | exit 0, precache 10 files, 834 kB |
| Icon generation | `npm run icons` | exit 0, zero dependencies |

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
were fixed, an adversarial re-measure confirmed the fixes, and the PWA and mobile
layers landed. Reports are in `docs/reviews/`. What remains:

- **No tests.** Everything here was measured by throwaway harnesses in scratchpad
  folders that are now gone. The genetics module has been wrong twice while
  claiming it was right, so the measurements in `docs/reviews/` should become
  real test files. This is the highest-value remaining work.
- **The research reading list is only partly consumed.** 239 reports were
  selected; the mobile and accessibility clusters were read and applied. The
  `creature-anatomy-and-motion`, `social-async-and-retention` and
  `installable-app-and-onboarding` clusters have not been.
- **Bundle is a single 834 kB chunk.** three.js should be split out so the
  landing screen does not pull the whole renderer on a phone.
- **The app has never been exercised end to end against a real server.** The API
  needs `wrangler dev` in `tevded-site`, which was held by another session, so
  the genetics, the forge and the UI were verified directly through the dev
  server's module graph instead. Nobody has yet created a group, acted, and
  watched a trait lock in over a live socket.
- **One residual by design:** `actorId` is self-asserted, so a member can post as
  another member within a group. There are no accounts by design. It is stated in
  `worker/README.md`.
- Landing content is 871 px tall on an 812 px phone, so the join affordance sits
  just below the fold at first paint. It scrolls and its tap region measures
  correctly at 44 px; only discoverability is affected.

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

**This was deliberately not applied.** At the time of writing another Claude
session was actively working in `tevded-site` (uncommitted worker, vitest being
added). Two sessions editing one repo is how work gets silently overwritten.
Apply this only once that repo is quiet, and re-read the files first, because
they were changing under observation.

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
