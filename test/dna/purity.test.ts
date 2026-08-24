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
// in a covered file is a defect the moment it is written, whatever the run says.
//
// WHAT IS COVERED IS A CLOSURE AND NOT A FOLDER, AND THAT IS THE FIX THIS FILE
// JUST TOOK. It scanned src/dna and nothing else, which drew the line around the
// genetics rather than around the thing the rule is actually about: code that
// two engines run and have to agree on. src/market/rules.ts is imported by the
// Durable Object AND by the browser and it decides every price, every refusal
// and which egg is in front, so two clients disagreeing about it is two people
// looking at two different markets over the same money, and it sat outside every
// determinism check in the repo. src/core/types.ts joins for the same reason one
// step down: src/dna and rules.ts both import VALUES from it, so a clock read
// there is a clock read in the genetics, and a fence with a gap in it is a
// decoration.
//
// The three of them are closed under import, which is what the last test below
// asserts: nothing covered may reach for anything that is not. That is the rule
// with teeth, because a file-local scan is walked around in one line by
// importing the hazard from next door.

import { readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', 'src')

/**
 * Covered one file at a time, beside every .ts in src/dna.
 *
 * Named rather than globbed because neither folder is covered whole and saying
 * why is the point: src/market/index.ts is the market's OTHER half and imports
 * three.js, which is exactly what rules.ts exists to keep out of a Durable
 * Object, and src/core has plenty in it that only a browser ever runs.
 */
const ALSO_COVERED = ['core/types.ts', 'market/rules.ts']

/**
 * Source with comments and string literals blanked out, so that a rule about
 * calling Math.exp is not tripped by a comment explaining why nothing calls
 * Math.exp. Blanked to spaces rather than removed so reported line numbers stay
 * true to the file.
 *
 * CHARACTER FOR CHARACTER, and that is now load bearing rather than a nicety.
 * The import scan below finds its keywords in this blanked text, where prose
 * cannot masquerade as code, and then reads the specifier out of the raw source
 * at the SAME offset. Both halves rely on one index meaning one place in both
 * strings, so the length-preserving property has a test of its own under here.
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

interface Source {
  /** Posix-shaped and relative to src, so 'dna/express.ts' reads the same in a
   *  failure message on either machine and resolves the same in the import
   *  check below. */
  name: string
  code: string
  raw: string
}

function sources(): Source[] {
  const names = [
    ...readdirSync(join(SRC, 'dna'))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => `dna/${f}`),
    ...ALSO_COVERED,
  ].sort()
  return names.map((name) => {
    const raw = readFileSync(join(SRC, ...name.split('/')), 'utf8')
    return { name, code: code(raw), raw }
  })
}

function hits(pattern: RegExp): string[] {
  const found: string[] = []
  for (const { name, code: text } of sources()) {
    text.split('\n').forEach((line, n) => {
      if (pattern.test(line)) found.push(`${name}:${n + 1}: ${line.trim()}`)
    })
  }
  return found
}

/**
 * The quoted string that starts at `from`, once whitespace and one optional
 * open bracket are stepped over. Null when what follows is not a string, which
 * is the common case: `Math.max(from, last)` in express.ts is a local variable
 * called from, and `import { LOCI }` is an import whose specifier is further on.
 */
function quotedAt(raw: string, from: number): string | null {
  let i = from
  while (i < raw.length && /\s/.test(raw[i])) i++
  if (raw[i] === '(') {
    i++
    while (i < raw.length && /\s/.test(raw[i])) i++
  }
  const quote = raw[i]
  if (quote !== "'" && quote !== '"') return null
  const end = raw.indexOf(quote, i + 1)
  return end === -1 ? null : raw.slice(i + 1, end)
}

/**
 * Every module specifier a file reaches for.
 *
 * THE KEYWORDS ARE FOUND IN THE BLANKED CODE AND THE SPECIFIER IS READ OUT OF
 * THE RAW SOURCE, which is not fussiness: the first version of this matched
 * `from '...'` over the raw text and immediately reported that
 * src/dna/shelves-give.ts imports ", blurb: ", off the line that reads
 * `label: 'the cup you drink from', blurb: '...'`. Prose ends in the word from
 * more often than anybody expects. Blanking strings first means only a keyword
 * standing in real code is ever seen, and the offsets line up because code()
 * preserves length.
 *
 * All four spellings, because the rule is about what arrives at runtime and any
 * of them brings it: the static form, a side-effect import, a dynamic import and
 * require. `import type` is deliberately NOT exempt. It is erased by the
 * compiler and cannot carry a clock today, and it is a value import the moment
 * somebody deletes one word, which is the silent version of the crossing this
 * rule exists to make loud. Nothing covered pays for the strictness: every
 * import in the set already lands inside it.
 */
