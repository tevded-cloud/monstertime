// Somewhere to type the code, and one reader for what gets typed.
//
// The defect this covers had no failing assertion anywhere, because there was
// nothing to assert against: the server has understood a code on a hello for as
// long as codes have existed, the browser that minted one puts it on every
// hello by itself, and the app had no box to type one into. So a code worked in
// exactly the one place it is never needed, while the card people save to their
// photos said "type this to be yourself again on any phone".
//
// WHAT THIS FILE CAN AND CANNOT SEE. There is no jsdom here (vitest.config.ts
// sets `environment: 'node'` and nothing in devDependencies would provide one),
// so nothing below renders a component or presses a button. What it can do is
// read the source and hold three wiring facts still, each of which was a real
// hole rather than a hypothetical one. The behaviour of the reader itself is
// not repeated here: it is covered against the real function in
// test/worker/passcode.test.ts, and a second set of expectations about the same
// shape is exactly the duplication the second test below exists to forbid.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', 'src')

function read(...parts: string[]): string {
  return readFileSync(join(SRC, ...parts), 'utf8')
}

const CROWD = read('ui', 'Crowd.tsx')
const CODE_ROW = read('ui', 'CodeRow.tsx')
const GROUP = read('ui', 'useGroup.ts')

/** Every app source file, so a sweep is over the whole app and not over the
 *  handful of files somebody remembered. */
function appSources(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map((name) => readFileSync(join(SRC, name), 'utf8'))
}

describe('a code has somewhere to be typed', () => {
  it('is looking at the real files', () => {
    // Guards the guard. Every assertion below is about text that is absent, and
    // an empty read would satisfy most of them while checking nothing at all.
    expect(CROWD.length).toBeGreaterThan(2000)
    expect(CODE_ROW.length).toBeGreaterThan(2000)
    expect(GROUP.length).toBeGreaterThan(2000)
    expect(appSources().length).toBeGreaterThan(10)
  })

  it('puts a field on the group panel and sends what was typed', () => {
    expect(CROWD).toContain("from './CodeRow'")
    expect(CROWD).toContain('<CodeRow actorId={actorId} />')
    expect(CODE_ROW).toContain('enterPasscode(typed)')
    // A text input rather than any control: this gets typed off a photograph on
    // a phone, and the one thing it must never be is a thing to tap.
    expect(CODE_ROW).toMatch(/<input[^>]*className="text-input"/s)
  })

  it('offers it to somebody who is not already a member on this browser', () => {
    // The panel that makes a NEW place hides itself for anybody who already has
    // one here, and this one has to hide itself on the same question or the two
    // would disagree about who is being asked. Written against the condition
    // rather than against a rendered tree because there is no tree to render.
    expect(CODE_ROW).toContain('const seated = isClaimedMember(actorId)')
    expect(CODE_ROW).toMatch(/if \(seated\) return null/)
  })
})

describe('one reader, and it is the one the server uses', () => {
  it('has one component implementation and two call sites', () => {
    const sources = appSources()
    expect(sources.filter((source) => /function CodeRow\(/.test(source))).toHaveLength(1)
    const calls = sources.flatMap((source) => source.match(/<CodeRow actorId=/g) ?? [])
    expect(calls).toHaveLength(2)
    expect(CROWD).not.toContain('enterPasscode')
    expect(CROWD).not.toContain('CODE_TROUBLE')
    expect(CROWD).not.toContain('id="passcode"')
  })

  it('takes the shape off the worker rather than restating it', () => {
    expect(GROUP).toMatch(/import \{ cleanPasscode \} from '\.\.\/\.\.\/worker\/passcode'/)
  })

  it('has no second reader anywhere in the app', () => {
    // The failure this forbids is not a crash. A second shape check that folded
    // case but not doubled hyphens would refuse a code the server would have
    // taken, in front of somebody holding their only copy of it, and every test
    // either side of it would stay green: both readers would be individually
    // correct about their own rules.
    const shaped = appSources().filter((source) => /\{3,\s*12\}/.test(source))
    expect(shaped).toEqual([])
  })
})

describe('nothing about it fails silently', () => {
  it('gives every answer that is not acceptance something to say', () => {
    // The compiler is the real gate here: the sentences are a Record keyed by
    // the union, so a fourth way for this to go wrong does not build until
    // somebody writes the line for it. What this test holds still is that the
    // gate stays the kind of gate that can fire. Written as a chain of ternaries
    // ending in an else, which is what it was first, a new answer compiles
    // perfectly and inherits the sentence about a different one.
    const union = /export type EnteredCode =([^\n]*)/.exec(GROUP)
    expect(union).not.toBeNull()
    const answers = [...(union as RegExpExecArray)[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1])
    expect(answers).toContain('accepted')
    expect(answers.length).toBeGreaterThan(2)

    const said = /Record<Exclude<EnteredCode, 'accepted'>, string> = \{([\s\S]*?)\n\}/.exec(CODE_ROW)
    expect(said).not.toBeNull()
    for (const answer of answers) {
      if (answer === 'accepted') continue
      expect((said as RegExpExecArray)[1]).toMatch(new RegExp(`(^|\\n)\\s*${answer}:`))
    }
  })

  it('keeps a code that worked, the way the claim path keeps a minted one', () => {
    // Without this it is a field that works once and asks again on the next
    // launch, which is the same as not having it: the code is on a photograph,
    // and being asked for it every visit is how a photograph gets deleted.
    const entering = /export async function enterPasscode[\s\S]*?\n}/.exec(GROUP)
    expect(entering).not.toBeNull()
    expect((entering as RegExpExecArray)[0]).toContain('keepCode(')
  })
})
