// materials.ts: the art direction, kept in one file on purpose.
//
// Every colour, every light and every surface decision lives here. The reason
// is that the creature is assembled from many independent pieces written at
// different times, and if each piece picked its own colour the result would
// drift into the look of a default three.js scene: grey plastic under a white
// lamp. A fixed palette and a fixed light rig mean a wildly different creature
// still reads as coming out of the same world.
//
// The look, stated plainly so it can be argued with rather than guessed at:
// a dark studio diorama. Flat-shaded facets, no textures anywhere, colour
// carried entirely by vertex colours and a two-tone rig (warm key, cool rim).
// Soft rounded volumes for the body, hard angular volumes for grown traits,
// so a creature that has grown a lot visibly gains edge.

import * as THREE from 'three'
import type { AlleleId } from '../core/types'

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

// The forge needs its own stream of randomness for jitter that must be stable
// across reloads (facet relief, colour jitter) but must never feed back into
// gameplay. It is deliberately not the dna module's generator: mixing the two
// would let a rendering tweak change which traits a group expresses.
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Stable 32 bit hash, used to pick a placeholder shape family for an allele id
// the forge has never seen. Same id always lands on the same shape.
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------

// Nine sRGB values, and nothing outside them. Named rather than numbered so a
// later change is a decision about "the warm mid tone" and not about #c2764a.
const INK = '#090c13'
const SLATE = '#161c29'
const BONE = '#ece4d2'
const CLAY = '#c2764a'
const MOSS = '#6f9a63'
const TIDE = '#4a7fa8'
const PLUM = '#8a5a86'
const EMBER = '#f0a24b'
const GLACIER = '#9fd8e6'

const HIDE_ANCHORS = [CLAY, MOSS, TIDE, PLUM]
const GLOW_ANCHORS = [EMBER, GLACIER, BONE]

export interface Palette {
  // Backdrop, bottom and top of the vertical gradient.
  background: THREE.Color
  horizon: THREE.Color
  // The plinth the creature stands on.
  ground: THREE.Color
  // The hide.
  base: THREE.Color
  belly: THREE.Color
  marking: THREE.Color
  // Horns, claws, teeth, plates.
  keratin: THREE.Color
  // Emissive accent: eyes, aura, membranes.
  glow: THREE.Color
}

// Nudges an anchor without leaving its neighbourhood. This is what keeps two
// groups that happened to draw the same anchor from looking identical while
// still keeping both of them inside the palette.
function jitter(hex: string, rand: () => number, dh: number, ds: number, dl: number): THREE.Color {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  const h = (hsl.h + (rand() * 2 - 1) * dh + 1) % 1
  const s = THREE.MathUtils.clamp(hsl.s + (rand() * 2 - 1) * ds, 0.08, 0.92)
  const l = THREE.MathUtils.clamp(hsl.l + (rand() * 2 - 1) * dl, 0.12, 0.86)
  return new THREE.Color().setHSL(h, s, l)
}

function shifted(c: THREE.Color, dh: number, ds: number, dl: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return new THREE.Color().setHSL(
    (hsl.h + dh + 1) % 1,
    THREE.MathUtils.clamp(hsl.s + ds, 0.05, 0.95),
    THREE.MathUtils.clamp(hsl.l + dl, 0.05, 0.95),
  )
}