function importsOf(source: Source): string[] {
  const found: string[] = []
  for (const match of source.code.matchAll(/\b(from|import|require)\b/g)) {
    const spec = quotedAt(source.raw, (match.index ?? 0) + match[1].length)
    if (spec !== null) found.push(spec)
  }
  return found
}

function resolvesInside(from: string, spec: string, names: Set<string>): boolean {
  // A bare specifier is a package, and a package is by definition not in the
  // set. three.js inside a Durable Object is the named version of this.
  if (!spec.startsWith('.')) return false
  const base = posix.normalize(posix.join(posix.dirname(from), spec))
  return names.has(base) || names.has(`${base}.ts`) || names.has(`${base}/index.ts`)
}

describe('the shared code stays engine independent', () => {
  it('reads every source file it claims to cover', () => {
    // Guards the guard. A scanner pointed at an empty folder passes everything,
    // and would go on passing after a rename. It is also what says the widening
    // actually took: drop market/rules.ts back out of the set and this is the
    // test that goes red, rather than every rule quietly covering less.
    const names = sources().map((s) => s.name).sort()
    expect(names).toEqual([
      'core/types.ts',
      'dna/actions.ts',
      'dna/alleles.ts',
      'dna/catalogue.ts',
      'dna/express.ts',
      'dna/index.ts',
      'dna/reactions.ts',
      'dna/rng.ts',
      'dna/shelves-explore.ts',
      'dna/shelves-feed.ts',
      'dna/shelves-give.ts',
      'dna/shelves-sing.ts',
      'dna/shelves-tend.ts',
      'dna/shelves-train.ts',
      'dna/sleep.ts',
      'dna/stance.ts',
      'market/rules.ts',
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

  it('leaves the blanked source the same length as the file, so an offset means one place', () => {
    // What the import scan stands on. If code() ever starts removing characters
    // instead of blanking them, every specifier below would be read from the
    // wrong offset and the closure rule would report nonsense or nothing.
    for (const source of sources()) {
      expect(source.code.length).toBe(source.raw.length)
      expect(source.code.split('\n')).toHaveLength(source.raw.split('\n').length)
    }
  })

  it('finds the imports a covered file actually has, and does not read prose as one', () => {
    // A positive control for the scan the closure rule is built on. An extractor
    // that quietly returned nothing would make that rule pass over every file in
    // the set while reading none of them, which is the shape of green this repo
    // has shipped before.
    const rules = sources().find((s) => s.name === 'market/rules.ts')
    expect(rules).toBeDefined()
    expect(importsOf(rules!).sort()).toEqual(['../core/types', '../dna'])

    // And the false positive that put the offset trick in, kept as its own
    // sentence: this is the shape of the real line in shelves-give.ts that the
    // first version of the extractor reported as an import of ", blurb: ".
    const prose = "const a = { label: 'the cup you drink from', blurb: 'Now it is.' }\n"
    expect(importsOf({ name: 'x', raw: prose, code: code(prose) })).toEqual([])
  })

  it('never calls an ambient random', () => {
    expect(hits(/\bMath\s*\.\s*random\b/)).toEqual([])
  })

  it('never reads a clock', () => {
    // Timestamps come from the log, and the log comes from the server. A clock
    // read here would make the creature depend on when it was looked at, and in
    // market/rules.ts it would make a price depend on when it was asked for.
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

  it('never imports anything from outside the gated set', () => {
    // WHAT MAKES THE SCAN A GATE RATHER THAN A FENCE. Every rule above reads one
    // file at a time, so all of them together are satisfied by a file that calls
    // Date.now through a helper it imported from src/ui. The set is closed under
    // import instead: whatever a covered file reaches for is covered too, or
    // this goes red naming the crossing.
    //
    // The way past it is deliberate rather than convenient. Either the imported
    // file joins ALSO_COVERED above and takes the rules with it, or the import
    // does not happen. There is no third answer written down here, because a
    // third answer is where the exceptions would go.
    const names = new Set(sources().map((s) => s.name))
    const strays: string[] = []
    for (const source of sources()) {
      for (const spec of importsOf(source)) {
        if (!resolvesInside(source.name, spec, names)) strays.push(`${source.name} -> ${spec}`)
      }
    }
    expect(strays).toEqual([])
  })
})
