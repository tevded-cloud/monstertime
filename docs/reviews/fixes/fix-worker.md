# fix:worker

All fixes are in. Final verification passed: 0 syntax diagnostics, 0 non-ASCII characters, `route()` and `handleMonsterTime` untouched byte for byte.

## 1. Files touched

- `D:\Programs\monstertime\worker\monstertime.ts`
- `D:\Programs\monstertime\worker\README.md`

## 2. Findings fixed, and how

**FIX 1, bypassable per-actor limits and permanent group destruction.** Three changes, because binding alone does not close it.

- `hello()` now binds the socket to one `actorId` for its life. A second `hello` with a *different* id gets an `error` and changes nothing; the same id is allowed through (that is how a display-name change works, and it moves nobody into another bucket). A hello that says nothing new no longer broadcasts `present`.
- Binding alone is insufficient: a new socket is still a new actor. So the limits that must hold against deliberate misuse are now counted **without reference to who anybody is**: `GROUP_ACTS_PER_MINUTE = 12` and `GROUP_ACTS_PER_HOUR = 120`, counted over every row in the window regardless of author. There is no bucket to pick and no id to rotate into.
- Two supporting bounds: `MAX_ACTORS = 48` distinct `actorId`s may ever act in one group (this is also what stops the "5000 entries in `bonds`" outcome the review described), and `MAX_SOCKETS = 64` open at once, without which the per-connection flood budget is reset by simply opening another connection (`fetch()` returns 503 past it).

The old `SELECT n, at ... LIMIT 1` tail read is now `LIMIT GROUP_ACTS_PER_HOUR`, so one read answers the cap, the clock clamp and the group window. That window is *exact*, not a sample, because the 120 limit is precisely what prevents a 121st row inside one hour. The two windows are counted in JS rather than SQL because there is no index on `at` alone and a `WHERE` on it would scan the whole log every time.

**On MAX_ACTIONS being terminal with no recovery.** I did not add a delete or reset path and I recommend against one: the log *is* the creature, so nothing can be removed to make room without making it a different animal, and a reset reachable by any link-holder is a worse version of the same destruction. What I did instead is make it not silent: `CAP_WARNING = 100`, broadcast to the whole group exactly once when the crossing row is written (`used === MAX_ACTIONS - CAP_WARNING`, a single event since the count increments by one). The terminal refusal now also names the remedy. The `error` type is the only channel available, since `ServerMessage` is orchestrator-owned; README explains why one `error` is group-addressed.

**FIX 2, unauthenticated GET performing schema writes.** The constructor no longer runs DDL. The three statements moved to a private `schema()`, called only from `create()`, which is only reachable from the endpoint that mints the id. Reads are guarded by `exists()`, a memoized `SELECT 1 AS ok FROM meta LIMIT 1` in a try/catch (the try is the test; there is no cheaper way to ask that is also not a write). `readSnapshot()` returns null when it fails, so both the GET and the socket path 404 with **zero rows written**. `setWebSocketAutoResponse` stays in the constructor: it is not a SQL write, the review did not flag it, and the constructor is the one thing that re-runs on every wake, so leaving it there is robust regardless of how the runtime persists it.

I did **not** touch `route()` at all, which is what guarantees the fallthrough cannot have regressed.

README: the edge rate-limit item now says the rule must cover `/api/monstertime/*`, not the create endpoint, and says why the read paths are the worse ones (no POST needed, random ids, and `run_worker_first` means every one of them wakes the script whether the group exists or not).

**FIX 3, unenforced `minStage`.** `act()` now holds the `ActionVariant` (not just a boolean from `variantById`) and refuses when `variant.minStage > 0` and the creature has not reached it. Stage comes from `deriveCreature` from `src/dna` over the object's own log, the same call every screen makes. No genetics are reimplemented and this file never learns what a stage threshold is. The answer is written to `meta.stage` as a high-water mark, which cannot go stale: stage is a function of the action count, the count only goes up. The check is deliberately **last**, after every cheap reason to refuse, so a rate-limited client cannot make the server derive.

**FIX 4, self-asserted `actorId`.** Code side: FIX 1's connection binding, which is the whole of what is reasonably possible. README gained a full `## Access control, and what it does not cover` section that states plainly that nobody is authenticated inside a group, that `present` and the snapshot hand out the ids needed to impersonate by design (bonds and trait credit are keyed by them), that a member can post actions under another member's id so the trait is credited to them and their hourly allowance is spent, and that what is bounded is a connection and not a person. It ends by saying this needs accounts and cannot be fixed by validation.

