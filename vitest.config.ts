import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose. That file carries `base` and the
// React plugin, which the app needs and the tests do not, and vitest prefers
// this file when both exist.
//
// The genetics suite is CPU bound and deliberately large: several of these
// tests derive thousands of creatures, because the properties they protect
// (nothing collides, nobody goes bald, credit does not leak to a passer-by)
// are distributional and cannot be seen in one creature. They are exact rather
// than approximate: every seed and every log below is fixed, and the whole
// module is pure by construction, so a number that moves means the genetics
// moved.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.mjs'],
    // test/worker runs inside workerd and imports `cloudflare:test`, which
    // does not resolve in node. It has its own config and its own command;
    // without this exclusion those files are collected here and fail on import
    // while the suite still reports every test it did run as passing.
    exclude: ['test/worker/**'],
    environment: 'node',
    // The uniqueness sweep is the long one. The default 5s would fail it on a
    // slow machine while the code was perfectly correct, which is the kind of
    // flake that gets a suite switched off.
    testTimeout: 120_000,
  },
})
