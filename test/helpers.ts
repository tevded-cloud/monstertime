// Shared fixtures for the genetics suite.
//
// Everything here is deterministic on purpose. The seeds are generated from a
// counter rather than from crypto, and the logs are built rather than recorded,
// so every number these tests assert is exactly reproducible on any machine.
// That is what lets the suite assert equalities instead of ranges: the module
// under test is pure by construction (no Math.random, no Date.now, no
// transcendentals), so a figure that moves means the genetics moved and not
// that the run was unlucky.

import type { ActionRecord } from '../src/core/types'
import { ACTION_VARIANTS } from '../src/dna'

/**
 * A seed of the shape the server mints: 32 bytes as 64 lowercase hex chars.
 *
 * Derived from an integer with a cheap integer hash rather than taken from a
 * random source, so seed 0 is the same 64 characters in every run and on every
 * machine. It is not trying to be cryptographic; it only has to spread, so that
 * a sweep of 5000 of these is not secretly a sweep of a handful of neighbours.
 */
export function seedFor(n: number): string {
  let out = ''
  let x = (n + 1) >>> 0
  for (let i = 0; i < 16; i++) {
    // xorshift32, entirely in uint32 space so it is identical everywhere.
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    out += x.toString(16).padStart(8, '0')
  }
  return out.slice(0, 64)
}

/** One action, in the shape the server writes them. */
export function action(i: number, variantId: string, actorId: string): ActionRecord {
  return {
    id: `act-${i}`,
    variantId,
    actorId,
    actorName: actorId,
    // Ten seconds apart, which is the server's own per person cooldown, so the
    // log looks like something a group could actually have produced.
    at: 1_700_000_000_000 + i * 10_000,
  }
}

/** The same variant N times, cycled between `actors` people. */
export function oneButtonLog(n: number, variantId: string, actors = ['ann', 'bo', 'cy']): ActionRecord[] {
  const out: ActionRecord[] = []
  for (let i = 0; i < n; i++) out.push(action(i, variantId, actors[i % actors.length]))
  return out
}

/** Every variant of one kind, cycled, which is what a committed habit looks like. */
export function habitLog(n: number, kind: string, actors = ['ann', 'bo', 'cy']): ActionRecord[] {
  const pool = ACTION_VARIANTS.filter((v) => v.kind === kind && !v.minStage)
  if (pool.length === 0) throw new Error(`no ungated variants for kind ${kind}`)
  const out: ActionRecord[] = []
  for (let i = 0; i < n; i++) out.push(action(i, pool[i % pool.length].id, actors[i % actors.length]))
  return out
}

/**
 * A committed group: `share` of the log is one habit, the rest is spread over
 * everything else. This is the shape the bareness measurements are made on,
 * because a group that only ever does one thing is the case where a locus can
 * end up with nothing to express.
 */
export function committedLog(n: number, kind: string, share = 0.9): ActionRecord[] {
  const habit = ACTION_VARIANTS.filter((v) => v.kind === kind && !v.minStage)
  const rest = ACTION_VARIANTS.filter((v) => v.kind !== kind && !v.minStage)
  const actors = ['ann', 'bo', 'cy']
  const out: ActionRecord[] = []
  for (let i = 0; i < n; i++) {
    // Deterministic interleave rather than a random draw, so "90 percent" is
    // exactly 90 percent in every run instead of 90 percent on average.
    const useHabit = i % 10 < Math.round(share * 10)
    const pool = useHabit ? habit : rest
    out.push(action(i, pool[i % pool.length].id, actors[i % actors.length]))
  }
  return out
}
