// Saying what a creature is, without ever saying something absurd.
//
// A sentence generator is exactly the kind of code that reads perfectly to
// whoever wrote it and produces "a small large creature" on the third seed
// anybody tries. So the interesting tests here are not "does it return a
// string", they are the sweeps: a thousand real creatures through it, and every
// sentence that comes out has to be one a person would actually write.

import { describe as group, expect, it } from 'vitest'
import { SUBSTANCE_AXES } from '../../src/core/types'
import type { Substance } from '../../src/core/types'
import { deriveCreature, emptySubstance, rollGenome } from '../../src/dna'
import {
  agePhrase,
  bulkPhrase,
  colourName,
  describe as describeCreature,
  dietPhrase,
  metres,
  planPhrase,
  sizeOf,
  temperament,
} from '../../src/ui/describe'
import { committedLog, oneButtonLog, seedFor } from '../helpers'

const HIDE = { h: 0.08, s: 0.42, l: 0.5 }

group('colours get names a person would use', () => {
  it('names every hue on the wheel without falling through', () => {
    for (let h = 0; h < 1; h += 0.01) {
      const name = colourName(h, 0.5, 0.5)
      expect(name.length).toBeGreaterThan(2)
      expect(name).not.toContain('undefined')
    }
  })

  it('calls a colourless thing grey rather than a grey red', () => {
    // Hue is meaningless once saturation is gone, and "vivid red" on something
    // with no colour in it at all is the kind of sentence that gives the whole
    // page away as generated.
    expect(colourName(0.02, 0.01, 0.5)).toBe('grey')
    expect(colourName(0.6, 0.02, 0.8)).toBe('off-white')
    expect(colourName(0.4, 0.03, 0.1)).toBe('near-black')
  })

  it('says dark and pale at the ends, and neither in the middle', () => {
    expect(colourName(0.35, 0.5, 0.15)).toContain('dark')
    expect(colourName(0.35, 0.5, 0.8)).toContain('pale')
    const mid = colourName(0.35, 0.5, 0.5)
    expect(mid).not.toContain('dark')
    expect(mid).not.toContain('pale')
  })

  it('never contradicts itself', () => {
    for (let h = 0; h < 1; h += 0.02) {
      for (const s of [0.05, 0.3, 0.5, 0.9]) {
        for (const l of [0.1, 0.5, 0.9]) {
          const name = colourName(h, s, l)
          expect(name).not.toMatch(/dark.*pale|pale.*dark/)
          expect(name).not.toMatch(/vivid.*muted|muted.*vivid/)
        }
      }
    }
  })
})

group('sizes come out the right way round', () => {
  const morphs = (over: Partial<Record<string, number>> = {}) => {
    const m = {} as Record<string, number>
    for (const k of ['bulk', 'neckLength', 'limbLength', 'snoutLength', 'headSize', 'eyeSize', 'tailBase', 'stance']) {
      m[k] = 0.5
    }
    return { ...m, ...over } as Parameters<typeof sizeOf>[0]
  }

  it('makes an adult bigger than a hatchling', () => {
    const young = sizeOf(morphs(), 1, 'quadruped')
    const old = sizeOf(morphs(), 4, 'quadruped')
    expect(old.length).toBeGreaterThan(young.length)
    expect(old.height).toBeGreaterThan(young.height)
  })

  it('makes a bulkier creature bigger than a slighter one', () => {
    expect(sizeOf(morphs({ bulk: 0.9 }), 4, 'quadruped').length).toBeGreaterThan(
      sizeOf(morphs({ bulk: 0.1 }), 4, 'quadruped').length,
    )
  })

  it('makes a serpent long and low rather than tall', () => {
    const snake = sizeOf(morphs(), 4, 'serpent')
    expect(snake.length / snake.height).toBeGreaterThan(6)
  })

  it('never produces a creature of no size at all', () => {
    for (const stage of [0, 1, 2, 3, 4]) {
      for (const bulk of [0, 0.5, 1]) {
        for (const plan of ['quadruped', 'serpent'] as const) {
          const s = sizeOf(morphs({ bulk }), stage, plan)
          expect(s.length).toBeGreaterThan(0)
          expect(s.height).toBeGreaterThan(0)
        }
      }
    }
  })

  it('says centimetres for small things and metres for big ones', () => {
    expect(metres(0.4)).toBe('40 cm')
    expect(metres(2.35)).toBe('2.4 m')
    // Never "0.4 m", which is not how anybody says it.
    expect(metres(0.9)).not.toContain('m ')
  })
})

