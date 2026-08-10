// Every allele the genetics can express has something to draw.
//
// A trait a group actually grew, rendered as nothing, is the worst failure the
// forge has: it looks like the game is broken AND like the group's action did
// not count. The registry answers that with a loud stub rather than an empty
// space, but the stub is a safety net, not a plan, so what this file checks is
// that the net is never needed.
//
// The trap this test exists to walk into deliberately: registration is NOT a
// side effect of importing parts.ts. `registerPlaceholderParts()` must be
// called, and today the only caller is CreatureView's constructor. Anything
// that reaches PART.get before a view exists sees an empty table, so the first
// assertion here is that the table really does start empty. Without it, a
// coverage test could pass by measuring a registry some other import happened
// to have filled, and would go on passing after the call was lost.

import { beforeAll, describe, expect, it } from 'vitest'
import { LOCI } from '../../src/core/types'
import { ALLELES } from '../../src/dna'
import { FALLBACK_PART, PART, builderFor, registeredIds } from '../../src/forge/registry'
import { registerPlaceholderParts } from '../../src/forge/parts'

describe('part coverage', () => {
  it('starts with an empty registry, because importing is not registering', () => {
    expect(registeredIds()).toEqual([])
    expect(PART.get(ALLELES[0].id)).toBeUndefined()
  })

  it('falls back rather than crashing while the registry is empty', () => {
    expect(builderFor(ALLELES[0].id)).toBe(FALLBACK_PART)
  })

  describe('once the placeholder parts are registered', () => {
    // In a hook, not in this describe body. Describe bodies are evaluated
    // during collection, before any test runs, so registering there would have
    // filled the table before the two assertions above could see it empty and
    // they would have been measuring the wrong thing while appearing to pass.
    beforeAll(() => {
      registerPlaceholderParts()
    })

    it('registers a builder for all 91 alleles', () => {
      expect(registeredIds().length).toBe(ALLELES.length)
      expect(ALLELES.length).toBe(91)
    })

    it('leaves no allele without a builder', () => {
      const missing = ALLELES.filter((a) => PART.get(a.id) === undefined).map((a) => a.id)
      expect(missing).toEqual([])
    })

    it('registers nothing that is not an allele', () => {
      // An orphan builder is a renamed or deleted allele whose art stayed
      // behind, which is how a registry drifts out of step with the genetics
      // without anything failing.
      const known = new Set(ALLELES.map((a) => a.id))
      expect(registeredIds().filter((id) => !known.has(id))).toEqual([])
    })

    it('never hands back the stub for a real allele', () => {
      const stubbed = ALLELES.filter((a) => builderFor(a.id) === FALLBACK_PART).map((a) => a.id)
      expect(stubbed).toEqual([])
    })

    it('still hands back the stub for an id nobody registered', () => {
      // The net itself, checked, because the assertion above is only meaningful
      // if the fallback is genuinely reachable.
      expect(builderFor('horn.somethingNobodyBuilt')).toBe(FALLBACK_PART)
    })

    it('covers every locus, including the two that are not sockets', () => {
      // hide is a surface treatment and aura is built in creature root space,
      // so neither is a mesh hanging off a socket. Both still go through the
      // table, which is what keeps PART.get total over the catalogue and lets
      // an authored decal or effect replace either.
      for (const locus of LOCI) {
        const here = ALLELES.filter((a) => a.locus === locus)
        expect(here.length).toBeGreaterThan(0)
        expect(here.every((a) => PART.get(a.id) !== undefined)).toBe(true)
      }
    })
  })
})
