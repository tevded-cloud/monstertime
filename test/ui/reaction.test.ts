import { describe, expect, it } from 'vitest'
import { deriveCreature, reactionTo, rollGenome } from '../../src/dna'
import { action, committedLog, seedFor } from '../helpers'

describe('the creature answers after an interaction', () => {
  it('is deterministic for one creature and completed action', () => {
    const genome = rollGenome(seedFor(12))
    const log = committedLog(80, 'give')
    const creature = deriveCreature(genome, log, null)
    const last = action(80, 'give.riverStone', 'ann')

    expect(reactionTo(creature, genome, last)).toBe(reactionTo(creature, genome, last))
  })

  it('lets accumulated upbringing change the response to the same interaction', () => {
    const genome = rollGenome(seedFor(21))
    const quiet = deriveCreature(genome, committedLog(80, 'tend'), null)
    const forceful = deriveCreature(genome, committedLog(80, 'train'), null)
    const sameAction = action(80, 'give.riverStone', 'ann')

    expect(quiet.stance).not.toBe(forceful.stance)
    expect(reactionTo(quiet, genome, sameAction)).not.toBe(reactionTo(forceful, genome, sameAction))
  })

  it('does not invent a reaction for an action the catalogue cannot read', () => {
    const genome = rollGenome(seedFor(4))
    const creature = deriveCreature(genome, committedLog(20, 'give'), null)

    expect(reactionTo(creature, genome, action(20, 'give.no-longer-here', 'ann'))).toBeNull()
  })
})
