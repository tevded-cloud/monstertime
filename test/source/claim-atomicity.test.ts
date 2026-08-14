// Whether claiming a place can be raced.
//
// THIS READS THE SOURCE RATHER THAN RUNNING IT, and that is not laziness. The
// behavioural version was written first, in test/worker/market.test.ts: two
// claim messages sent without waiting for the first answer, then assert one
// place exists. It passes. It ALSO passes with the defect reintroduced, which
// was proved by moving the await back and watching all 41 tests stay green.
//
// It cannot work, and the reason is worth writing down so nobody tries again.
// The race needs a second message to be DELIVERED while the first turn is
// suspended at its await, and nothing a test can say makes the runtime schedule
// it that way. The window is one microtask wide and the test has no handle on
// it. So a green behavioural test here says the scheduler did not happen to
// interleave, not that interleaving is safe, and those are different claims.
//
// The property is structural, so it is asserted structurally. This repo already
// does this twice, for the same reason: test/dna/purity.test.ts reads src/dna
// because determinism is a property of the text, and test/ui/dialog-visibility
// reads the stylesheet because jsdom has no top layer.
//
// WHAT THE DEFECT WAS. `claim()` reads two bounds, that this device has no
// place already and that the group is under MAX_CLAIMED, and then writes three
// rows that enforce them. Between the two sat `await hashPasscode(...)`. Every
// storage call in this object is synchronous, so a turn with no await runs to
// completion before the next message is delivered and the read-then-write is
// atomic for free. An await gives the turn back. Two claims in one batch both
// read the place row as absent and the count as under the cap, and both wrote:
// one device holding two purses, and a group able to walk past its own member
// limit. Every price in the market is computed from that count.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Line endings are normalised on the way in. This repo is edited on Windows and
// the file on disk is CRLF, so the first version of this test looked for a
// newline-brace-newline method boundary, found nothing, and reported minus one
// for every position it compared. It failed loudly rather than passing quietly,
// which is the only reason it was caught in the minute it was written.
const SOURCE = readFileSync(
  join(import.meta.dirname, '..', '..', 'worker', 'monstertime.ts'),
  'utf8',
).replace(/\r\n/g, '\n')

/** The body of one method, from its signature to the closing brace at its own
 *  indentation. Crude on purpose: a real parser here would be a second thing
 *  that can be wrong about a file whose shape this repo controls. */
function methodBody(name: string): string {
  const start = SOURCE.indexOf(`private async ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const end = SOURCE.indexOf('\n  }\n', start)
  expect(end).toBeGreaterThan(start)
  return SOURCE.slice(start, end)
}

describe('claiming a place', () => {
  it('never suspends between checking its bounds and writing them', () => {
    const body = methodBody('claim')

    // The first bound. If this comment is ever reworded the test goes red,
    // which is correct: it is naming the exact line the guard begins at, and a
    // reword is a change to the thing being guarded.
    const firstGuard = body.indexOf('A SECOND CLAIM FROM THE SAME BROWSER')
    expect(firstGuard).toBeGreaterThan(-1)

    const lastWrite = body.lastIndexOf('this.setMeta(placeKey(seat.actorId)')
    expect(lastWrite).toBeGreaterThan(firstGuard)

    const between = body.slice(firstGuard, lastWrite)
    // Zero, not "few". One await is the whole defect.
    expect(between.match(/\bawait\b/g) ?? []).toEqual([])
  })

  it('still does the slow part, just before it looks at anything', () => {
    // The other half, and without it the test above is satisfied by deleting
    // the hash entirely. The await has to exist and has to be ahead of the
    // guards, because that is what makes hoisting it a fix rather than a
    // removal.
    const body = methodBody('claim')
    const hash = body.indexOf('await hashPasscode(')
    const firstGuard = body.indexOf('A SECOND CLAIM FROM THE SAME BROWSER')
    expect(hash).toBeGreaterThan(-1)
    expect(hash).toBeLessThan(firstGuard)
  })

  it('counts the place before it writes the code row', () => {
    // A separate ordering that was already correct and is easy to undo while
    // moving the lines above around. Writing the code row first and then adding
    // one to the answer counts a person twice, because a group that predates
    // the counter has its members counted off those very rows, so every price
    // jumps by two members' worth on the first claim.
    const body = methodBody('claim')
    expect(body.indexOf("this.setMeta('claimed'")).toBeLessThan(body.indexOf('this.setMeta(held, owner)'))
  })
})
