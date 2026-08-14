// Whether a sentence the object writes can be read by the person it was for.
//
// The Durable Object writes refusals in the app's voice: the per person and per
// group hourly caps, three burst limits, the stage gate, waking a creature that
// is already awake, a full group, a rename too soon, a pledge bigger than a
// purse. It also broadcasts one warning, at a hundred actions from the lifetime
// cap, above which its own comment says that a group finding out by being
// refused one day is the worst possible way to learn it.
//
// All of them went to console.error. Routing them into ActionBar's line fixed
// one screen and left two, and the two it left are the ones a person is most
// likely to be refused on: the market, where ActionBar is not rendered at all,
// and the group panel, which is a modal dialog sitting in the top layer OVER
// the action bar.
//
// WHY THIS READS THE SOURCE. The three readers are React components whose
// output depends on a module store fed by a WebSocket, and this project has no
// jsdom (the node suite runs in `environment: 'node'` and nothing in
// devDependencies would provide one). So a behavioural test would need a DOM
// and a socket to assert a sentence appears. What can be asserted cheaply, and
// what the defect actually was, is structural: the store has a reader on every
// surface that can produce a refusal. That is the shape this repo already uses
// for properties that live in text rather than in behaviour, in
// test/dna/purity.test.ts and test/ui/dialog-visibility.test.ts.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const UI = join(import.meta.dirname, '..', '..', 'src', 'ui')
const NET = join(import.meta.dirname, '..', '..', 'src', 'net')

function read(...parts: string[]): string {
  return readFileSync(join(...parts), 'utf8').replace(/\r\n/g, '\n')
}

/**
 * The same source with line comments blanked to spaces.
 *
 * The first version of the console.error rule below went red against the
 * CORRECT code, because the only console.error left in that handler sits inside
 * a comment saying the store replaced one. A gate that cannot tell a rule from
 * prose about the rule is reporting the wrong thing, and test/dna/purity.test.ts
 * already learned this and blanks comments for the same reason.
 *
 * Spaces rather than deletion, so the offsets the ordering checks compare stay
 * true to the file.
 */
function code(source: string): string {
  return source.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

describe('what the object says', () => {
  it('is put into the store rather than into the console', () => {
    const connection = code(read(NET, 'connection.ts'))
    const start = connection.indexOf("case 'error': {")
    expect(start).toBeGreaterThan(-1)
    const body = connection.slice(start, connection.indexOf('\n      }', start))

    // The store, not console.error. This is the line that was there before.
    expect(body).toContain('setSentence(')
    expect(body).not.toContain('console.error')
  })

  it('still answers a typed passcode before anything else', () => {
    // The code path must come FIRST in that handler and must not be broken by
    // widening what the rest of it does. On a socket that has only just opened
    // and carries a code, a refusal is the answer to the code, and the reason
    // it is recognised by position rather than by matching the server's words
    // is that the words are the far end's to reword.
    const connection = code(read(NET, 'connection.ts'))
    const start = connection.indexOf("case 'error': {")
    const body = connection.slice(start, connection.indexOf('\n      }', start))
    expect(body.indexOf('refuseCode(')).toBeGreaterThan(-1)
    expect(body.indexOf('refuseCode(')).toBeLessThan(body.indexOf('setSentence('))
  })
})

describe('every surface a person can be refused on', () => {
  // Named one at a time rather than globbed, because the failure this catches
  // is a NEW screen arriving with no reader, and a glob over existing files
  // cannot notice a file that is not in it. Adding a screen that can refuse
  // means adding a line here, which is the point.
  const readers: Array<[string, string]> = [
    ['ActionBar.tsx', 'the six kinds, the cooldown, the stage gate and the cap warning'],
    ['Market.tsx', 'choosing an egg together, which is now the first thing anybody does'],
    ['Crowd.tsx', 'claiming a place, entering a code, renaming the group'],
  ]

  for (const [file, why] of readers) {
    it(`has a reader: ${file} (${why})`, () => {
      const source = read(UI, file)
      // Either shape counts. ActionBar subscribes directly because it has a
      // second source to reconcile against; the other two go through Said.
      const direct = source.includes('subscribeSentence')
      const shared = /from '\.\/Said'/.test(source)
      expect(direct || shared).toBe(true)
    })
  }

  it('does not leave the store with no reader at all', () => {
    // The disease this repo has shipped twice: a thing that is complete, and
    // tested, and called by nobody. The sentence store spent a whole round in
    // that state, written on every refusal and read by one screen that was not
    // rendered when most of them happened.
    const sources = readers.map(([f]) => read(UI, f)).join('\n')
    expect(/subscribeSentence|from '\.\/Said'/.test(sources)).toBe(true)
  })
})

describe('the market line', () => {
  it('carries the object sentence and not only its own refusals', () => {
    // The market knows about its own refusals (too poor, no such egg) and used
    // to show only those. Everything the OBJECT refuses arrived at a store this
    // screen never opened.
    const market = read(UI, 'Market.tsx')
    expect(market).toContain('useSaid(')
    // And it reconciles rather than picking one source and ignoring the other.
    expect(market).toMatch(/fromObject/)
  })

  it('says something while the purchase is happening', () => {
    // The live region was blanked for the whole of `settling`, so somebody
    // using a screen reader heard every five coin pledge and then silence at
    // the one moment the whole screen exists to produce. The eggs leave during
    // it, so the sentence has to carry what they carried.
    const market = read(UI, 'Market.tsx')
    const line = market.slice(market.indexOf('className="market-say"'))
    const region = line.slice(0, line.indexOf('</p>'))
    expect(region).not.toMatch(/settling \? '' :/)
    expect(region).toContain('boughtLine(')
  })
})