## 3. Deliberately not fixed

- **Signed/tagged group ids** (the "better" option in FIX 2). Considered and rejected, with the reasoning written into README under `### Why ids are not signed`. An HMAC tag makes every group's link valid only as long as one secret survives: rotate or lose it and every creature every group has raised is unreachable in one step with no recovery. That is a strictly worse version of exactly the permanent-destruction failure the rest of this work is guarding against. The edge rule covers the same ground without holding the links hostage to a binding. No config invented, no binding added. README states what it would take if the trade is ever revisited.
- **Findings 2 and 4 of the review** (`src/net/connection.ts`: creature name written as the person's display name, and rename having no visible effect). Not my files.
- **The `src/core/types.ts:100` comment note** about the seed being sent in full. Orchestrator owns that file.

## 4. Measurements

- **Time to permanently freeze a group.** Before: 5000 actions at 40 messages / 10s per socket, 2 messages per action, is 2 actions/s, so 2500 s = **41.7 minutes** on one socket and minutes across ten (matches the review). After: the group hour cap of 120 gives 5000 / 120 = **41.7 hours** of unbroken effort, and parallelism does not help because the ceiling is on the log, not the caller. **60x on one socket, and unbounded fan-out eliminated.**
- **Storage writes for a probe of a nonexistent group.** Before: 3 DDL statements per distinct id. After: **0**. The 100k-curl scenario now writes nothing at all.
- **Rows read per action.** Before ~41 (1 tail + up to 40 in the actor's hour). After ~161 (up to 120 group window + up to 40 actor hour + 1 existence probe). At the group ceiling that is ~19,300 rows/hour/group, ~464k/day for a group under sustained maximum abuse, against a 5M/day free budget.
- **Rows written per action.** 1, unchanged, plus one `meta` upsert the first time each new person acts and at most a few `meta.stage` upserts per group lifetime.
- **Stage derivation cost.** All four gated variants (of 36) are `minStage: 2`, and `STAGE_ACTIONS = [0, 5, 18, 48, 110]` puts stage 2 at 18 actions. So while the gate is closed the log is at most **17 rows**, and once `meta.stage` records 2 or higher no gated variant ever derives again. Worst case is one full-log derivation per group lifetime, at the moment the group first uses a gated variant late.
- **Catalogue count corrected in README:** 4 variants carry `minStage`, not 6 (verified against `src/dna/actions.ts` lines 113, 158, 247, 292; 36 variants total).

## 5. Deviations and follow-ups

- I ran a **parse-only** check via the bundled `typescript` package (`ts.createSourceFile`, `parseDiagnostics`) plus an ASCII/line-length scan. That is not a typecheck and not a build: no `tsc`, no `vite`, no `npm run build`, no git.
- **`deriveCreature` is new to the worker's compile graph.** `tsconfig.worker.json` has `lib: ["ES2023"]` and no DOM. I grepped `src/dna/express.ts` (and `alleles.ts`, `rng.ts`, `actions.ts`) for DOM globals (`document`, `window`, `performance`, `Intl`, `TextEncoder`, `structuredClone`, `console`, `localStorage`, `navigator`) and for ES2024+ methods (`toSorted`, `toReversed`, `groupBy`, `findLast`, `.at(`) and found **none**. Its imports already use `import type` correctly for `verbatimModuleSyntax`. I expect it to compile clean, but this is the one thing in my diff the orchestrator's gate should watch, since it is the first time `express.ts` is checked without the DOM lib.
- **Client compatibility.** `src/net/connection.ts:83-93` sends `hello` exactly once, in `onopen`, so once-per-connection binding cannot break the current client. Nothing there sends a second hello.
- **New 503 on the socket path.** The client will see the upgrade fail and go through its normal reconnect backoff. Another agent owns `connection.ts`; if a nicer message is wanted there, that is a follow-up, not a defect.
- **`MAX_ACTORS = 48` is a judgement call.** Every device and every cleared browser storage is a fresh `actorId`, so a real group of 10 on two devices each uses 20. 48 leaves headroom; if a real group is ever turned away it is the number to raise, not the mechanism to remove.
- The one over-100-character line remaining in the file (line 440, the `CREATE TABLE actions` string) is pre-existing and unmodified.
