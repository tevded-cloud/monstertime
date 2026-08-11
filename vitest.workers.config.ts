import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// The Durable Object suite runs inside workerd, not in node, so it needs its
// own config and its own command. Same runtime the group will actually live in,
// with real SQLite storage, which is the point: the limits and the stage gate
// are enforced by storage reads, and a mock of storage would only ever prove
// the mock agreed with itself.
//
// It points at wrangler.dev.jsonc so the binding name, the class name and the
// SQLite backend under test are the same three the local host uses and the
// tevded.com patch will declare.
//
// Note for anyone updating this: the pool changed shape at 0.20. There is no
// `@cloudflare/vitest-pool-workers/config` entry point and no
// `defineWorkersConfig` any more, and `poolOptions.workers` is not read. It is
// a Vite plugin now, and the options below are the whole schema it accepts.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.dev.jsonc' } })],
  test: {
    include: ['test/worker/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
