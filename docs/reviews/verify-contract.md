# verify:contract

## Summary

I reviewed `src/core/types.ts` first, then traced the mechanical pipeline end to end: `src/dna/rng.ts`, `alleles.ts`, `actions.ts`, `express.ts`, all of `src/ui/`, the forge rendering/disposal path (`view.ts`, `materials.ts`, `body.ts`, `registry.ts`, `parts.ts`), `src/net/`, and `worker/monstertime.ts`. I also ran a mechanical scan for em/en-dashes, smart quotes, ellipses, non-breaking spaces, and emoji across every `.ts`/`.tsx`/`.md`/`.css`/`.html`/`.mjs`/`.json` file in the repo (none found — house style is clean).

**Two findings, most severe first:**

1. **`src/ui/Chronicle.tsx:68`** (correctness, real): `actions[trait.atAction]` is off by one. `ExpressedTrait.atAction` is the 1-indexed action count at which a trait locked in (`count = i + 1` in `src/dna/express.ts`), but the array is 0-indexed, so the correct action is `actions[trait.atAction - 1]`. Concretely: the freshest trait unlock (the row the app's own "payoff surface" exists to produce) reads `actions[length]`, which is `undefined`, and displays a blank timestamp. Once one more action lands, it silently borrows that later action's timestamp instead, making the trait look more recent than it actually was. `Memory` entries don't have this bug because they carry `at` directly from the triggering action; only `ExpressedTrait` (which has no `at` field, only `atAction`) gets reconstructed, and Chronicle.tsx is the only place doing that reconstruction.

2. **`src/forge/registry.ts:68`** (dead code, minor): `registeredIds()` is exported with a comment claiming it backs a coverage check, but nothing imports or calls it, and it isn't part of the locked `forge/index.ts` surface. Not a behavioral bug, just an unused function whose comment overstates what currently enforces it.

Everything else checked out clean: no duplicated genetics (the worker imports `rollGenome`/`variantById` from `src/dna` directly), no action-button copy that leaks pressures/axes/stat language, the four locked module surfaces match exactly, and `CreatureView.dispose()`/`rebuildWorld()`/aura-and-trait teardown correctly track a `keep` set of shared kit materials versus per-part geometries/materials, with no leaked geometries, materials, or lights found across egg, body, socket parts, or aura builders.
