// rng.ts: the only randomness in MonsterTime, and it is not random.
//
// Every draw that decides what a group's creature could become runs through
// here, seeded by that group's hex seed and nothing else. Math.random is never
// called anywhere in this module, because the client and the Durable Object
// both rebuild the same creature from the same two inputs and a single
// divergent bit would mean two people looking at different animals with no way
// to tell which one is real.
//
// cyrb128 spreads a hex string into four well mixed 32 bit words, then
// xoshiro128** turns those into a sequence. Both are integer only and use
// Math.imul, so they behave identically on every JS engine: no doubles, no
// float rounding, no platform drift.

export interface Rng {
  // Uniform in [0, 1).
  next(): number
  // Uniform integer in [0, maxExclusive).
  int(maxExclusive: number): number
  // Index into a weight array, proportional to the weights.
  weighted(weights: number[]): number
}

// Four 32 bit words from an arbitrary string. Avalanches well enough that two
// group seeds differing in one hex digit produce unrelated sequences.
export function hashSeed(text: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ]
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}

export function makeRng(seed: string): Rng {
  const words = hashSeed(seed)
  let s0 = words[0]
  let s1 = words[1]
  let s2 = words[2]
  let s3 = words[3]
  // xoshiro is stuck forever on an all zero state, which a pathological seed
  // could produce, so nudge it off the fixed point rather than pretend it
  // cannot happen.
  if ((s0 | s1 | s2 | s3) === 0) {
    s0 = 0x9e3779b9
    s1 = 0x243f6a88
    s2 = 0xb7e15162
    s3 = 0x85ebca6b
  }

  function next32(): number {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0
    const t = (s1 << 9) >>> 0
    s2 = (s2 ^ s0) >>> 0
    s3 = (s3 ^ s1) >>> 0
    s1 = (s1 ^ s2) >>> 0
    s0 = (s0 ^ s3) >>> 0
    s2 = (s2 ^ t) >>> 0
    s3 = rotl(s3, 11)
    return result
  }

  // Burn the first few outputs. Seeded straight from a hash the low bits of
  // the opening words are still correlated with the seed text.
  for (let i = 0; i < 8; i++) next32()

  const next = (): number => next32() / 4294967296

  return {
    next,
    int(maxExclusive: number): number {
      if (maxExclusive <= 1) return 0
      return Math.floor(next() * maxExclusive)
    },
    weighted(weights: number[]): number {
      let total = 0
      for (let i = 0; i < weights.length; i++) total += weights[i]
      if (total <= 0) return 0
      let roll = next() * total
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i]
        if (roll < 0) return i
      }
      // Only reachable through float slop on the last bucket.
      return weights.length - 1
    },
  }
}
