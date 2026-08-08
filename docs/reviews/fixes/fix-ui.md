# fix:ui

Both fixes verified in place. Final report below.

## Files touched
- `D:\Programs\monstertime\src\ui\Chronicle.tsx`
- `D:\Programs\monstertime\src\ui\Stage.tsx`

## Findings fixed

**1. Chronicle.tsx:68 off-by-one (verify-determinism.md, finding 2).**
Changed `const stamp = actions[trait.atAction]` to `const stamp = trait.atAction >= 1 ? actions[trait.atAction - 1] : undefined`. `atAction` is the 1-indexed count set by `express.ts` (`count = i + 1`), the actions array is 0-indexed, so the triggering action is one back. Added a guard (`atAction >= 1`) so an out-of-range index falls through to `stamp === undefined`, which the existing `at: stamp ? stamp.at : 0` and `ago(0)` path already renders as an empty timestamp rather than crashing or reading a stale element. Added a comment explaining why, matching the file's existing voice. Left the sort key (`atAction`) and the `key` string untouched since those are index-space, not array-space, and are unaffected by this bug.

**2. Stage.tsx naming clarity (verify-worker.md, finding 2, my side of it).**
The actual state bug (localStorage overwrite, missing snapshot update) lives in `src/net/connection.ts` and `src/net/identity.ts`, owned by another agent. On my side, `Stage.tsx` was already functionally wiring `creature.name` in and `onRename` out correctly, but nothing in the prop or parameter names said "this is the creature's name, not yours" — which is exactly the ambiguity that let the net-side bug happen unnoticed. I:
- Renamed the `onRename` callback's parameter from `name` to `creatureName` in the `StageProps` interface, and added a comment: "Renames the CREATURE, not the caller. The person's own display name is a separate identity (set at join time) and must never be overwritten by this."
- In `NamePlate`, destructured the `name` prop as `creatureName` and renamed its `onRename` callback parameter the same way, with a matching comment above the function pointing back at the `StageProps` explanation.
- Updated the two internal references (`setDraft(name ?? '')` and `{name ?? ...}`) to use `creatureName`.

No visible copy changed: "Give it a name" placeholder and the `aria-label="Name the creature"` were already unambiguous (both already say "the creature", not "you" or "your name"), so I left them as-is per the no-unrequested-visual-changes rule. These were identifier/comment-only renames; no JSX structure, class names, or rendered strings changed.

## Findings in my area deliberately not fixed
- verify-worker.md finding 2's actual bug (localStorage overwrite via `setLocalName`) and finding 4 (rename has no visible effect until reconnect) are in `src/net/connection.ts` and `src/net/identity.ts`, explicitly owned by the other agent per the task brief. Not touched.
- verify-worker.md findings 1, 3, 5 are worker-side, out of scope for my files.

## Measurements
None run; these were read-and-patch fixes against reviewer-supplied line numbers, both confirmed correct by inspection before editing. Did not run tsc/build per instructions (orchestrator gates the wave).

## Deviations and follow-ups
None. Both fixes are self-contained within the two owned files and do not touch `src/core/types.ts` or `src/net/`.