// The group's colours come from the genome seed, so they are settled at hatch
// and never move. Colour is the one part of the creature that is pure luck: it
// is what the group is handed, before anything they do starts to matter.
export function paletteForSeed(seed: string): Palette {
  const rand = seededRandom('palette:' + seed)
  const baseAnchor = HIDE_ANCHORS[Math.floor(rand() * HIDE_ANCHORS.length) % HIDE_ANCHORS.length]
  const markAnchor =
    HIDE_ANCHORS[(HIDE_ANCHORS.indexOf(baseAnchor) + 1 + Math.floor(rand() * 3)) % HIDE_ANCHORS.length]
  const glowAnchor = GLOW_ANCHORS[Math.floor(rand() * GLOW_ANCHORS.length) % GLOW_ANCHORS.length]

  const base = jitter(baseAnchor, rand, 0.045, 0.12, 0.08)
  const belly = shifted(base, 0.02, -0.16, 0.16)
  const marking = jitter(markAnchor, rand, 0.04, 0.1, -0.14)
  const glow = jitter(glowAnchor, rand, 0.03, 0.08, 0.05)
  const keratin = shifted(new THREE.Color(BONE), 0, 0.04, -0.04)

  return {
    background: new THREE.Color(INK),
    horizon: shifted(new THREE.Color(SLATE), 0, 0.03, 0.05),
    // Lighter than the backdrop it sits against, so the plinth reads as a solid
    // object with an edge rather than as a hole in the floor.
    ground: shifted(new THREE.Color(SLATE), 0, -0.04, 0.06),
    base,
    belly,
    marking,
    keratin,
    glow,
  }
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export const PATTERNS = ['plain', 'banded', 'spotted', 'plated', 'fuzzed', 'crystal', 'veined'] as const
export type Pattern = (typeof PATTERNS)[number]

export interface Surface {
  pattern: Pattern
  roughness: number
  metalness: number
  // Per facet outward push, as a fraction of local radius. This is what makes
  // scales look like scales without a texture.
  relief: number
  // How much the hide glows on its own. Small: the hide is not a light source.
  sheen: number
  // Pulls the hide toward a dulled version of itself. Dust and wear are a loss
  // of saturation before they are anything else.
  wash: number
}

const PLAIN: Surface = { pattern: 'plain', roughness: 0.78, metalness: 0.02, relief: 0, sheen: 0, wash: 0 }

// One considered surface per hide allele, written against the allele's own
// label rather than against a generic idea of "scaly". Eight hides is a small
// enough number to do by hand, and doing it by hand is the difference between
// eight looks and one look with eight roughness values.
const HIDE_SURFACES: Record<AlleleId, Surface> = {
  // A tallow gloss: waxy, poured, catches the key light in one long streak.
  'hide.tallowGloss': { pattern: 'plain', roughness: 0.2, metalness: 0.04, relief: 0, sheen: 0.03, wash: 0 },
  // Road dust: chalky and desaturated, the colour of somewhere else.
  'hide.roadDust': { pattern: 'spotted', roughness: 0.96, metalness: 0, relief: 0.012, sheen: 0, wash: 0.34 },
  // Thumb-worn velvet: soft nap, rubbed pale where hands go.
  'hide.thumbworn': { pattern: 'fuzzed', roughness: 0.98, metalness: 0, relief: 0.038, sheen: 0, wash: 0.18 },
  // Brine armour: crusted plates with salt caught in the seams.
  'hide.brineArmour': { pattern: 'plated', roughness: 0.42, metalness: 0.12, relief: 0.082, sheen: 0.02, wash: 0.12 },
  // Kiln scale: fired plates with heat still showing between them.
  'hide.kilnScale': { pattern: 'plated', roughness: 0.34, metalness: 0.16, relief: 0.07, sheen: 0.14, wash: 0 },
  // A storm pelt: deep coat, no shine at all, moves as one mass.
  'hide.stormPelt': { pattern: 'fuzzed', roughness: 0.94, metalness: 0, relief: 0.062, sheen: 0, wash: 0.08 },
  // A lacquer case: hard, poured, almost mirror smooth over big flat panels.
  'hide.lacquerCase': { pattern: 'plated', roughness: 0.09, metalness: 0.2, relief: 0.045, sheen: 0.04, wash: 0 },
  // A scar lattice: worked skin, a net of raised lines over a matte ground.
  'hide.scarLattice': { pattern: 'veined', roughness: 0.68, metalness: 0.02, relief: 0.022, sheen: 0.06, wash: 0.06 },
  // A travel coat: layered and lying flat, dust worked into every seam. Fed
  // well and walked a long way, which is a different animal from a storm pelt.
  'hide.travelCoat': { pattern: 'banded', roughness: 0.88, metalness: 0, relief: 0.05, sheen: 0, wash: 0.22 },
}

// Keyword fallback, for hide alleles added to the dna module after this file
// was written. It is deliberately here rather than an exception: an unfamiliar
// hide should still land on a considered surface.
const PATTERN_WORDS: Array<[string, Pattern]> = [
  ['gloss', 'plain'],
  ['smooth', 'plain'],
  ['slick', 'plain'],
  ['worn', 'fuzzed'],
  ['velvet', 'fuzzed'],
  ['pelt', 'fuzzed'],
  ['fur', 'fuzzed'],
  ['fuzz', 'fuzzed'],
  ['moss', 'fuzzed'],
  ['wool', 'fuzzed'],
  ['feather', 'fuzzed'],
  ['dust', 'spotted'],
  ['dapple', 'spotted'],
  ['spot', 'spotted'],
  ['mottle', 'spotted'],
  ['speck', 'spotted'],
  ['band', 'banded'],
  ['stripe', 'banded'],
  ['ring', 'banded'],
  ['scale', 'plated'],
  ['plate', 'plated'],
  ['armour', 'plated'],
  ['armor', 'plated'],
  ['shell', 'plated'],
  ['chitin', 'plated'],
  ['lacquer', 'plated'],
  ['bark', 'plated'],
  ['crystal', 'crystal'],
  ['glass', 'crystal'],
  ['glaze', 'crystal'],
  ['gem', 'crystal'],
  ['ice', 'crystal'],
  ['scar', 'veined'],
  ['vein', 'veined'],
  ['lattice', 'veined'],
  ['ember', 'veined'],
  ['lume', 'veined'],
]

const BY_PATTERN: Record<Pattern, Surface> = {
  plain: PLAIN,
  banded: { pattern: 'banded', roughness: 0.7, metalness: 0.03, relief: 0.02, sheen: 0, wash: 0 },
  spotted: { pattern: 'spotted', roughness: 0.74, metalness: 0.02, relief: 0.015, sheen: 0, wash: 0.1 },
  plated: { pattern: 'plated', roughness: 0.38, metalness: 0.14, relief: 0.075, sheen: 0.02, wash: 0 },
  fuzzed: { pattern: 'fuzzed', roughness: 0.96, metalness: 0, relief: 0.055, sheen: 0, wash: 0.12 },
  crystal: { pattern: 'crystal', roughness: 0.14, metalness: 0.1, relief: 0.09, sheen: 0.09, wash: 0 },
  veined: { pattern: 'veined', roughness: 0.62, metalness: 0.02, relief: 0.012, sheen: 0.05, wash: 0 },
}

export function surfaceFor(hideAllele: AlleleId | null): Surface {
  if (!hideAllele) return PLAIN
  const exact = HIDE_SURFACES[hideAllele]
  if (exact) return exact
  const tail = hideAllele.slice(hideAllele.indexOf('.') + 1).toLowerCase()
  for (const [word, pattern] of PATTERN_WORDS) {
    if (tail.includes(word)) return BY_PATTERN[pattern]
  }
  return BY_PATTERN[PATTERNS[hashString(hideAllele) % PATTERNS.length]]
}

// The hide before anything has expressed. Bare skin on a hatchling, so the
// first hide allele to land is a visible change rather than a subtle one.
export function bareSurface(): Surface {
  return PLAIN
}

// Colour of one facet of the hide. Takes the facet centroid in body space, so
// "belly" means the underside of the animal and not the underside of whichever
// segment the facet happens to belong to.
const scratch = new THREE.Color()
const dull = new THREE.Color()

export function hideColorAt(
  palette: Palette,
  surface: Surface,
  x: number,
  y: number,
  z: number,
  faceIndex: number,
  jitterAmount: number,
): THREE.Color {
  // Belly gradient runs the whole height of the animal and is present under
  // every pattern. It is what stops a flat-shaded creature reading as a toy.
  const under = THREE.MathUtils.smoothstep(y, -0.55, 0.35)
  scratch.copy(palette.belly).lerp(palette.base, under)

  let mark = 0
  switch (surface.pattern) {
    case 'plain':
      break
    case 'banded':
      mark = Math.sin(z * 7.5 + y * 1.2) > 0.35 ? 1 : 0
      break
    case 'spotted': {
      const n = Math.sin(x * 13.1 + 1.7) * Math.sin(y * 11.3 + 4.1) * Math.sin(z * 9.7 + 2.3)
      mark = n > 0.28 ? 1 : 0
      break
    }
    case 'plated':
      mark = (faceIndex >> 1) % 5 === 0 ? 0.75 : 0
      break
    case 'fuzzed':
      mark = ((faceIndex * 2654435761) >>> 24) / 255 > 0.72 ? 0.35 : 0
      break
    case 'crystal':
      mark = ((faceIndex >> 1) % 3 === 0 ? 0.9 : 0) * THREE.MathUtils.smoothstep(y, -0.3, 0.6)
      break
    case 'veined':
      mark = Math.abs(Math.sin(z * 16.0 + x * 5.0)) > 0.93 ? 1 : 0
      break
  }
  if (mark > 0) scratch.lerp(palette.marking, mark)

  // Wear and dust take the colour out before they take the shape out.
  if (surface.wash > 0) {
    const grey = (scratch.r + scratch.g + scratch.b) / 3
    scratch.lerp(dull.setRGB(grey, grey, grey), surface.wash * 0.7)
  }

  // A little per facet noise so large flat runs of colour still have life in
  // them under the flat shading.
  if (jitterAmount > 0) {
    const n = (((faceIndex * 2246822519) >>> 20) / 4095 - 0.5) * jitterAmount
    scratch.offsetHSL(0, 0, n)
  }
  return scratch
}

// How far one facet pushes out from the surface. Same input, same answer, so
// the relief does not crawl while the creature breathes.
export function hideReliefAt(surface: Surface, along: number, faceIndex: number): number {
  if (surface.relief === 0) return 0
  const n = ((faceIndex * 1597334677) >>> 16) / 65535
  switch (surface.pattern) {
    case 'plated':
      // Big slabs: relief is constant within a band and steps between bands.
      return surface.relief * (0.5 + 0.5 * (((faceIndex >> 3) % 4) / 3))
    case 'fuzzed':
      return surface.relief * n
    case 'crystal':
      return surface.relief * (n > 0.5 ? 1 : 0.15)
    default:
      return surface.relief * (0.35 + 0.65 * n) * (0.6 + 0.4 * along)
  }
}

// ---------------------------------------------------------------------------
// Auras
// ---------------------------------------------------------------------------

// Eight aura alleles, eight distinct effects, no sharing. The aura is the layer
// somebody screenshots, so two groups whose auras are described differently
// must not be looking at the same particles in a different colour.
export const AURAS = [
  'none',
  'motes',
  'emberfall',
  'stormflick',
  'hush',
  'hum',
  'ironring',
  'tide',
  'held',
  'echo',
] as const
export type Aura = (typeof AURAS)[number]

const AURA_BY_ID: Record<AlleleId, Aura> = {
  'aura.hearthWarm': 'emberfall',
  'aura.stormSmell': 'stormflick',
  'aura.workshopDust': 'motes',
  'aura.quietRoom': 'hush',
  'aura.lowHum': 'hum',
  'aura.ironOnTheAir': 'ironring',
  'aura.tideChange': 'tide',
  'aura.heldBreath': 'held',
  // An answered quiet: rings arriving from outside and closing on the animal,
  // the exact reverse of a tide change, which leaves.
  'aura.answeredQuiet': 'echo',
}

const AURA_WORDS: Array<[string, Aura]> = [
  ['dust', 'motes'],
  ['mote', 'motes'],
  ['hearth', 'emberfall'],
  ['ember', 'emberfall'],
  ['fire', 'emberfall'],
  ['ash', 'emberfall'],
  ['storm', 'stormflick'],
  ['spark', 'stormflick'],
  ['quiet', 'hush'],
  ['hush', 'hush'],
  ['veil', 'hush'],
  ['shadow', 'hush'],
  ['hum', 'hum'],
  ['song', 'hum'],
  ['pulse', 'hum'],
  ['iron', 'ironring'],
  ['ring', 'ironring'],
  ['halo', 'ironring'],
  ['tide', 'tide'],
  ['wave', 'tide'],
  ['answer', 'echo'],
  ['echo', 'echo'],
  ['reply', 'echo'],
  ['breath', 'held'],
  ['held', 'held'],
]

export function auraFor(alleleId: AlleleId | null): Aura {
  if (!alleleId) return 'none'
  const exact = AURA_BY_ID[alleleId]
  if (exact) return exact
  const tail = alleleId.slice(alleleId.indexOf('.') + 1).toLowerCase()
  for (const [word, aura] of AURA_WORDS) {
    if (tail.includes(word)) return aura
  }
  // Never 'none' for a carried aura allele: the group grew something and it
  // has to be visible, even if the forge does not recognise the name.
  return AURAS[1 + (hashString(alleleId) % (AURAS.length - 1))]
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

// One shared set for the whole creature. Parts never make their own materials,
// which is what keeps the palette limited when a dozen parts are on screen.
export interface MaterialKit {
  // The hide, painted per facet. Only geometry that carries a colour attribute
  // may use this one: three defaults a missing colour attribute to black, so a
  // part built with it and no colours renders as a hole in the animal.
  body: THREE.MeshStandardMaterial
  // Flesh coloured but flat. This is what parts use when they want to look like
  // they grew out of the animal rather than being bolted onto it.
  flesh: THREE.MeshStandardMaterial
  keratin: THREE.MeshStandardMaterial
  membrane: THREE.MeshStandardMaterial
  chitin: THREE.MeshStandardMaterial
  glow: THREE.MeshStandardMaterial
  eye: THREE.MeshStandardMaterial
  pupil: THREE.MeshStandardMaterial
  ground: THREE.MeshStandardMaterial
  shell: THREE.MeshStandardMaterial
  dispose(): void
}

export function makeMaterials(palette: Palette, surface: Surface): MaterialKit {
  const body = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: surface.roughness,
    metalness: surface.metalness,
    emissive: palette.glow.clone(),
    emissiveIntensity: surface.sheen,
  })
  const flesh = new THREE.MeshStandardMaterial({
    color: palette.base.clone(),
    flatShading: true,
    roughness: surface.roughness,
    metalness: surface.metalness,
  })
  const keratin = new THREE.MeshStandardMaterial({
    color: palette.keratin.clone(),
    flatShading: true,
    roughness: 0.44,
    metalness: 0.05,
  })
  const membrane = new THREE.MeshStandardMaterial({
    color: palette.belly.clone(),
    flatShading: true,
    roughness: 0.55,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.82,
  })
  const chitin = new THREE.MeshStandardMaterial({
    color: shifted(palette.base, 0, 0.05, -0.2),
    flatShading: true,
    roughness: 0.32,
    metalness: 0.16,
  })
  const glow = new THREE.MeshStandardMaterial({
    color: palette.glow.clone(),
    emissive: palette.glow.clone(),
    emissiveIntensity: 1.35,
    flatShading: true,
    roughness: 0.3,
    metalness: 0.0,
  })
  const eye = new THREE.MeshStandardMaterial({
    color: palette.glow.clone(),
    emissive: palette.glow.clone(),
    emissiveIntensity: 0.85,
    flatShading: false,
    roughness: 0.18,
    metalness: 0.0,
  })
  const pupil = new THREE.MeshStandardMaterial({
    color: new THREE.Color(INK),
    roughness: 0.9,
    metalness: 0.0,
  })
  const ground = new THREE.MeshStandardMaterial({
    color: palette.ground.clone(),
    flatShading: true,
    roughness: 0.95,
    metalness: 0.0,
  })
  const shell = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.52,
    metalness: 0.03,
    emissive: palette.glow.clone(),
    emissiveIntensity: 0.0,
  })

  const all = [body, flesh, keratin, membrane, chitin, glow, eye, pupil, ground, shell]
  return {
    body,
    flesh,
    keratin,
    membrane,
    chitin,
    glow,
    eye,
    pupil,
    ground,
    shell,
    dispose() {
      for (const m of all) m.dispose()
    },
  }
}

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

