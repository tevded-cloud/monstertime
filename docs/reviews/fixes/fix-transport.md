# fix:transport

No stray dashes. `identity.ts` was read but not modified (no defect found in it; the bug was entirely in `connection.ts`'s misuse of its exported `setLocalName`).

## Report

**1. Files touched**
- `D:\Programs\monstertime\src\net\connection.ts`

`src\net\identity.ts` was read but not modified: the review findings locate the bug entirely in how `connection.ts` misused `identity.ts`'s exports, not in `identity.ts` itself. `setLocalName` is a correct, generic "set the stored actor's name" primitive; it's still the right function for `useGroup.ts`'s `commitLocalName` (the actual "your own name" flow, unrelated to the creature).

**2. Findings fixed**

- **verify-worker.md #2 / verify-determinism.md #1** (severe, cross-file, found independently by two reviewers): client was storing the creature's name as the person's own display name.
  - Removed the `setLocalName(name)` call from `rename()` (connection.ts, was line 251). `rename()` now only sends the `{type:'name', name}` message; it does not touch local identity at all, since there is nothing local to optimistically update for a creature-name change.
  - Removed the `setLocalName(message.name)` call from the `'named'` broadcast handler (was line 153). It now updates `this.snapshot.name` (spreading a new `GroupSnapshot`, same pattern already used in `applyAction`) and calls `this.emitSnapshot()`, guarded by `if (!this.snapshot) break` for the case a `'named'` frame somehow arrives before any snapshot.
  - Rewrote both misleading comments (the one above `rename()` claiming "an immediate local update is safe," and the one above the `'named'` case claiming the server "reports what name it actually recorded for this connection") to state plainly that `'named'`/`'name'` carry the creature's name, that this is a different concept from local identity, and why conflating them was destructive (retroactive relabeling of past contributions via most-recent-name-wins, persisted through localStorage and re-sent on every future `hello`).
  - Removed the now-unused `import { setLocalName } from './identity'`.

- **verify-worker.md #4** (renaming the creature had no visible effect until reconnect): confirmed this is fixed as a direct consequence of the fix above, not a separate change. Before, the `'named'` handler updated only local identity and never touched `this.snapshot` or called `emitSnapshot()`, so the nameplate (which renders `deriveCreature(..., snapshot.name)`) could only change on a brand-new `'snapshot'` message. Now the `'named'` handler is the one place that updates `snapshot.name` and emits, so as soon as the server's `'named'` broadcast comes back after a `rename()` call, all subscribed listeners re-render with the new name, for every connected client in the group, not just the renamer. No separate optimistic-update path was added; the existing server round-trip is what now actually moves the UI.

**3. Findings in my area not fixed, and why**

None of the other findings in `verify-worker.md` or `verify-determinism.md` are in `connection.ts` or `identity.ts` (they're in `worker/monstertime.ts`, `src/ui/Chronicle.tsx`, `src/dna/express.ts`), so they're out of scope for this file-ownership slice and are left for whichever agent owns those files.

**4. Measurements**

None run; this was a static read/fix of two small files per the reviewers' exact line numbers, which matched the current code before editing (rename() at connection.ts:244-255 and the 'named' case at :148-155, prior to the edit).

**5. Deviations / follow-ups**

- No deviation from the brief's prescribed fix shape.
- Confirmed both "do not regress" items are untouched and still intact after the edit: `close()`'s ordering (closed flag first, timer cleared, handlers nulled before `socket.close()`, `open()`/`scheduleReconnect()` both return early on `closed`) and `seenActionIds` dedup/rebuild-from-snapshot logic in `handleMessage`'s `'snapshot'` case and `applyAction()` were not touched by this edit.
- Did not add a blank-line-only diff beyond restoring the blank line after the import block once `setLocalName` was removed from it, to keep the file's existing formatting.
- Follow-up for whoever owns `worker/monstertime.ts`: worth double-checking the worker's `cleanText` sanitization is applied identically to creature names as to actor names, since the client no longer re-sanitizes the creature name locally at all (it never should have), it just displays whatever `message.name` the server confirms.
