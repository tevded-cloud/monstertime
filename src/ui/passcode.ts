// passcode.ts: keeping the code that says which of you this is.
//
// The server shows a code exactly once and keeps only its hash, so there is no
// path anywhere that can hand it back. That makes this file the entire recovery
// story: what it does at the moment the code exists decides whether somebody
// still has their place in a year.
//
// So there are three copies by design, and none of them is a server. The
// browser keeps one so nobody ever types it. A saved image is the one that
// survives clearing site data. And the nudge to send it to yourself is the one
// that survives losing the phone, which is the failure the other two share.

const CODES_KEY = 'monstertime.codes'

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CODES_KEY)
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

/** The code this browser holds for a group, or null. */
export function codeFor(groupId: string): string | null {
  const held = readAll()[groupId]
  return typeof held === 'string' && held.length > 0 ? held : null
}

export function keepCode(groupId: string, code: string): void {
  try {
    localStorage.setItem(CODES_KEY, JSON.stringify({ ...readAll(), [groupId]: code }))
  } catch {
    // Private mode. They still have the card and the email, which is exactly
    // why this is not the only copy.
  }
}

export function dropCode(groupId: string): void {
  try {
    const all = readAll()
    delete all[groupId]
    localStorage.setItem(CODES_KEY, JSON.stringify(all))
  } catch {
    // Nothing depends on this having worked.
  }
}

/**
 * Draw the card somebody saves.
 *
 * An image rather than a text file, and that is the whole reason it works: a
 * .txt lands in a Downloads folder nobody opens again, while an image goes to
 * the camera roll, where people already look for things they saved. It is also
 * the only format that can be sent to yourself in one tap from a phone.
 *
 * Hand-drawn on a canvas rather than rendered from the page, because a
 * screenshot of a dark UI is unreadable at thumbnail size and this has to be
 * findable by scrolling a photo library a year from now.
 */
export function drawCard(opts: {
  code: string
  personName: string
  groupName: string
  groupHandle: string | null
}): string | null {
  const canvas = document.createElement('canvas')
  const W = 1000
  const H = 600
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  if (g === null) return null

  g.fillStyle = '#101314'
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#262d2e'
  g.lineWidth = 2
  g.strokeRect(24, 24, W - 48, H - 48)

  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  const mono = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace'

  g.fillStyle = '#7c8481'
  g.font = `600 22px ${sans}`
  g.fillText('MONSTERTIME', 64, 96)

  g.fillStyle = '#e8ebe7'
  g.font = `34px ${sans}`
  g.fillText(`${opts.personName}, in ${opts.groupName}`, 64, 156)

  g.fillStyle = '#7c8481'
  g.font = `600 20px ${sans}`
  g.fillText('YOUR CODE', 64, 236)

  // The code itself, as big as it will go, because this gets read off a photo
  // at arm's length and typed into another phone.
  g.fillStyle = '#ff7a45'
  g.font = `72px ${mono}`
  g.fillText(opts.code, 64, 320)

  g.fillStyle = '#99a19d'
  g.font = `24px ${sans}`
  g.fillText('Type this to be yourself again on any phone.', 64, 396)
  g.fillText('It cannot be looked up or sent again. This is the only copy.', 64, 436)

  if (opts.groupHandle !== null) {
    g.fillStyle = '#7c8481'
    g.font = `22px ${mono}`
    g.fillText(`open it by typing: ${opts.groupHandle}`, 64, 512)
  }

  return canvas.toDataURL('image/png')
}

/** Offer the card as a download. On a phone this lands in the camera roll,
 *  which is where somebody will actually look for it later. */
export function saveCard(dataUrl: string, personName: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `monstertime-${personName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-code.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
}