export interface LightRig {
  group: THREE.Group
  key: THREE.DirectionalLight
  rim: THREE.DirectionalLight
  sky: THREE.HemisphereLight
  // Sits just above the creature and is normally almost off. Auras drive it.
  accent: THREE.PointLight
  dispose(): void
}

// Three lights, always the same three, always in the same places. A creature
// that changes shape under a rig that never moves is legible; a rig that moves
// with the creature is not.
export function createLightRig(palette: Palette): LightRig {
  const group = new THREE.Group()

  // Kept low. A bright hemisphere is the fastest way to make a scene read as
  // uniformly blue, which is what happens when ambient fill beats the key.
  const sky = new THREE.HemisphereLight(0x8ba1c8, 0x3d2b1e, 0.5)
  group.add(sky)

  const key = new THREE.DirectionalLight(0xffe3ba, 3.2)
  key.position.set(3.4, 5.2, 3.0)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0012
  key.shadow.normalBias = 0.02
  const cam = key.shadow.camera
  cam.near = 1
  cam.far = 18
  cam.left = -4
  cam.right = 4
  cam.top = 4
  cam.bottom = -4
  cam.updateProjectionMatrix()
  group.add(key)
  group.add(key.target)

  const rim = new THREE.DirectionalLight(0x8fd6ff, 1.7)
  rim.position.set(-3.6, 2.2, -3.4)
  group.add(rim)
  group.add(rim.target)

  const accent = new THREE.PointLight(palette.glow.clone(), 0, 6, 2)
  accent.position.set(0, 1.6, 0)
  group.add(accent)

  return {
    group,
    key,
    rim,
    sky,
    accent,
    dispose() {
      key.shadow.dispose()
      sky.dispose()
      key.dispose()
      rim.dispose()
      accent.dispose()
    },
  }
}

