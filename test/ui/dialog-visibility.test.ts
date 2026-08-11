// A dialog that is closed has to stop being on screen.
//
// This exists because of a specific bug that shipped and survived a whole round
// of testing. `.sheet` sets `display: flex`, and the rule that hides a closed
// dialog, `dialog:not([open]) { display: none }`, lives in the browser's own
// stylesheet. Any author rule beats a user agent rule, so setting display on a
// dialog silently cancels the browser's hiding of it: close() ran, the `open`
// attribute went away, and the panel stayed painted over the app forever.
//
// The reason it survived testing is the part worth keeping in mind. Every test
// asserted `expect(dialog.open).toBe(false)`, and that was true the entire
// time. `open` is a property about state, not a statement about whether
// anybody can still see the thing, and the two had come apart.
//
// A DOM test cannot cover this: jsdom does not implement the top layer or
// showModal, so the very behaviour in question is not there to test. So it is
// checked where it actually lives, in the stylesheet.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'index.css'), 'utf8')

/** Every selector in the file that sets a `display` value, with that value. */
function displayRules(): { selector: string; value: string }[] {
  const found: { selector: string; value: string }[] = []
  // Rules are `selector { ... }`; nested at-rules are flattened by taking the
  // innermost brace pair, which is enough for a file written in plain CSS.
  const rule = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = rule.exec(CSS)) !== null) {
    const body = match[2]
    const display = /(?:^|;)\s*display\s*:\s*([a-z-]+)/.exec(body)
    if (display) found.push({ selector: match[1].trim().replace(/\s+/g, ' '), value: display[1] })
  }
  return found
}

describe('a closed dialog is not on screen', () => {
  it('finds display rules at all, so this test is looking at something', () => {
    // Guards the guard: a parser that matched nothing would pass every
    // assertion below while checking nothing.
    expect(displayRules().length).toBeGreaterThan(5)
  })

  it('hides the sheet when it has no open attribute', () => {
    const hides = displayRules().filter(
      (r) => /\.sheet:not\(\[open\]\)/.test(r.selector) && r.value === 'none',
    )
    expect(hides.length).toBeGreaterThan(0)
  })

  it('pairs every display set on a dialog class with a rule that hides it closed', () => {
    // Written against the class rather than the element because that is how it
    // went wrong: nothing in this file ever names `dialog`, so a rule looking
    // for the element would have found nothing and passed.
    const setsDisplay = displayRules().filter(
      (r) => /(^|[\s,])\.sheet(?![-\w])/.test(r.selector) && r.value !== 'none',
    )
    if (setsDisplay.length === 0) return

    const hidden = displayRules().some(
      (r) => /\.sheet:not\(\[open\]\)/.test(r.selector) && r.value === 'none',
    )
    expect(hidden).toBe(true)
  })

  it('does not hide the sheet outright, which would be the other way to fail', () => {
    // A rule hiding `.sheet` unconditionally would pass the test above and
    // leave the panel unopenable, which is the same bug wearing the other coat.
    const always = displayRules().filter(
      (r) => /^\.sheet$/.test(r.selector) && r.value === 'none',
    )
    expect(always).toEqual([])
  })
})
