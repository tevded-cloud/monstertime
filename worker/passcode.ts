// passcode.ts: a code that says which of you this is.
//
// `actorId` is a string the browser invents, so anybody in a group can post as
// anybody else in it, and trait credit, which is the whole emotional payload of
// the app, has never actually meant anything. This closes that without an
// account, an email, a third party or a password.
//
// Three decisions worth keeping written down, because each one is what makes
// the next one safe.
//
// THE SERVER PICKS IT, never the person. A chosen code in a friend group is a
// pet's name that half the group already knows, and the friends ARE the threat
// model here: they are the only people who know the group exists. Generated, it
// carries real entropy, which in turn means a plain SHA-256 is enough. There is
// no slow hash here and that is deliberate rather than lazy: PBKDF2 exists to
// buy time against a guessable secret, and this secret is not guessable.
//
// TWO WORDS AND THREE DIGITS is enough here and would not be everywhere. An
// attacker must already hold the group link, which is 128 bits of its own, and
// every wrong guess is counted and rate limited by the object. The size of this
// code only has to beat online guessing, and it does so by a wide margin.
//
// IT IS SHOWN EXACTLY ONCE. Only the hash is stored, so nothing here can hand a
// code back, not to the person who lost it and not to anybody who compromises
// the storage. That is the point, and it is also the whole of the recovery
// story: whoever holds the code is that person, so the app's job is to make
// saving it easy at the moment it is minted.

/**
 * The words a code is built from.
 *
 * Short, plain, and impossible to mishear as each other, because these get read
 * out loud and typed on a phone. No word here shares its first three letters
 * with another, so a half-remembered one is still findable, and nothing on the
 * list is unpleasant to be handed as your name.
 */
const WORDS = [
  'amber', 'anchor', 'apple', 'arrow', 'autumn', 'badger', 'basket', 'beacon',
  'bramble', 'bridge', 'bucket', 'candle', 'cedar', 'clover', 'copper', 'cotton',
  'crimson', 'crystal', 'dagger', 'daisy', 'dolphin', 'dragon', 'ember', 'falcon',
  'feather', 'fennel', 'ferry', 'garden', 'ginger', 'glacier', 'granite', 'harbour',
  'hazel', 'heron', 'hollow', 'ivory', 'jasmine', 'juniper', 'kestrel', 'lantern',
  'lemon', 'lichen', 'lobster', 'magpie', 'maple', 'marble', 'meadow', 'mellow',
  'mirror', 'morning', 'nettle', 'nutmeg', 'ocean', 'olive', 'orchard', 'otter',
  'parsley', 'pebble', 'pepper', 'pigeon', 'pillow', 'plover', 'pocket', 'puffin',
  'quarry', 'quiver', 'rabbit', 'raven', 'ribbon', 'river', 'rocket', 'rosemary',
  'saffron', 'sailor', 'salmon', 'sandal', 'scarlet', 'shadow', 'shovel', 'silver',
  'sorrel', 'sparrow', 'spruce', 'squirrel', 'stable', 'summer', 'sunset', 'swallow',
  'tangle', 'teapot', 'thistle', 'thunder', 'timber', 'tulip', 'turnip', 'velvet',
  'violet', 'walnut', 'willow', 'window', 'winter', 'yellow',
]

/** How the code is written: two words and three digits, joined by hyphens so it
 *  survives being read down a phone and typed back. */
export function mintPasscode(): string {
  const pick = (): string => {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    // Rejection-free and unbiased enough at this list length: the modulo skew
    // over 2^32 across 100 words is far below anything that matters here.
    return WORDS[bytes[0] % WORDS.length]
  }
  const digits = new Uint32Array(1)
  crypto.getRandomValues(digits)
  const number = String(digits[0] % 1000).padStart(3, '0')
  return `${pick()}-${pick()}-${number}`
}

/**
 * What a code may look like coming back off the open internet.
 *
 * Bounded before anything is done with it, and deliberately loose about case
 * and stray spaces, because this gets typed by somebody reading it off a
 * screenshot on another phone.
 */
const SHAPE = /^[a-z]{3,12}-[a-z]{3,12}-[0-9]{3}$/

export function cleanPasscode(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 64) return null
  const folded = raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-')
  return SHAPE.test(folded) ? folded : null
}

/**
 * The stored form. Only ever this, never the code.
 *
 * Salted with the group id so the same code minted in two groups does not hash
 * the same, which stops anybody who sees two groups' storage from noticing that
 * a person reused one.
 */
export async function hashPasscode(groupId: string, code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`monstertime:${groupId}:${code}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  let out = ''
  for (const b of new Uint8Array(digest)) out += b.toString(16).padStart(2, '0')
  return out
}
