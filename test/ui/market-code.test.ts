// A code, typed on the one screen that had nowhere to type one.
//
// THE DEFECT. App.tsx returns <Market> outright while a group is at the market,
// so <Crowd> never renders there, and the passcode field lived inside <Crowd>.
// That left the exact case the field was built for uncovered: somebody opens the
// group on a second phone, cannot reach the purse their claim is attached to,
// and the only control the screen offers is "Claim my place", which mints a
// SECOND member, hands that member a fresh purse, and raises the price of the
// two scaling eggs for everybody in the group, permanently.
//
// WHAT THIS FILE CAN AND CANNOT SEE, and it is the same limit test/ui/
// code-entry.test.ts states: there is no jsdom here (vitest.config.ts sets
// `environment: 'node'`), so nothing below renders a component or presses a
// button. It reads the source and holds wiring facts still. Every one of them
// was a real hole rather than a hypothetical one, and each is written against
// the condition that enforces the rule rather than against the data around it,
// because four tests in this repo once passed with the thing they were about
// sabotaged to `return true`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', '..', 'src')

function read(...parts: string[]): string {
  return readFileSync(join(SRC, ...parts), 'utf8')
}

const MARKET = read('ui', 'Market.tsx')
const CODE_ROW = read('ui', 'CodeRow.tsx')
const CROWD = read('ui', 'Crowd.tsx')

describe('the market screen can take a code', () => {
  it('is looking at the real files', () => {
    // Guards the guard. Several assertions below are about text that is ABSENT,
    // and an empty read satisfies every one of them while checking nothing.
    expect(MARKET.length).toBeGreaterThan(2000)
    expect(CODE_ROW.length).toBeGreaterThan(2000)
    expect(CROWD.length).toBeGreaterThan(2000)
  })

  it('renders the field, on a condition that can be true', () => {
    // This repo has shipped a finished component nothing ever called three
    // times, twice in files beside this one. An export is not a feature, and
    // neither is a call site: written as `toContain('<CodeRow')` this test
    // passed with the render sabotaged to `{false && <CodeRow …/>}`, which is
    // the same defect one layer in, and it is how this line came to be here.
    // The guard goes in with the tag, and the only thing it may be held on is
    // the purchase playing out, because that beat has no field in it.
    expect(MARKET).toContain("from './CodeRow'")
    expect(MARKET).toMatch(/\{!settling && <CodeRow actorId=\{actorId\} \/>\}/)
  })

  it('renders the same field the group panel does, and not a second one', () => {
    // The market must hold no field of its own. Two implementations of the box a
    // passcode goes into is two sets of sentences to get wrong, in front of
    // somebody holding the only copy of a code, and it is the duplication this
    // repo keeps paying for.
    expect(MARKET).not.toMatch(/<input[^>]*className="text-input"/s)
    expect(MARKET).not.toContain('enterPasscode')
    expect(MARKET).not.toContain('CODE_TROUBLE')
    expect(CROWD).toContain("from './CodeRow'")
    expect(CROWD).toContain('<CodeRow actorId={actorId} />')
    expect(CROWD).not.toContain('enterPasscode')
    expect(CROWD).not.toContain('CODE_TROUBLE')
    expect(CROWD).not.toContain('id="passcode"')
    // And the one that does exist reaches the single reader, the same way the
    // group panel's call site does.
    expect(CODE_ROW).toContain('enterPasscode(typed)')
    expect(CODE_ROW).toMatch(/<input[^>]*className="text-input"/s)
  })
})

describe('a browser that already holds a place is not offered a second one', () => {
  it('withholds the claim panel from a browser holding a code for this group', () => {
    // The whole defect in one line. `claimed` is the seat and answers "may this
    // person spend"; it is NOT the same question as "does this browser hold a
    // place here", because a code can be accepted by the far end without this
    // side ever learning which member it resolved to (judgeCode in
    // net/connection.ts adopts nothing rather than guess). In that gap the
    // screen used to offer the one control that costs the group a second member.
    expect(MARKET).toMatch(/const held = codeFor\(view\.groupId\) !== null/)
    expect(MARKET).toMatch(/\{!claimed && !held && !settling && <ClaimPlace/)
  })

  it('leaves the spend gate on the seat alone', () => {
    // The positive control beside the rule above, and it is load bearing rather
    // than decorative. The cheap way to "fix" the gap is to widen `claimed` to
    // include a held code, which would hand sliders to somebody whose purse this
    // screen cannot find: purseOf answers 0 coins for an id the market has never
    // seen, so every control would be live and every one of them dead.
    expect(MARKET).toContain('const claimed = isClaimedMember(actorId)')
    expect(MARKET).not.toMatch(/claimed = [^\n]*held/)
    expect(MARKET).not.toMatch(/const claimed = [^\n]*codeFor/)
  })
})

describe('nothing a code does on this screen is silent', () => {
  it('offers the field to somebody whose code could not be placed', () => {
    // The field hides itself on the SEAT and deliberately not on the stored
    // code. Somebody whose accepted code could not be resolved to a member is
    // exactly the person with nothing else on the screen to try, and asking the
    // storage question here would hide the one lever they have left.
    expect(CODE_ROW).toContain('const seated = isClaimedMember(actorId)')
    expect(CODE_ROW).toMatch(/if \(seated\) return null/)
    expect(CODE_ROW).not.toContain('codeFor')
  })

  it('has a sentence for an acceptance it could not place, as well as for one it could', () => {
    // 'accepted' covers two outcomes that look nothing alike to the person
    // reading them, and for a while it had one sentence: "that is you again",
    // printed over a market screen still showing no coins and no sliders.
    expect(CODE_ROW).toContain('That is you again')
    expect(CODE_ROW).toContain('That code took')
  })

  it('gives every answer that is not acceptance something to say', () => {
    // The same gate test/ui/code-entry.test.ts holds over the group panel's
    // copy, held over this one as well, because the compiler only asks for the
    // missing line while the sentences are a Record keyed by the union. Written
    // as a chain of ternaries ending in an else, a fourth answer compiles
    // perfectly and inherits the sentence about a different one.
    const said = /Record<Exclude<EnteredCode, 'accepted'>, string> = \{([\s\S]*?)\n\}/.exec(CODE_ROW)
    expect(said).not.toBeNull()
    for (const answer of ['misshapen', 'refused', 'unanswered']) {
      expect((said as RegExpExecArray)[1]).toMatch(new RegExp(`(^|\\n)\\s*${answer}:`))
    }
  })
})
