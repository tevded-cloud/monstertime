// The code that says which of you this is.
//
// Everything here is about the two properties that make it worth having at all:
// the server picks it, so it is not a pet's name half the group already knows,
// and only its hash is kept, so nothing can hand it back to anybody.

import { describe, expect, it } from 'vitest'
import { cleanPasscode, hashPasscode, mintPasscode } from '../../worker/passcode'

describe('minting one', () => {
  it('writes it as two words and three digits', () => {
    for (let i = 0; i < 200; i++) {
      expect(mintPasscode()).toMatch(/^[a-z]{3,12}-[a-z]{3,12}-[0-9]{3}$/)
    }
  })

  it('is accepted by its own reader', () => {
    // The two halves of this file have to agree, and it is exactly the kind of
    // pair that drifts: a mint that produces something the reader rejects locks
    // somebody out of their own group on the day they try to come back.
    for (let i = 0; i < 200; i++) {
      const code = mintPasscode()
      expect(cleanPasscode(code)).toBe(code)
    }
  })

  it('does not hand out the same code twice', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(mintPasscode())
    // Four billion combinations, five hundred draws. A collision here means the
    // randomness is not random.
    expect(seen.size).toBe(500)
  })

  it('uses more than a handful of the wordlist', () => {
    // Guards against a generator that technically works and always says amber.
    const words = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const [a, b] = mintPasscode().split('-')
      words.add(a)
      words.add(b)
    }
    expect(words.size).toBeGreaterThan(60)
  })
})

describe('reading one back', () => {
  it('forgives case, spaces and doubled hyphens', () => {
    // This is typed off a screenshot on a second phone, so the reader has to be
    // generous about everything except the code itself.
    for (const typed of ['Amber-Willow-042', '  amber willow 042 ', 'AMBER--WILLOW--042']) {
      expect(cleanPasscode(typed)).toBe('amber-willow-042')
    }
  })

  it('refuses anything that is not a code', () => {
    for (const bad of ['', 'amber', 'amber-willow', 'amber-willow-42', 'amber-willow-4242',
                       'amber-willow-abc', '1-2-333', 'x'.repeat(200), 'amber-willow-042-extra']) {
      expect(cleanPasscode(bad)).toBeNull()
    }
  })
})

describe('what gets stored', () => {
  it('is a hash, and never the code', async () => {
    const code = mintPasscode()
    const stored = await hashPasscode('group-one', code)
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
    expect(stored).not.toContain(code)
    for (const word of code.split('-')) expect(stored).not.toContain(word)
  })

  it('gives the same code a different hash in a different group', async () => {
    // Salted with the group, so somebody holding two groups' storage cannot see
    // that a person used the same code in both.
    const code = mintPasscode()
    expect(await hashPasscode('group-one', code)).not.toBe(await hashPasscode('group-two', code))
  })

  it('is stable, or nobody could ever sign back in', async () => {
    const code = mintPasscode()
    expect(await hashPasscode('g', code)).toBe(await hashPasscode('g', code))
  })

  it('changes completely for a code one character different', async () => {
    const a = await hashPasscode('g', 'amber-willow-042')
    const b = await hashPasscode('g', 'amber-willow-043')
    expect(a).not.toBe(b)
    let shared = 0
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) shared++
    // A hash where a near miss looks near would let somebody walk a guess in.
    expect(shared).toBeLessThan(a.length * 0.4)
  })
})
