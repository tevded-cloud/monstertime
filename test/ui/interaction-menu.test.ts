import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const actionBar = readFileSync(new URL('../../src/ui/ActionBar.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')

describe('the interaction chooser', () => {
  it('does not reveal the catalogue outcome before the action', () => {
    expect(actionBar).not.toContain('{variant.blurb}')
  })

  it('keeps each label on a full touch target after removing the outcome copy', () => {
    expect(css).toMatch(/\.variant\s*\{[^}]*min-height:\s*var\(--tap\)/s)
  })
})

describe('the compact stage header', () => {
  it('puts the tools on their own row before the phone layout can overlap', () => {
    expect(css).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.topbar\s*\{[^}]*flex-direction:\s*column/s)
    expect(css).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.creature-name\s*\{[^}]*max-width:\s*100%/s)
  })
})
