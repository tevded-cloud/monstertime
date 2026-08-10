// The promise the whole app rests on: the creature is a pure function of the
// seed and the ordered action log.
//
// Nothing is stored. Every screen, and the Durable Object itself when it checks
// a stage gate, recomputes the animal from those two things. If two callers can
// disagree, the app has no truth to fall back on, so these are the tests that
// have to hold before any of the others mean anything.

import { describe, expect, it } from 'vitest'
import { deriveCreature, rollGenome } from '../../src/dna'
import { oneButtonLog, seedFor } from '../helpers'

describe('derivation is a pure function of seed and log', () => {
  it('gives a byte-identical creature for the same inputs, twice', () => {
    const genome = rollGenome(seedFor(1))
    const actions = oneButtonLog(60, 'feed.emberfruit')
    const a = deriveCreature(genome, actions, null)
    const b = deriveCreature(genome, actions, null)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('rolls a byte-identical genome for the same seed, twice', () => {
    expect(JSON.stringify(rollGenome(seedFor(7)))).toBe(JSON.stringify(rollGenome(seedFor(7))))
  })

  it('does not depend on the identity of the arrays it is handed', () => {
    // A client that accumulated the log message by message and one that got it
    // in a single snapshot hold equal but distinct arrays. They must agree, or
    // a reconnect would silently change somebody's animal.
    const genome = rollGenome(seedFor(2))
    const built = oneButtonLog(48, 'train.chaseYard')
    const copied = built.map((a) => ({ ...a }))
    expect(JSON.stringify(deriveCreature(genome, copied, null))).toBe(
      JSON.stringify(deriveCreature(genome, built, null)),
    )
  })

  it('is not affected by deriving a different group in between', () => {
    // Catches module level state accumulating across calls, which is the way a
    // pure function usually stops being one.
    const genome = rollGenome(seedFor(3))
    const actions = oneButtonLog(40, 'sing.humDusk')
    const first = JSON.stringify(deriveCreature(genome, actions, null))
    deriveCreature(rollGenome(seedFor(4)), oneButtonLog(90, 'give.riverStone'), 'Someone else')
    expect(JSON.stringify(deriveCreature(genome, actions, null))).toBe(first)
  })

  it('grows the same creature one action at a time as it does in one go', () => {
    // Every client rebuilds from scratch on every message, so a prefix of the
    // log must derive exactly what that prefix derived when it was the whole
    // log. Without this, what you saw at action 30 could disagree with what a
    // late joiner sees when they scroll back to it.
    const genome = rollGenome(seedFor(5))
    const full = oneButtonLog(30, 'tend.brushDown')
    for (const n of [1, 5, 18, 29, 30]) {
      const prefix = full.slice(0, n)
      const once = deriveCreature(genome, prefix, null)
      expect(once.actionCount).toBe(n)
      expect(JSON.stringify(deriveCreature(genome, prefix.map((a) => ({ ...a })), null))).toBe(
        JSON.stringify(once),
      )
    }
  })

  it('reads the log in order, not as a set', () => {
    // The order of the log IS the creature: pressure is applied in sequence and
    // a trait locks against the pressure standing at that moment. If a shuffled
    // log derived the same animal, the server's insistence on authoring the
    // ordering would be pointless.
    const genome = rollGenome(seedFor(6))
    const forward = [
      ...oneButtonLog(30, 'feed.emberfruit'),
      ...oneButtonLog(30, 'explore.riverbank').map((a, i) => ({ ...a, id: `b-${i}`, at: a.at + 400_000 })),
    ]
    const swapped = [
      ...oneButtonLog(30, 'explore.riverbank'),
      ...oneButtonLog(30, 'feed.emberfruit').map((a, i) => ({ ...a, id: `b-${i}`, at: a.at + 400_000 })),
    ]
    expect(JSON.stringify(deriveCreature(genome, swapped, null))).not.toBe(
      JSON.stringify(deriveCreature(genome, forward, null)),
    )
  })

  it('gives a different creature for a different seed on the same log', () => {
    const actions = oneButtonLog(110, 'feed.emberfruit')
    const a = deriveCreature(rollGenome(seedFor(10)), actions, null)
    const b = deriveCreature(rollGenome(seedFor(11)), actions, null)
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a))
  })
})
