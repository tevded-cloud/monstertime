// The genetics module promises, in express.ts's own header, that every decision
// affecting a trait is built from addition, multiplication, division and square
// root and nothing else, because those four are the operations IEEE 754 requires
// to be correctly rounded and therefore the only ones guaranteed to return the
// same bits in a browser and in workerd.
//
// That promise cannot be checked by deriving creatures, because a call to
// Math.exp agrees with itself perfectly on one machine and only diverges across
// two engines, which is precisely the situation no test run ever observes. So
// it is checked at the source: a transcendental, a clock or an ambient random
// in this folder is a defect the moment it is written, whatever the run says.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DNA_DIR = join(import.meta.dirname, '..', '..', 'src', 'dna')

/**
 * Source with comments and string literals blanked out, so that a rule about
 * calling Math.exp is not tripped by a comment explaining why nothing calls
 * Math.exp. Blanked to spaces rather than removed so reported line numbers stay
 * true to the file.
 */
function code(source: string): string {
  let out = ''
  let i = 0
  const keep = (ch: string): string => (ch === '\n' ? '\n' : ' ')
  while (i < source.length) {
    const two = source.slice(i, i + 2)
    if (two === '//') {
      while (i < source.length && source[i] !== '\n') out += keep(source[i++])
      continue
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      while (i < stop) out += keep(source[i++])
      continue
    }
    const ch = source[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      out += ' '
      i += 1
      while (i < source.length) {
        if (source[i] === '\\') {
          out += '  '
          i += 2
          continue
        }
        if (source[i] === ch) {
          out += ' '
          i += 1
          break
        }
        out += keep(source[i++])
      }
      continue
    }
    out += ch
    i += 1
  }
  return out
}

function sources(): { name: string; text: string }[] {
  return readdirSync(DNA_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((name) => ({ name, text: code(readFileSync(join(DNA_DIR, name), 'utf8')) }))
}

function hits(pattern: RegExp): string[] {
  const found: string[] = []
  for (const { name, text } of sources()) {
    text.split('\n').forEach((line, n) => {
      if (pattern.test(line)) found.push(`${name}:${n + 1}: ${line.trim()}`)
    })
  }
  return found
}

describe('src/dna stays engine independent', () => {
  it('reads every source file it claims to cover', () => {
    // Guards the guard. A scanner pointed at an empty folder passes everything,
    // and would go on passing after a rename.
    const names = sources().map((s) => s.name).sort()
    expect(names).toEqual([
      'actions.ts',
      'alleles.ts',
      'express.ts',
      'index.ts',
      'rng.ts',
      // sleep.ts is the one that had to be argued about. It is the only file in
      // the module that is about wall clock time, so it is the file somebody
      // will one day reach for Date.now in, and the rule it has to keep is
      // exactly the one this suite checks: the instant is a parameter. A day
      // cycle in here is a remainder, never a wave, because there is no sine
      // that returns the same bits in a browser and in workerd.
      'sleep.ts',
      'stance.ts',
    ])
  })

  it('blanks comments and strings before matching', () => {
    // Guards the guard the other way: if the stripper stopped working, every
    // rule below would start reporting the header comments that discuss them.
    const stripped = code('const a = 1 // Math.random()\nconst b = "Date.now()"\nMath.random()')
    expect(stripped).not.toContain('Date.now')
    expect(stripped.split('\n')[0]).not.toContain('Math.random')
    expect(stripped.split('\n')[2]).toContain('Math.random')
  })

  it('never calls an ambient random', () => {
    expect(hits(/\bMath\s*\.\s*random\b/)).toEqual([])
  })

  it('never reads a clock', () => {
    // Timestamps come from the log, and the log comes from the server. A clock
    // read here would make the creature depend on when it was looked at.
    expect(hits(/\bDate\s*\.\s*now\b|\bnew\s+Date\b|\bperformance\s*\.\s*now\b/)).toEqual([])
  })

  it('never calls a transcendental', () => {
    // The named hazard. These are the functions IEEE 754 never required to
    // agree, so two engines may legitimately return different bits.
    const banned =
      /\bMath\s*\.\s*(exp|expm1|pow|log|log1p|log2|log10|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|cbrt|hypot)\b/
    expect(hits(banned)).toEqual([])
  })

  it('never uses the exponent operator', () => {
    // `**` is pow by another name, with the same freedom to differ.
    expect(hits(/[^*]\*\*[^*]/)).toEqual([])
  })

  it('never iterates an object with for...in', () => {
    // Trait credit is ordered, and ordering that comes from property
    // enumeration rather than from an explicit sort is how two screens end up
    // disagreeing about whose horns those are.
    expect(hits(/\bfor\s*\([^)]*\bin\b[^)]*\)/)).toEqual([])
  })

  it('never orders anything by object key enumeration', () => {
    expect(hits(/\bObject\s*\.\s*(keys|entries|values)\b/)).toEqual([])
  })
})
