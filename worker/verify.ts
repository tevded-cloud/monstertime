// verify.ts: proving that somebody is who the client says they are.
//
// Until now `actorId` was a string the browser invented. That was fine while
// the only shared thing was a creature, and it is not fine once a name on a
// trait is meant to be trustworthy or a wallet is meant to be yours: anybody
// with devtools could post as anybody else, and worker/README.md has said so in
// writing since the start.
//
// A Firebase ID token is a JWT signed by Google. Checking one needs no secret
// and no API key, because the signature is verified against Google's PUBLIC
// keys: nothing in here is confidential, and nothing here can be leaked. That
// is the whole reason this is forty lines in a Worker rather than a service.
//
// Everything below is written to fail closed. Every path that is not a complete
// success returns null, and the caller treats null as "not signed in" rather
// than as an error worth explaining, because a verifier that says WHY it
// refused is a verifier that helps somebody work out what to forge next.

/** Who a token says its holder is, once the signature has actually been checked. */
export interface VerifiedUser {
  /** Firebase's own id for the person. Stable for the life of the account. */
  uid: string
  email: string | null
}

/**
 * Where the public keys come from.
 *
 * An interface rather than a URL so the tests can hand over a key they made
 * themselves. A verifier that can only be tested against Google's live endpoint
 * is a verifier whose negative cases never get tested at all, and the negative
 * cases are the entire point of it.
 */
export interface KeySource {
  keys(): Promise<Record<string, JsonWebKey>>
}

/** Google's published keys for Firebase ID tokens, in JWK form so WebCrypto can
 *  import them without anybody parsing a certificate by hand. */
const GOOGLE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

/** How long a fetched key set is trusted before being fetched again. Google
 *  rotates daily and publishes a max-age; an hour is well inside it and keeps
 *  this from becoming a request per sign-in. */
const KEY_TTL_MS = 60 * 60 * 1000

export function googleKeys(): KeySource {
  let cached: Record<string, JsonWebKey> | null = null
  let until = 0
  return {
    async keys(): Promise<Record<string, JsonWebKey>> {
      const now = Date.now()
      if (cached !== null && now < until) return cached
      const response = await fetch(GOOGLE_JWKS)
      if (!response.ok) return cached ?? {}
      const body = (await response.json()) as { keys?: (JsonWebKey & { kid?: string })[] }
      const next: Record<string, JsonWebKey> = {}
      for (const key of body.keys ?? []) {
        if (typeof key.kid === 'string') next[key.kid] = key
      }
      // An empty answer is not allowed to blow the cache away: a bad deploy at
      // Google's end would otherwise lock everybody out until it was fixed.
      if (Object.keys(next).length === 0) return cached ?? {}
      cached = next
      until = now + KEY_TTL_MS
      return next
    },
  }
}

function fromBase64Url(text: string): Uint8Array | null {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function jsonFromBase64Url(text: string): Record<string, unknown> | null {
  const bytes = fromBase64Url(text)
  if (bytes === null) return null
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Check a Firebase ID token and say who it belongs to, or null.
 *
 * The order matters and is deliberate: the SIGNATURE is checked before any
 * claim inside the token is believed. Reading the issuer or the expiry off an
 * unverified token and acting on it is the standard way this goes wrong,
 * because every one of those fields is attacker-controlled until the signature
 * says otherwise.
 */
export async function verifyIdToken(
  token: string,
  projectId: string,
  source: KeySource,
  now: number = Date.now(),
): Promise<VerifiedUser | null> {
  if (typeof token !== 'string' || token.length > 4096) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const header = jsonFromBase64Url(parts[0])
  if (header === null) return null
  // RS256 and nothing else.
  //
  // The protection that actually matters is further down: the algorithm handed
  // to WebCrypto is hardcoded, never taken from the token, so the family of
  // attacks where a header says HS256 and a verifier obligingly treats the RSA
  // public key as an HMAC secret cannot be expressed here at all. This line is
  // the belt to that pair of braces, and it is the only thing that would refuse
  // a genuinely RS256-signed token whose header claims to be something else.
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null

  const keys = await source.keys()
  const jwk = keys[header.kid]
  if (jwk === undefined) return null

  const signature = fromBase64Url(parts[2])
  if (signature === null) return null

  let ok = false
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
  } catch {
    return null
  }
  if (!ok) return null

  // Only now is anything inside the token worth reading.
  const claims = jsonFromBase64Url(parts[1])
  if (claims === null) return null

  if (claims.iss !== `https://securetoken.google.com/${projectId}`) return null
  // The audience is what stops a token minted for somebody else's Firebase
  // project being spent here. Without it, anybody with any Firebase app could
  // sign in as anybody.
  if (claims.aud !== projectId) return null

  const seconds = Math.floor(now / 1000)
  if (typeof claims.exp !== 'number' || claims.exp <= seconds) return null
  // A little slack, because two clocks are involved and a token minted a
  // fraction ahead of this machine is not a forgery.
  if (typeof claims.iat !== 'number' || claims.iat > seconds + 60) return null

  const uid = claims.sub
  if (typeof uid !== 'string' || uid.length === 0 || uid.length > 128) return null

  const email = typeof claims.email === 'string' ? claims.email : null
  return { uid, email }
}
