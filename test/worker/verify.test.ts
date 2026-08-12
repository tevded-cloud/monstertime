// Proving a token is real, and refusing every way of pretending one is.
//
// This is the only security-critical code in the project: get it wrong and
// anybody can be anybody, which in an app whose entire emotional payload is
// "Ana is why it has those ears" means the payload is a lie. So the positive
// case is one test and the forgeries are the rest.
//
// A keypair is generated here and the public half handed to the verifier, so
// every case below is exercised end to end against real RSA signatures with no
// network involved. A verifier that can only be tested against Google's live
// endpoint has its negative cases tested never.

import { describe, expect, it } from 'vitest'
import { verifyIdToken, type KeySource } from '../../worker/verify'

const PROJECT = 'monstertime-test'
const KID = 'test-key-1'

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encode(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)))
}

interface Signer {
  source: KeySource
  sign(header: Record<string, unknown>, claims: Record<string, unknown>): Promise<string>
}

async function makeSigner(kid = KID): Promise<Signer> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey
  return {
    source: { keys: async () => ({ [kid]: jwk }) },
    async sign(header, claims) {
      const body = `${encode(header)}.${encode(claims)}`
      const sig = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        pair.privateKey,
        new TextEncoder().encode(body),
      )
      return `${body}.${b64url(new Uint8Array(sig))}`
    },
  }
}

const NOW = 1_800_000_000_000
const seconds = Math.floor(NOW / 1000)

function goodClaims(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'firebase-uid-abc',
    email: 'someone@example.com',
    iat: seconds - 60,
    exp: seconds + 3600,
    ...over,
  }
}

describe('a real token', () => {
  it('is accepted, and says who it belongs to', async () => {
    const signer = await makeSigner()
    const token = await signer.sign({ alg: 'RS256', kid: KID }, goodClaims())
    const user = await verifyIdToken(token, PROJECT, signer.source, NOW)
    expect(user).toEqual({ uid: 'firebase-uid-abc', email: 'someone@example.com' })
  })

  it('is fine with no email on it', async () => {
    const signer = await makeSigner()
    const token = await signer.sign({ alg: 'RS256', kid: KID }, goodClaims({ email: undefined }))
    expect((await verifyIdToken(token, PROJECT, signer.source, NOW))?.email).toBeNull()
  })
})

describe('every way of faking one', () => {
  it('refuses a token signed by somebody else', async () => {
    // The one that matters most. Same claims, same shape, wrong keypair.
    const real = await makeSigner()
    const forger = await makeSigner()
    const token = await forger.sign({ alg: 'RS256', kid: KID }, goodClaims())
    expect(await verifyIdToken(token, PROJECT, real.source, NOW)).toBeNull()
  })

  it('refuses a token whose payload was edited after signing', async () => {
    const signer = await makeSigner()
    const token = await signer.sign({ alg: 'RS256', kid: KID }, goodClaims())
    const [head, , sig] = token.split('.')
    const swapped = `${head}.${encode(goodClaims({ sub: 'somebody-else' }))}.${sig}`
    expect(await verifyIdToken(swapped, PROJECT, signer.source, NOW)).toBeNull()
  })

  it('refuses alg none, however well formed the rest is', async () => {
    // The classic. A verifier that reads the token's own idea of its algorithm
    // will happily accept a token that says it needs no signature at all.
    const signer = await makeSigner()
    const body = `${encode({ alg: 'none', kid: KID })}.${encode(goodClaims())}.`
    expect(await verifyIdToken(body, PROJECT, signer.source, NOW)).toBeNull()
  })

  it('refuses a validly signed token that claims a different algorithm', async () => {
    // This one exists because the obvious alg test does not actually test the
    // alg guard. A token saying "alg: none" carries no signature, so it is
    // refused by the signature check whether or not anything looks at alg.
    //
    // Here the signature is genuine RS256 over the real body, and only the
    // header lies about which algorithm it is. Nothing but the alg check can
    // refuse it, which is what makes it the test that pins that line.
    const signer = await makeSigner()
    const token = await signer.sign({ alg: 'HS256', kid: KID }, goodClaims())
    expect(await verifyIdToken(token, PROJECT, signer.source, NOW)).toBeNull()
  })

  it('refuses a key id nobody published', async () => {
    const signer = await makeSigner()
    const token = await signer.sign({ alg: 'RS256', kid: 'not-a-real-key' }, goodClaims())
    expect(await verifyIdToken(token, PROJECT, signer.source, NOW)).toBeNull()
  })

  it('refuses a token minted for a different Firebase project', async () => {
    // Without the audience check, anybody with any Firebase app anywhere could
    // mint a valid Google-signed token and spend it here.
    const signer = await makeSigner()
    const token = await signer.sign({ alg: 'RS256', kid: KID }, goodClaims({ aud: 'someone-elses-app' }))
    expect(await verifyIdToken(token, PROJECT, signer.source, NOW)).toBeNull()
  })

  it('refuses a token from a different issuer', async () => {
    const signer = await makeSigner()
    const token = await signer.sign(
      { alg: 'RS256', kid: KID },
      goodClaims({ iss: 'https://securetoken.google.com/someone-elses-app' }),
    )
    expect(await verifyIdToken(token, PROJECT, signer.source, NOW)).toBeNull()
  })

  it('refuses an expired token', async () => {
    const signer = await makeSigner()
    const token = await signer.sign({ alg: 'RS256', kid: KID }, goodClaims({ exp: seconds - 1 }))
    expect(await verifyIdToken(token, PROJECT, signer.source, NOW)).toBeNull()
  })

  it('refuses one issued too far in the future', async () => {
    const signer = await makeSigner()
    const token = await signer.sign({ alg: 'RS256', kid: KID }, goodClaims({ iat: seconds + 600 }))
    expect(await verifyIdToken(token, PROJECT, signer.source, NOW)).toBeNull()
  })

  it('allows a little clock skew, because two machines are involved', async () => {
    const signer = await makeSigner()
    const token = await signer.sign({ alg: 'RS256', kid: KID }, goodClaims({ iat: seconds + 20 }))
    expect(await verifyIdToken(token, PROJECT, signer.source, NOW)).not.toBeNull()
  })

  it('refuses a token with nobody in it', async () => {
    const signer = await makeSigner()
    for (const sub of ['', 'x'.repeat(200)]) {
      const token = await signer.sign({ alg: 'RS256', kid: KID }, goodClaims({ sub }))
      expect(await verifyIdToken(token, PROJECT, signer.source, NOW)).toBeNull()
    }
  })

  it('refuses rubbish without throwing', async () => {
    // This is a door on the open internet, so the failure mode for nonsense has
    // to be a quiet no rather than an exception that takes the socket down.
    const signer = await makeSigner()
    for (const bad of ['', 'not.a.token', 'a.b', '....', 'x'.repeat(5000), '%%%.%%%.%%%']) {
      expect(await verifyIdToken(bad, PROJECT, signer.source, NOW)).toBeNull()
    }
  })
})