group('what it has been fed', () => {
  it('says nothing at all when it has never been given anything', () => {
    expect(dietPhrase(emptySubstance())).toBeNull()
  })

  it('separates one diet from a mixed one', () => {
    const only = emptySubstance()
    only.ember = 30
    expect(dietPhrase(only)).toContain('almost entirely')

    const mixed = {} as Substance
    for (const axis of SUBSTANCE_AXES) mixed[axis] = 10
    expect(dietPhrase(mixed)).toContain('a bit of everything')
  })
})

group('temperament reads a lean, not a total', () => {
  it('says so when nothing has happened yet', () => {
    const fresh = deriveCreature(rollGenome(seedFor(2)), [], null, 0)
    expect(temperament(fresh)).toContain('not like anything in particular')
  })

  it('calls an evenly played creature settled rather than picking a winner', () => {
    // The one that matters. A group doing a bit of everything has no lean, and
    // naming whichever axis is fractionally ahead would be inventing a
    // personality out of noise.
    const even = deriveCreature(rollGenome(seedFor(2)), committedLog(240, 'feed', 0), null)
    expect(temperament(even)).toContain('a bit of everything')
  })

  it('names the lean when there is one', () => {
    const sung = deriveCreature(rollGenome(seedFor(2)), oneButtonLog(120, 'sing.humDusk'), null)
    expect(temperament(sung)).toContain('listens for you')
  })
})

group('a thousand real creatures, all describable', () => {
  it('never produces an empty, undefined or self-contradicting sentence', () => {
    for (let i = 0; i < 250; i++) {
      const genome = rollGenome(seedFor(i))
      for (const [kind, n] of [
        ['feed', 12],
        ['sing', 90],
        ['explore', 300],
        ['tend', 700],
      ] as const) {
        const creature = deriveCreature(genome, committedLog(n, kind), null)
        const entry = describeCreature(creature, genome, HIDE)
        for (const value of Object.values(entry)) {
          if (value === null) continue
          expect(typeof value).toBe('string')
          expect(value.length).toBeGreaterThan(2)
          expect(value).not.toContain('undefined')
          expect(value).not.toContain('NaN')
        }
        expect(entry.size).toMatch(/\d/)
      }
    }
  })

  it('describes both body plans without saying a serpent has shoulders', () => {
    // The kind of thing that would be nonsense on screen and pass every type
    // check on the way there.
    for (let i = 0; i < 200; i++) {
      const genome = rollGenome(seedFor(i))
      const creature = deriveCreature(genome, committedLog(120, 'feed'), null)
      const entry = describeCreature(creature, genome, HIDE)
      if (genome.plan === 'serpent') {
        expect(entry.size).not.toContain('shoulder')
        expect(entry.kind).toContain('no legs')
      } else {
        expect(entry.size).toContain('shoulder')
      }
    }
  })

  it('names every plan the roster has, buildable or not', () => {
    for (const plan of ['quadruped', 'serpent', 'multi-limb', 'biped', 'winged', 'critter', 'blob'] as const) {
      expect(planPhrase(plan).length).toBeGreaterThan(4)
    }
  })

  it('counts what has happened without ever saying "1 things"', () => {
    const genome = rollGenome(seedFor(5))
    expect(agePhrase(deriveCreature(genome, [], null, 0))).toContain('nothing')
    expect(agePhrase(deriveCreature(genome, oneButtonLog(1, 'sing.humDusk'), null))).toBe(
      'one thing has happened to it',
    )
    expect(agePhrase(deriveCreature(genome, oneButtonLog(4, 'sing.humDusk'), null))).toContain('4 things')
  })

  it('has a word for every build', () => {
    for (let b = 0; b <= 1.0001; b += 0.05) {
      expect(bulkPhrase(b).length).toBeGreaterThan(3)
    }
  })
})