// ---------------------------------------------------------------------------
// The diorama
// ---------------------------------------------------------------------------

// A backdrop sphere rather than a flat clear colour, because the vertical
// gradient is what separates the creature's silhouette from the void behind it
// at the top of the frame while still going dark at the bottom.
export function createBackdrop(palette: Palette): THREE.Mesh {
  const geo = new THREE.SphereGeometry(22, 24, 16)
  const count = geo.attributes.position.count
  const colors = new Float32Array(count * 3)
  const pos = geo.attributes.position
  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const t = THREE.MathUtils.smoothstep(pos.getY(i) / 22, -0.45, 0.75)
    c.copy(palette.background).lerp(palette.horizon, t)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // Unfogged: the gradient is the whole point of the backdrop, and fog at that
  // distance would flatten it back into a single colour.
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'backdrop'
  return mesh
}

// A nine sided plinth, not a circle and not a plane. It gives the creature a
// scale reference and somewhere for the key light's shadow to land, which is
// most of what makes an object look like it has weight.
export function createGround(materials: MaterialKit): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(2.5, 2.15, 0.34, 9, 1)
  const mesh = new THREE.Mesh(geo, materials.ground)
  mesh.position.y = -0.17
  mesh.receiveShadow = true
  mesh.name = 'plinth'
  return mesh
}
