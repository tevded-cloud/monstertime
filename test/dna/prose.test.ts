// The words the app actually says after an action.
//
// These are data with a grammar contract, not decoration. The stage ticker
// prefixes `past` with either "You" or a person's name, while the chronicle
// prefixes `memory` with "Ana kept". A missing or wrongly shaped line reaches a
// player as "You strawberries" or "Ana kept fed it", and TypeScript alone can
// only prove that a string exists.

import { describe, expect, it } from 'vitest'
import {
  ACTION_METHODS,
  ACTION_VARIANTS,
  availableVariants,
  memoryOf,
  methodById,
  methodFits,
  pastTense,
} from '../../src/dna/actions'

const BAD_PUNCTUATION = /[!\u2013\u2014\u2018\u2019\u201c\u201d]/u

function opening(phrase: string): string {
  return phrase.split(/\s+/u)[0]
}

describe('the complete catalogue has words of its own', () => {
  it('covers all 222 actions in both voices', () => {
    expect(ACTION_VARIANTS).toHaveLength(222)

    for (const variant of ACTION_VARIANTS) {
      const mine = pastTense(variant.id, true)
      const theirs = pastTense(variant.id, false)
      const memory = memoryOf(variant.id)

      for (const phrase of [mine, theirs, memory]) {
        expect(phrase, variant.id).not.toBeNull()
        if (phrase === null) continue
        expect(phrase).toMatch(/^[a-z]/u)
        expect(phrase).not.toMatch(/[.!?]$/u)
        expect(phrase).not.toMatch(BAD_PUNCTUATION)
      }

      // These are the three actual sentence frames. Keeping them here makes a
      // failed value print in the context a person will read rather than as an
      // isolated fragment.
      expect(`You ${mine}.`).not.toContain('null')
      expect(`Ana ${theirs}.`).not.toContain('null')
      expect(`Ana kept ${memory}.`).not.toContain('null')
    }
  })

  it('does not substitute labels into one repeated sentence', () => {
    const past = ACTION_VARIANTS.map((variant) => pastTense(variant.id, false) ?? '')
    const memories = ACTION_VARIANTS.map((variant) => memoryOf(variant.id) ?? '')

    expect(new Set(past).size).toBe(past.length)
    expect(new Set(memories).size).toBe(memories.length)

    const pastOpenings = new Map<string, number>()
    const memoryOpenings = new Map<string, number>()
    for (const phrase of past) pastOpenings.set(opening(phrase), (pastOpenings.get(opening(phrase)) ?? 0) + 1)
    for (const phrase of memories) memoryOpenings.set(opening(phrase), (memoryOpenings.get(opening(phrase)) ?? 0) + 1)

    // The present catalogue has more than eighty openings in each voice. The
    // floor leaves room for ordinary additions while still catching a shelf
    // rewritten as sixty copies of "fed it X".
    expect(pastOpenings.size).toBeGreaterThanOrEqual(60)
    expect(memoryOpenings.size).toBeGreaterThanOrEqual(60)
    expect(Math.max(...pastOpenings.values())).toBeLessThanOrEqual(30)
    expect(Math.max(...memoryOpenings.values())).toBeLessThanOrEqual(30)
  })
})

describe('manner labels also survive the sentence frame', () => {
  it('does not turn Ana into you or a finished act into present tense', () => {
    for (const method of ACTION_METHODS) {
      expect(method.label).not.toMatch(/\byour\b/iu)
      expect(method.label).not.toMatch(/\bit is\b/iu)
    }
    expect(methodById('train.tired')?.label).toBe('until tired')
    expect(methodById('sing.underBreath')?.label).toBe('barely aloud')
  })
})

describe('what an unhatched egg can truthfully be offered', () => {
  it('contains no food, work, outing, hidden gift, or body-dependent action', () => {
    const egg = availableVariants(0)
    const ids = new Set(egg.map((variant) => variant.id))

    expect(egg.length).toBeGreaterThan(10)
    for (const variant of egg) {
      expect(['feed', 'train', 'explore']).not.toContain(variant.kind)
    }

    const eggGifts = egg.filter((variant) => variant.kind === 'give').map((variant) => variant.id)
    expect(eggGifts).toEqual(['give.riverStone', 'give.seaGlass', 'give.mapScrap'])
    for (const id of eggGifts) {
      expect(methodFits(id, 'give.leftOut')).toBe(true)
      expect(methodFits(id, 'give.fuss')).toBe(true)
      expect(methodFits(id, 'give.hidden')).toBe(false)
    }

    const needsABody = [
      'sing.tapTheBowl',
      'sing.stampAlong',
      'sing.whistleFar',
      'sing.callFromDoor',
      'sing.twoNoteCall',
      'sing.breathOnly',
      'sing.nameOnce',
      'sing.humToYourself',
      'sing.listThings',
      'sing.repeatBack',
      'tend.watchItSleep',
      'tend.letItLean',
      'tend.shareTheStep',
      'tend.waitOutRain',
      'tend.mendTheDoor',
      'tend.freshWater',
    ]
    for (const id of needsABody) expect(ids.has(id), id).toBe(false)
  })
})
