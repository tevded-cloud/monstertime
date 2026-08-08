// parts.ts: PLACEHOLDER GEOMETRY FOR EVERY ALLELE. NONE OF THIS SHIPS.
//
// Read the header of registry.ts before touching anything here. Every builder
// below assembles primitives, which is the technique the creator tested and
// rejected as a final answer. It exists so that the game is playable and
// judgeable now, and so that the shape of each allele is pinned down (how long
// a salt spiral is, which way gift spurs point) before anyone spends a day
// modelling one. Each builder is a brief for the artist as much as it is code.
//
// The ids below are the exact ids in src/dna/alleles.ts. If that file gains an
// allele and this one does not, the creature does not go bald: registry.ts
// hands out a marked stub and logs the id once. Fix it by adding a builder.

import * as THREE from 'three'
import type { AlleleId, Locus } from '../core/types'
import { auraFor, type Aura } from './materials'
import { PART, type PartBuilder, type PartOpts } from './registry'

const lerp = THREE.MathUtils.lerp

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function put(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  return m
}

// A non indexed parametric patch. Wings, sails, fans, cups and combs are all
// the same surface with a different function in them, which is why there is one
// of these instead of six geometry classes.
function patch(
  cols: number,
  rows: number,
  fn: (u: number, v: number, out: THREE.Vector3) => void,
): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const p = new THREE.Vector3()
      fn(i / cols, j / rows, p)
      pts.push(p)
    }
  }
  const at = (i: number, j: number) => pts[i * (rows + 1) + j]
  const arr = new Float32Array(cols * rows * 18)
  let k = 0
  const push = (p: THREE.Vector3) => {
    arr[k++] = p.x
    arr[k++] = p.y
    arr[k++] = p.z
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      push(at(i, j))
      push(at(i + 1, j))
      push(at(i + 1, j + 1))
      push(at(i, j))
      push(at(i + 1, j + 1))
      push(at(i, j + 1))
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  geo.computeVertexNormals()
  return geo
}

interface HornOpts {
  segments: number
  len: number
  baseR: number
  tipR: number
  // Total bend over the whole horn, radians. Positive bends forward.
  curve: number
  // Total twist over the whole horn, radians.
  twist: number
  radial: number
}

interface Horn {
  root: THREE.Group
  // The joint at the start of each segment, plus one at the tip. Branches and
  // lanterns hang off these.
  joints: THREE.Object3D[]
}

// A horn is a chain of frustums, each one leaning a little further than the
// last. Everything with a taper and a curve is built from this: horns, spurs,
// fingers, tail cords, antler branches.
function chain(mat: THREE.Material, o: HornOpts): Horn {
  const root = new THREE.Group()
  const joints: THREE.Object3D[] = []
  const segLen = o.len / o.segments
  let cursor: THREE.Object3D = root
  for (let i = 0; i < o.segments; i++) {
    const node = new THREE.Group()
    node.position.y = i === 0 ? 0 : segLen
    node.rotation.x = o.curve / o.segments
    node.rotation.y = o.twist / o.segments
    cursor.add(node)
    joints.push(node)
    const r0 = lerp(o.baseR, o.tipR, i / o.segments)
    const r1 = lerp(o.baseR, o.tipR, (i + 1) / o.segments)
    const m = put(new THREE.CylinderGeometry(r1, r0, segLen, o.radial, 1), mat)
    m.position.y = segLen / 2
    node.add(m)
    cursor = node
  }
  const tip = new THREE.Group()
  tip.position.y = segLen
  cursor.add(tip)
  joints.push(tip)
  return { root, joints }
}

// A flat tapered blade, standing on the XY plane and thin in Z. The building
// block of every plate, fin, comb tooth and ear.
function blade(mat: THREE.Material, w: number, h: number, thick: number, taper: number, lean: number): THREE.Mesh {
  const m = put(
    patch(1, 3, (u, v, out) => {
      const width = w * lerp(1, taper, v)
      out.set((u - 0.5) * 2 * width * 0.5, v * h, Math.sin(u * Math.PI) * thick * lerp(1, 0.2, v))
    }),
    mat,
  )
  const back = put(
    patch(1, 3, (u, v, out) => {
      const width = w * lerp(1, taper, v)
      out.set((0.5 - u) * 2 * width * 0.5, v * h, -Math.sin(u * Math.PI) * thick * lerp(1, 0.2, v))
    }),
    mat,
  )
  m.add(back)
  m.rotation.z = lean
  return m
}

function orb(mat: THREE.Material, r: number, detail = 0): THREE.Mesh {
  return put(new THREE.IcosahedronGeometry(r, detail), mat)
}

// ---------------------------------------------------------------------------
// Horn builders
// ---------------------------------------------------------------------------

const horns: Record<string, PartBuilder> = {
  // hush-buds: barely there. Two soft swellings that read as restraint.
  'horn.hushBuds': ({ materials, rand }) => {
    const g = new THREE.Group()
    const a = orb(materials.keratin, 0.16, 1)
    a.scale.set(1, 0.8, 1)
    a.position.y = 0.1
    const b = orb(materials.keratin, 0.1, 1)
    b.position.set(0.02, 0.24, -0.08 - rand() * 0.04)
    g.add(a, b)
    return g
  },

  // ember-crest: a short row of spikes with heat still in the tips.
  'horn.emberCrest': ({ materials, side, rand }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 4; i++) {
      const t = i / 3
      const c = chain(materials.chitin, {
        segments: 2,
        len: lerp(0.5, 0.22, t) * (0.9 + rand() * 0.2),
        baseR: 0.075,
        tipR: 0.012,
        curve: -0.35,
        twist: 0,
        radial: 5,
      })
      c.root.position.set(side * 0.06 * t, 0, -t * 0.34)
      c.root.rotation.z = side * 0.16 * t
      const tip = orb(materials.glow, 0.045)
      c.joints[c.joints.length - 1].add(tip)
      g.add(c.root)
    }
    return g
  },

  // lift-knobs: blunt, mushroom headed, undercut so a hand locks on instead of
  // sliding off. This is a handle that happened to grow on a head.
  'horn.liftKnobs': ({ materials, side, rand }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const stalk = put(new THREE.CylinderGeometry(0.07, 0.105, 0.19, 6), materials.keratin)
      stalk.position.set(side * 0.03 * i, 0.095, -i * 0.23)
      const head = orb(materials.keratin, 0.145 - i * 0.025, 1)
      head.scale.set(1.3, 0.66, 1.3)
      head.position.set(side * 0.03 * i, 0.2 + rand() * 0.02, -i * 0.23)
      g.add(stalk, head)
    }
    return g
  },

  // lantern horn: one forward horn carrying a light at the end of it.
  'horn.lanternHorn': ({ materials, side }) => {
    const g = new THREE.Group()
    const c = chain(materials.keratin, {
      segments: 5,
      len: 0.95,
      baseR: 0.09,
      tipR: 0.024,
      curve: 0.85,
      twist: side * 0.2,
      radial: 6,
    })
    const hook = c.joints[c.joints.length - 1]
    const cage = put(new THREE.TorusGeometry(0.085, 0.016, 4, 7), materials.keratin)
    cage.rotation.x = Math.PI / 2
    cage.position.y = -0.09
    const lamp = orb(materials.glow, 0.075, 1)
    lamp.position.y = -0.09
    hook.add(cage, lamp)
    g.add(c.root)
    return g
  },

  // tally horns: a plain pair, cut across at intervals. Somebody in the group
  // is keeping score of something, and the horn is where they keep it.
  'horn.tallyHorns': ({ materials, side, rand }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const baseR = 0.085 - i * 0.02
      const c = chain(materials.keratin, {
        segments: 4,
        len: 0.72 - i * 0.24,
        baseR,
        tipR: 0.03,
        curve: 0.3,
        twist: 0,
        radial: 6,
      })
      c.root.position.set(side * i * 0.05, 0, -i * 0.19)
      c.root.rotation.z = side * (0.1 + i * 0.18)
      // The marks sit on their own joint rather than all on the root, so they
      // follow the horn round its bend instead of walking off the side of it.
      for (let j = 0; j < 5 - i * 2; j++) {
        const w = lerp(baseR, 0.03, j / 4) * 2.4
        const mark = put(new THREE.BoxGeometry(w, 0.016, w), materials.keratin)
        mark.position.y = 0.09
        mark.rotation.y = j * 0.6 + rand() * 0.15
        c.joints[j].add(mark)
      }
      g.add(c.root)
    }
    return g
  },

  // thorn crown: a ring of small thorns, outward, all round the socket.
  'horn.thornCrown': ({ materials, rand }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      const c = chain(materials.keratin, {
        segments: 2,
        len: 0.3 + rand() * 0.14,
        baseR: 0.05,
        tipR: 0.006,
        curve: 0.3,
        twist: 0,
        radial: 4,
      })
      c.root.rotation.set(Math.cos(a) * 0.7, a, Math.sin(a) * 0.7)
      c.root.position.set(Math.cos(a) * 0.09, 0.04, Math.sin(a) * 0.09)
      g.add(c.root)
    }
    const boss = orb(materials.keratin, 0.11, 0)
    boss.scale.y = 0.6
    g.add(boss)
    return g
  },

  // salt spiral: long, ridged, wound tight. The one that fills a silhouette.
  'horn.saltSpiral': ({ materials, side }) => {
    const g = new THREE.Group()
    const c = chain(materials.keratin, {
      segments: 8,
      len: 1.35,
      baseR: 0.105,
      tipR: 0.014,
      curve: 0.72,
      twist: side * 2.6,
      radial: 5,
    })
    // Ridges, so the twist reads at a distance instead of vanishing.
    for (let i = 1; i < 7; i++) {
      const r = lerp(0.105, 0.014, i / 8) * 1.5
      const ring = put(new THREE.TorusGeometry(r, r * 0.28, 3, 6), materials.keratin)
      ring.rotation.x = Math.PI / 2
      c.joints[i].add(ring)
    }
    c.root.rotation.z = side * -0.18
    g.add(c.root)
    return g
  },

  // river-polished nubs: worn smooth, nothing sharp left anywhere on them.
  'horn.riverPolished': ({ materials, rand }) => {
    const g = new THREE.Group()
    const a = orb(materials.keratin, 0.19, 1)
    a.scale.set(0.9, 1.25, 0.9)
    a.position.y = 0.18
    const b = orb(materials.keratin, 0.12, 1)
    b.scale.set(0.9, 1.15, 0.9)
    b.position.set(0, 0.34, -0.02 - rand() * 0.03)
    g.add(a, b)
    return g
  },

  // glass antlers: thin, branching, translucent. Fragile on purpose.
  'horn.glassAntlers': ({ materials, side }) => {
    const g = new THREE.Group()
    const main = chain(materials.membrane, {
      segments: 5,
      len: 1.05,
      baseR: 0.055,
      tipR: 0.012,
      curve: 0.5,
      twist: side * 0.3,
      radial: 4,
    })
    for (const [at, len, out] of [
      [1, 0.44, 0.9],
      [2, 0.5, -0.75],
      [3, 0.34, 0.6],
    ] as const) {
      const br = chain(materials.membrane, {
        segments: 3,
        len,
        baseR: 0.032,
        tipR: 0.008,
        curve: 0.45,
        twist: 0,
        radial: 4,
      })
      br.root.rotation.set(0.2, side * out, side * out)
      main.joints[at].add(br.root)
    }
    const tip = orb(materials.glow, 0.032)
    main.joints[main.joints.length - 1].add(tip)
    g.add(main.root)
    return g
  },

  // a duelling rack: heavy, forward, made for hitting another one of these.
  'horn.duelRack': ({ materials, side }) => {
    const g = new THREE.Group()
    const main = chain(materials.chitin, {
      segments: 5,
      len: 0.92,
      baseR: 0.155,
      tipR: 0.05,
      curve: 1.15,
      twist: side * 0.25,
      radial: 6,
    })
    for (const [at, len, out] of [
      [2, 0.42, 0.85],
      [3, 0.36, -0.7],
    ] as const) {
      const br = chain(materials.chitin, {
        segments: 2,
        len,
        baseR: 0.075,
        tipR: 0.02,
        curve: 0.5,
        twist: 0,
        radial: 5,
      })
      br.root.rotation.set(0.1, side * out, side * out * 0.9)
      main.joints[at].add(br.root)
    }
    const cap = orb(materials.keratin, 0.06, 0)
    main.joints[main.joints.length - 1].add(cap)
    g.add(main.root)
    return g
  },

  // a wind-cut pair: swept back hard, thin edge on, shaped by going places.
  'horn.windCut': ({ materials, side }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const b = blade(materials.keratin, 0.17 - i * 0.05, 0.82 - i * 0.26, 0.026, 0.1, side * (0.35 + i * 0.3))
      b.rotation.x = -0.85 - i * 0.2
      b.position.set(side * i * 0.06, 0.02, -i * 0.1)
      g.add(b)
    }
    const root = orb(materials.keratin, 0.09, 0)
    root.scale.set(1.2, 0.55, 0.8)
    g.add(root)
    return g
  },
}

// ---------------------------------------------------------------------------
// Ear builders
// ---------------------------------------------------------------------------

const ears: Record<string, PartBuilder> = {
  // velvet drops: heavy lobes that hang rather than point.
  'ear.velvetDrops': ({ materials, side }) => {
    const g = new THREE.Group()
    const lobe = put(new THREE.CapsuleGeometry(0.13, 0.3, 3, 7), materials.flesh)
    lobe.position.set(side * 0.08, -0.06, 0)
    lobe.rotation.z = side * 0.45
    const tip = orb(materials.flesh, 0.1, 1)
    tip.position.set(side * 0.22, -0.28, 0)
    g.add(lobe, tip)
    return g
  },

  // butter lobes: too thick to hold themselves up, so the top of each one lies
  // over on itself. The ear of an animal that has never once gone hungry.
  'ear.butterLobes': ({ materials, side }) => {
    const g = new THREE.Group()
    const lobe = orb(materials.flesh, 0.24, 1)
    lobe.scale.set(0.62, 1.05, 0.5)
    lobe.position.y = 0.04
    const fold = put(
      patch(5, 2, (u, v, out) => {
        const a = u * Math.PI
        out.set(Math.cos(a) * 0.155, 0.24 - v * 0.17, Math.sin(a) * 0.1 + v * 0.11)
      }),
      materials.flesh,
    )
    g.add(lobe, fold)
    g.rotation.z = side * 0.32
    return g
  },

  // a notched pair: a plain triangular ear with a bite out of the back edge.
  'ear.notchedPair': ({ materials, side }) => {
    const g = new THREE.Group()
    const e = put(
      patch(3, 3, (u, v, out) => {
        const notch = v > 0.55 && u > 0.72 ? 0.55 : 1
        out.set((u - 0.5) * 0.34 * lerp(1, 0.25, v) * notch, v * 0.52, Math.sin(u * Math.PI) * 0.05 * (1 - v))
      }),
      materials.flesh,
    )
    e.rotation.z = side * -0.16
    const rib = put(new THREE.CylinderGeometry(0.012, 0.02, 0.5, 4), materials.keratin)
    rib.position.set(-0.12, 0.25, 0.02)
    rib.rotation.z = 0.12
    g.add(e, rib)
    return g
  },

  // shell ears: a whorl that opens as it winds out, and then stays exactly
  // where it was put. The listening is done by the shape, not by aiming it.
  'ear.shellEars': ({ materials, side }) => {
    const g = new THREE.Group()
    const whorl = put(
      patch(20, 2, (u, v, out) => {
        // A ribbon wound up a cone: tight and narrow at the head, wide and
        // open at the far end, which is the way round a shell actually goes.
        const a = u * Math.PI * 4.2
        const r = 0.05 + 0.24 * u * u
        const s = (v - 0.5) * lerp(0.03, 0.19, u)
        out.set(Math.cos(a) * (r + s), 0.03 + u * 0.3 + s * 0.6, Math.sin(a) * (r + s))
      }),
      materials.flesh,
    )
    const collar = orb(materials.keratin, 0.085, 0)
    collar.scale.y = 0.45
    g.add(whorl, collar)
    g.rotation.y = side * 0.45
    return g
  },

  // wick-tips: a plain ear ending in a twist of cord, and the last thread of
  // it lit. Somebody made this, which is the only reason it burns.
  'ear.wickTips': ({ materials, side, rand }) => {
    const g = new THREE.Group()
    g.add(blade(materials.flesh, 0.22, 0.44, 0.05, 0.16, side * -0.14))
    const cord = chain(materials.keratin, {
      segments: 3,
      len: 0.2,
      baseR: 0.018,
      tipR: 0.006,
      curve: 0.5,
      twist: side * 1.6,
      radial: 3,
    })
    cord.root.position.y = 0.41
    const end = cord.joints[cord.joints.length - 1]
    // Frayed, because a wick that ends in a clean point is just a small spike.
    for (let i = 0; i < 3; i++) {
      const hair = put(new THREE.CylinderGeometry(0.003, 0.008, 0.07, 3), materials.keratin)
      hair.position.set((rand() - 0.5) * 0.03, 0.03, (rand() - 0.5) * 0.03)
      hair.rotation.set((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8)
      end.add(hair)
    }
    const lit = orb(materials.glow, 0.026)
    lit.castShadow = false
    end.add(lit)
    g.add(cord.root)
    return g
  },

  // bell cups: open cups, lit inside, aimed slightly apart.
  'ear.bellCups': ({ materials, side }) => {
    const g = new THREE.Group()
    const cup = put(
      patch(8, 3, (u, v, out) => {
        const a = u * Math.PI * 1.75 - Math.PI * 0.35
        const r = lerp(0.05, 0.26, v)
        out.set(Math.cos(a) * r, v * 0.42, Math.sin(a) * r)
      }),
      materials.flesh,
    )
    const lining = put(
      patch(8, 2, (u, v, out) => {
        const a = u * Math.PI * 1.75 - Math.PI * 0.35
        const r = lerp(0.04, 0.2, v)
        out.set(Math.cos(a) * r, 0.04 + v * 0.36, Math.sin(a) * r)
      }),
      materials.glow,
    )
    lining.castShadow = false
    g.add(cup, lining)
    g.rotation.y = side * 0.3
    g.rotation.z = side * -0.2
    return g
  },

  // folded tin: a flat sheet creased twice, hemmed along the top and riveted
  // on. Made by hand out of something that used to be part of something else.
  'ear.foldedTin': ({ materials, side }) => {
    const g = new THREE.Group()
    const sheet = put(
      patch(6, 3, (u, v, out) => {
        // The creases are what hold it up. A single flat panel of this size
        // would read as a sheet of cardboard, which is a different animal.
        const crease = Math.abs(((u * 3) % 1) - 0.5) * 0.1
        out.set((u - 0.5) * 0.34 * lerp(1, 0.55, v), v * 0.48, crease - v * 0.05)
      }),
      materials.chitin,
    )
    const hem = put(new THREE.CylinderGeometry(0.021, 0.021, 0.2, 5), materials.chitin)
    hem.position.set(0, 0.48, 0.01)
    hem.rotation.z = Math.PI / 2
    const rivet = orb(materials.keratin, 0.034, 0)
    rivet.position.set(0, 0.07, 0.06)
    g.add(sheet, hem, rivet)
    g.rotation.z = side * -0.22
    return g
  },

  // storm fans: four thin blades that spread like a hand.
  'ear.stormFans': ({ materials, side, rand }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 4; i++) {
      const t = i / 3
      const b = blade(materials.membrane, 0.13, lerp(0.56, 0.34, Math.abs(t - 0.4) * 2), 0.02, 0.18, 0)
      b.rotation.z = side * lerp(-0.35, 0.55, t)
      b.rotation.x = -0.12 + rand() * 0.08
      g.add(b)
    }
    const base = orb(materials.flesh, 0.09, 0)
    base.scale.y = 0.6
    g.add(base)
    return g
  },

  // moth ears: a central rib with barbs, more antenna than ear.
  'ear.mothEars': ({ materials, side }) => {
    const g = new THREE.Group()
    const c = chain(materials.keratin, {
      segments: 4,
      len: 0.62,
      baseR: 0.022,
      tipR: 0.008,
      curve: 0.45,
      twist: 0,
      radial: 4,
    })
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const barb = put(new THREE.CylinderGeometry(0.004, 0.012, 0.16 - i * 0.024, 3), materials.keratin)
        barb.position.set(s * 0.07, 0.02, 0)
        barb.rotation.z = s * 1.15
        c.joints[i].add(barb)
      }
    }
    c.root.rotation.z = side * -0.3
    g.add(c.root)
    return g
  },

  // pinned-back slits: almost nothing, laid flat against the skull.
  'ear.pinnedSlits': ({ materials, side }) => {
    const g = new THREE.Group()
    const s = put(
      patch(2, 2, (u, v, out) => {
        out.set((u - 0.5) * 0.13 * lerp(1, 0.3, v), v * 0.2, -v * 0.22)
      }),
      materials.flesh,
    )
    const lip = put(new THREE.CylinderGeometry(0.008, 0.014, 0.22, 4), materials.keratin)
    lip.position.set(0, 0.09, -0.09)
    lip.rotation.x = -0.85
    g.add(s, lip)
    g.rotation.y = side * 0.4
    return g
  },

  // listening fronds: long soft feelers, always slightly behind the head.
  'ear.listeningFronds': ({ materials, side, rand }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const c = chain(materials.flesh, {
        segments: 4,
        len: 0.5 + rand() * 0.3,
        baseR: 0.03,
        tipR: 0.008,
        curve: 0.95 + rand() * 0.3,
        twist: side * 0.4,
        radial: 4,
      })
      c.root.rotation.set(0.1 * i, side * (0.2 + i * 0.28), side * (-0.15 + i * 0.2))
      const tip = orb(materials.glow, 0.022)
      c.joints[c.joints.length - 1].add(tip)
      g.add(c.root)
    }
    return g
  },

  // flat-set ears: level, wide, and held still. Nothing about them moves.
  'ear.flatSet': ({ materials, side }) => {
    const g = new THREE.Group()
    const e = put(
      patch(3, 2, (u, v, out) => {
        const w = 0.3 * lerp(1, 0.5, v)
        out.set((u - 0.5) * w, v * 0.1, -v * 0.34)
      }),
      materials.flesh,
    )
    const ridge = put(new THREE.CylinderGeometry(0.014, 0.026, 0.32, 4), materials.keratin)
    ridge.position.set(0, 0.05, -0.16)
    ridge.rotation.x = Math.PI / 2
    g.add(e, ridge)
    g.rotation.y = side * 0.55
    g.rotation.z = side * -0.12
    return g
  },
}

// ---------------------------------------------------------------------------
// Wing builders
// ---------------------------------------------------------------------------

// A wing membrane stretched over `fingers` struts, hanging by `droop`, with a
// scalloped trailing edge. Span and chord are in socket widths.
function span(
  mat: THREE.Material,
  strutMat: THREE.Material,
  fingers: number,
  spanLen: number,
  chord: number,
  droop: number,
  tatter: number,
): THREE.Group {
  const g = new THREE.Group()
  const surface = put(
    patch(fingers * 3, 4, (u, v, out) => {
      const scallop = 1 - tatter * Math.abs(Math.sin(u * Math.PI * fingers))
      const c = chord * lerp(1, 0.35, u) * scallop
      out.set(u * spanLen, -droop * u * u - v * c * 0.35, -v * c)
    }),
    mat,
  )
  surface.castShadow = false
  g.add(surface)
  for (let i = 0; i <= fingers; i++) {
    const u = i / fingers
    const c = chord * lerp(1, 0.35, u)
    const strut = put(new THREE.CylinderGeometry(0.008, 0.018, c, 4), strutMat)
    strut.position.set(u * spanLen, -droop * u * u - c * 0.18, -c * 0.5)
    strut.rotation.x = Math.PI / 2
    g.add(strut)
  }
  const spar = put(new THREE.CylinderGeometry(0.012, 0.032, spanLen, 5), strutMat)
  spar.position.set(spanLen * 0.5, -droop * 0.33, 0)
  spar.rotation.z = Math.PI / 2 + Math.atan2(droop, spanLen) * 0.9
  g.add(spar)
  return g
}

const wings: Record<string, PartBuilder> = {
  // vestigial buds: the wing that never happened, and is a little sad for it.
  'wing.vestigialBuds': ({ materials }) => {
    const g = new THREE.Group()
    const bud = put(new THREE.CapsuleGeometry(0.07, 0.14, 3, 6), materials.flesh)
    bud.rotation.z = -0.8
    bud.position.set(0.1, 0.05, -0.02)
    const nail = put(new THREE.CylinderGeometry(0.004, 0.016, 0.1, 4), materials.keratin)
    nail.position.set(0.2, 0.11, -0.02)
    nail.rotation.z = -1.1
    g.add(bud, nail)
    return g
  },

  // hum-loops: closed rings that hold themselves off the body. No membrane.
  'wing.humLoops': ({ materials, side }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const ring = put(new THREE.TorusGeometry(0.34 - i * 0.11, 0.026, 4, 11), materials.glow)
      ring.castShadow = false
      ring.position.set(0.22 + i * 0.16, 0.3 + i * 0.16, -0.08 * i)
      ring.rotation.set(0.35, side * 0.5, side * -0.5)
      g.add(ring)
    }
    const mount = orb(materials.chitin, 0.08, 0)
    g.add(mount)
    return g
  },

  // harvest folds: not a flying wing at all. A gathered sheet with weight
  // sitting in the bottom of it, the way an apron is once it has been used.
  'wing.harvestFolds': ({ materials, side }) => {
    const g = new THREE.Group()
    const cloth = put(
      patch(14, 4, (u, v, out) => {
        // The pleats only open toward the hem. A sheet pleated all the way to
        // the shoulder reads as a curtain rather than as something carrying.
        const pleat = Math.sin(u * Math.PI * 5) * 0.05 * v
        out.set(u * 0.86, -v * v * 0.42 - u * 0.1, -v * 0.5 + pleat)
      }),
      materials.membrane,
    )
    cloth.castShadow = false
    g.add(cloth)
    for (let i = 0; i < 3; i++) {
      const load = orb(materials.flesh, 0.085 + i * 0.012, 1)
      load.position.set(0.22 + i * 0.23, -0.42, -0.4)
      g.add(load)
    }
    const cord = put(new THREE.CylinderGeometry(0.012, 0.012, 0.88, 4), materials.keratin)
    cord.position.set(0.43, -0.06, -0.02)
    cord.rotation.z = Math.PI / 2 - 0.13
    g.add(cord)
    g.rotation.y = side * 0.3
    return g
  },

  // paper kites: flat angular panels on stiff struts, no curve anywhere.
  'wing.paperKites': ({ materials, side }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const panel = put(
        patch(1, 1, (u, v, out) => {
          out.set(u * lerp(0.9, 0.55, i), v * lerp(0.55, 0.34, i) - u * 0.1, -v * 0.1)
        }),
        materials.membrane,
      )
      panel.castShadow = false
      panel.position.set(0.06, 0.1 + i * 0.34, -i * 0.16)
      panel.rotation.z = side * (0.2 - i * 0.35)
      g.add(panel)
      const strut = put(new THREE.CylinderGeometry(0.008, 0.018, lerp(0.92, 0.6, i), 4), materials.keratin)
      strut.position.set(0.06 + lerp(0.45, 0.28, i), 0.1 + i * 0.34 - lerp(0.05, 0.03, i), -i * 0.16)
      strut.rotation.z = Math.PI / 2 + side * (0.2 - i * 0.35)
      g.add(strut)
    }
    return g
  },

  // a roost cloak: a wing that is never open. It comes forward and round, and
  // there is room under it for somebody who is not the creature.
  'wing.roostCloak': ({ materials, side }) => {
    const g = new THREE.Group()
    // Wrapped around an upright axis instead of spread along a flat one, which
    // is the whole difference between a cloak and a sail.
    const sweep = (u: number) => -0.15 + u * 1.9
    const cloak = put(
      patch(12, 4, (u, v, out) => {
        const a = sweep(u)
        const r = lerp(0.42, 0.66, v)
        out.set(Math.sin(a) * r, 0.32 - v * 0.84, Math.cos(a) * r - 0.42)
      }),
      materials.membrane,
    )
    cloak.castShadow = false
    const hem = put(
      patch(12, 1, (u, v, out) => {
        const a = sweep(u)
        const r = 0.66 + v * 0.045
        out.set(Math.sin(a) * r, -0.52 - v * 0.06, Math.cos(a) * r - 0.42)
      }),
      materials.keratin,
    )
    const shoulder = put(new THREE.CylinderGeometry(0.02, 0.045, 0.42, 5), materials.keratin)
    shoulder.position.set(0.1, 0.28, -0.16)
    shoulder.rotation.z = -0.9
    g.add(cloak, hem, shoulder)
    g.rotation.y = side * 0.25
    return g
  },

  // beetle shells: hard covers, closed, with the real wing implied underneath.
  'wing.beetleShells': ({ materials, side }) => {
    const g = new THREE.Group()
    const shell = put(
      patch(7, 4, (u, v, out) => {
        const a = v * Math.PI
        const r = 0.3 * Math.sin(a) + 0.04
        out.set(u * 1.0, Math.cos(a) * r * 0.55 + 0.1, -Math.sin(a) * r - u * 0.08)
      }),
      materials.chitin,
    )
    const seam = put(new THREE.CylinderGeometry(0.014, 0.024, 0.98, 5), materials.chitin)
    seam.position.set(0.49, 0.42, 0)
    seam.rotation.z = Math.PI / 2
    g.add(shell, seam)
    g.rotation.y = side * 0.16
    return g
  },

  // oar spans: two shafts with a flat blade on the end of each. Built to pull
  // air rather than to rest on it, and it costs the animal every beat.
  'wing.oarSpans': ({ materials, side }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Group()
      const len = 1.15 - i * 0.3
      const shaft = put(new THREE.CylinderGeometry(0.024, 0.052, len, 5), materials.keratin)
      shaft.position.y = len * 0.5
      // Taper above 1, so the blade is wider at the far end than at the loom.
      // That one number is the difference between an oar and a fin.
      const paddle = blade(materials.membrane, 0.16, 0.46, 0.035, 2.1, 0)
      paddle.position.y = len - 0.02
      arm.add(shaft, paddle)
      arm.rotation.z = -Math.PI / 2 + (0.3 - i * 0.5)
      arm.position.set(0.04, 0.1 - i * 0.2, -i * 0.17)
      g.add(arm)
    }
    g.rotation.y = side * 0.22
    return g
  },

  // cleaver wings: short, broad, and all the weight along the front edge. A
  // wing in the same sense that a cleaver is a knife.
  'wing.cleaverWings': ({ materials, side }) => {
    const g = span(materials.membrane, materials.chitin, 3, 1.05, 0.78, 0.12, 0.05)
    const edge = put(new THREE.BoxGeometry(1.08, 0.07, 0.12), materials.chitin)
    edge.position.set(0.54, -0.05, 0.03)
    edge.rotation.z = -0.1
    g.add(edge)
    for (let i = 0; i < 3; i++) {
      const tooth = blade(materials.keratin, 0.1, 0.19, 0.02, 0.06, 0)
      tooth.position.set(0.3 + i * 0.3, -0.05 - i * 0.03, 0.07)
      // Tipped forward rather than up: these face whatever the wing is swung
      // at, which is the only reason to put teeth on a wing.
      tooth.rotation.x = -1.4
      g.add(tooth)
    }
    // Squared off at the tip. Nothing that ends in a point ever reads as heavy.
    const squared = put(new THREE.BoxGeometry(0.11, 0.46, 0.17), materials.chitin)
    squared.position.set(1.04, -0.26, -0.19)
    squared.rotation.z = -0.22
    g.add(squared)
    g.rotation.y = side * 0.2
    return g
  },

  // ash sails: big and torn, the trailing edge eaten away.
  'wing.ashSails': ({ materials, side }) => {
    const g = span(materials.membrane, materials.keratin, 4, 1.45, 0.72, 0.34, 0.4)
    g.rotation.y = side * 0.24
    g.rotation.z = 0.16
    return g
  },

  // a night span: the largest thing on the creature, and quiet with it.
  'wing.nightSpan': ({ materials, side }) => {
    const g = span(materials.membrane, materials.chitin, 5, 1.85, 0.9, 0.42, 0.12)
    const claw = put(new THREE.CylinderGeometry(0.004, 0.026, 0.16, 4), materials.keratin)
    claw.position.set(1.85, -0.42, 0)
    claw.rotation.z = -0.6
    g.add(claw)
    g.rotation.y = side * 0.18
    return g
  },

  // tether wings: a span that never fully leaves the body, roped back to it.
  'wing.tetherWings': ({ materials, side }) => {
    const g = span(materials.membrane, materials.keratin, 3, 1.05, 0.62, 0.5, 0.2)
    for (let i = 0; i < 3; i++) {
      const u = 0.35 + i * 0.28
      const cord = put(new THREE.CylinderGeometry(0.011, 0.011, 0.72, 4), materials.keratin)
      cord.position.set(u * 1.05 * 0.55, -0.5 * u * u - 0.24, -0.34)
      cord.rotation.set(0.5, 0, 0.9 - i * 0.12)
      g.add(cord)
    }
    g.rotation.y = side * 0.3
    return g
  },

  // gull spars: a hard elbow halfway out, so the wing bends up then down. The
  // one wing you can read as a shape from any angle.
  'wing.gullSpars': ({ materials, side }) => {
    const g = new THREE.Group()
    const inner = span(materials.membrane, materials.keratin, 2, 0.72, 0.66, -0.2, 0.08)
    g.add(inner)
    const elbow = new THREE.Group()
    elbow.position.set(0.72, 0.2, 0)
    elbow.rotation.z = -0.85
    const outer = span(materials.membrane, materials.keratin, 3, 0.9, 0.48, 0.16, 0.14)
    elbow.add(outer)
    const joint = orb(materials.chitin, 0.075, 0)
    elbow.add(joint)
    g.add(elbow)
    g.rotation.y = side * 0.2
    return g
  },
}

// ---------------------------------------------------------------------------
// Tail builders
// ---------------------------------------------------------------------------

const tails: Record<string, PartBuilder> = {
  // an anchor tail: weight at the end, and it hangs like it knows.
  'tail.anchorTail': ({ materials }) => {
    const g = new THREE.Group()
    const c = chain(materials.flesh, {
      segments: 3,
      len: 0.5,
      baseR: 0.26,
      tipR: 0.3,
      curve: 0.24,
      twist: 0,
      radial: 7,
    })
    const club = orb(materials.flesh, 0.36, 1)
    club.scale.set(0.9, 1.15, 0.9)
    c.joints[c.joints.length - 1].add(club)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const stud = orb(materials.keratin, 0.075, 0)
      stud.position.set(Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3)
      club.add(stud)
    }
    g.add(c.root)
    return g
  },

  // a lap curl: thick and soft, and it ends up in a coil wherever it is put
  // down. Slightly more than one full turn, so it closes rather than bends.
  'tail.lapCurl': ({ materials }) => {
    const g = new THREE.Group()
    const c = chain(materials.flesh, {
      segments: 9,
      len: 1.5,
      baseR: 0.21,
      tipR: 0.05,
      curve: 7.4,
      twist: 0.3,
      radial: 6,
    })
    const tuck = orb(materials.flesh, 0.075, 1)
    c.joints[c.joints.length - 1].add(tuck)
    g.add(c.root)
    return g
  },

  // a dust banner: a thin tail flying a torn streamer, and the streamer is
  // always half a beat behind wherever the group last went.
  'tail.dustBanner': ({ materials, rand }) => {
    const g = new THREE.Group()
    const c = chain(materials.flesh, {
      segments: 5,
      len: 1.05,
      baseR: 0.14,
      tipR: 0.03,
      curve: 0.4,
      twist: 0,
      radial: 5,
    })
    const flag = put(
      patch(12, 3, (u, v, out) => {
        // A wave along its length and a torn end, because a clean rectangle of
        // membrane reads as an unfinished asset at any size.
        const tear = 1 - Math.max(0, u - 0.68) * 1.5 * (0.4 + v * 0.6)
        out.set(Math.sin(u * 4.2) * 0.1, u * 0.9, (v - 0.5) * 0.42 * tear)
      }),
      materials.membrane,
    )
    flag.castShadow = false
    c.joints[2].add(flag)
    for (let i = 0; i < 3; i++) {
      const mote = orb(materials.glow, 0.015 + rand() * 0.01)
      mote.castShadow = false
      mote.position.set((rand() - 0.5) * 0.34, 0.5 + rand() * 0.6, -0.28 - rand() * 0.34)
      g.add(mote)
    }
    g.add(c.root)
    return g
  },

  // a whipcord tail: thin, long, and always trailing a beat behind.
  'tail.whipcord': ({ materials }) => {
    const c = chain(materials.flesh, {
      segments: 7,
      len: 1.9,
      baseR: 0.19,
      tipR: 0.014,
      curve: 0.55,
      twist: 0.2,
      radial: 5,
    })
    return c.root
  },

  // a braided tail: three cords wound together and tied off.
  'tail.braided': ({ materials, rand }) => {
    const g = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const c = chain(materials.flesh, {
        segments: 6,
        len: 1.15,
        baseR: 0.11,
        tipR: 0.03,
        curve: 0.4 + rand() * 0.2,
        twist: 1.4,
        radial: 4,
      })
      c.root.rotation.y = (i / 3) * Math.PI * 2
      c.root.position.set(Math.cos((i / 3) * 6.283) * 0.08, 0, Math.sin((i / 3) * 6.283) * 0.08)
      g.add(c.root)
    }
    for (let i = 0; i < 3; i++) {
      const tie = put(new THREE.TorusGeometry(0.13 - i * 0.03, 0.028, 3, 7), materials.keratin)
      tie.rotation.x = Math.PI / 2
      tie.position.y = 0.25 + i * 0.4
      g.add(tie)
    }
    return g
  },

  // a club tail: carried up rather than hanging, and the mass on the end of it
  // is angular. The anchor tail is heavy; this one is aimed.
  'tail.clubTail': ({ materials }) => {
    const g = new THREE.Group()
    const c = chain(materials.flesh, {
      segments: 4,
      len: 1.0,
      baseR: 0.2,
      tipR: 0.09,
      curve: -0.4,
      twist: 0,
      radial: 6,
    })
    const tip = c.joints[c.joints.length - 1]
    const head = put(new THREE.BoxGeometry(0.3, 0.34, 0.24), materials.chitin)
    head.position.y = 0.12
    head.rotation.y = 0.3
    tip.add(head)
    for (const s of [-1, 1]) {
      const spike = chain(materials.keratin, {
        segments: 2,
        len: 0.26,
        baseR: 0.05,
        tipR: 0.008,
        curve: 0.3,
        twist: 0,
        radial: 4,
      })
      spike.root.position.set(s * 0.13, 0.17, 0)
      spike.root.rotation.z = s * 1.2
      tip.add(spike.root)
    }
    g.add(c.root)
    return g
  },

  // milestone rings: one raised band for every long way the group went.
  'tail.milestoneRings': ({ materials }) => {
    const g = new THREE.Group()
    const c = chain(materials.flesh, {
      segments: 6,
      len: 1.35,
      baseR: 0.2,
      tipR: 0.05,
      curve: 0.42,
      twist: 0,
      radial: 6,
    })
    for (let i = 1; i < 6; i++) {
      const r = lerp(0.2, 0.05, i / 6) * 1.45
      const ring = put(new THREE.TorusGeometry(r, r * 0.3, 3, 8), materials.keratin)
      ring.rotation.x = Math.PI / 2
      c.joints[i].add(ring)
    }
    g.add(c.root)
    return g
  },

  // a lantern tip: the light is at the far end, where it lights nothing.
  'tail.lanternTip': ({ materials }) => {
    const g = new THREE.Group()
    const c = chain(materials.flesh, {
      segments: 6,
      len: 1.4,
      baseR: 0.17,
      tipR: 0.04,
      curve: 0.75,
      twist: 0,
      radial: 5,
    })
    const tip = c.joints[c.joints.length - 1]
    const bulb = orb(materials.glow, 0.15, 1)
    const husk = put(new THREE.TorusGeometry(0.15, 0.028, 4, 8), materials.keratin)
    husk.rotation.x = Math.PI / 2
    tip.add(bulb, husk)
    g.add(c.root)
    return g
  },

  // a quiet fan: opens flat, makes no noise, and is mostly for sitting still.
  'tail.quietFan': ({ materials }) => {
    const g = new THREE.Group()
    const c = chain(materials.flesh, {
      segments: 3,
      len: 0.62,
      baseR: 0.17,
      tipR: 0.09,
      curve: 0.3,
      twist: 0,
      radial: 6,
    })
    const tip = c.joints[c.joints.length - 1]
    for (let i = 0; i < 5; i++) {
      const t = i / 4
      const b = blade(materials.membrane, 0.19, lerp(0.5, 0.78, 1 - Math.abs(t - 0.5) * 2), 0.02, 0.55, 0)
      b.rotation.z = lerp(-0.85, 0.85, t)
      b.rotation.x = 0.1
      tip.add(b)
    }
    g.add(c.root)
    return g
  },

  // a forked rudder: two flat blades that steer, splitting halfway down.
  'tail.forkedRudder': ({ materials }) => {
    const g = new THREE.Group()
    const c = chain(materials.flesh, {
      segments: 4,
      len: 0.85,
      baseR: 0.19,
      tipR: 0.08,
      curve: 0.35,
      twist: 0,
      radial: 6,
    })
    const tip = c.joints[c.joints.length - 1]
    for (const s of [-1, 1]) {
      const fork = chain(materials.flesh, {
        segments: 3,
        len: 0.62,
        baseR: 0.07,
        tipR: 0.02,
        curve: 0.3,
        twist: 0,
        radial: 4,
      })
      fork.root.rotation.z = s * 0.42
      const fin = blade(materials.membrane, 0.3, 0.44, 0.02, 0.5, s * 0.2)
      fin.rotation.x = Math.PI / 2
      fin.position.y = 0.1
      fork.joints[1].add(fin)
      tip.add(fork.root)
    }
    g.add(c.root)
    return g
  },

  // a rattle tail: hollow segments stacked at the end, and it is meant to be
  // heard rather than looked at.
  'tail.rattleTail': ({ materials }) => {
    const g = new THREE.Group()
    const c = chain(materials.flesh, {
      segments: 5,
      len: 1.1,
      baseR: 0.18,
      tipR: 0.07,
      curve: 0.5,
      twist: 0,
      radial: 5,
    })
    const tip = c.joints[c.joints.length - 1]
    for (let i = 0; i < 5; i++) {
      const r = 0.15 - i * 0.02
      const seg = put(new THREE.CylinderGeometry(r * 0.72, r, 0.11, 6), materials.keratin)
      seg.position.y = i * 0.095
      seg.rotation.y = i * 0.4
      tip.add(seg)
    }
    return (g.add(c.root), g)
  },
}

// ---------------------------------------------------------------------------
// Spine builders
// ---------------------------------------------------------------------------

// Every spine builder gets index and count, and every one of them uses it. A
// row of identical plates looks like a mistake; a row that swells and falls
// away reads as an animal.
function alongSpine(index: number, count: number): number {
  return Math.sin((Math.min(index, count - 1) / Math.max(1, count - 1)) * Math.PI) * 0.7 + 0.3
}

const spines: Record<string, PartBuilder> = {
  // a moss ridge: soft lumps with something growing out of them.
  'spine.mossRidge': ({ materials, index, count, rand }) => {
    const g = new THREE.Group()
    const t = alongSpine(index, count)
    const lump = orb(materials.flesh, 0.2 * t, 1)
    lump.scale.set(1.1, 0.85, 1.4)
    g.add(lump)
    for (let i = 0; i < 4; i++) {
      const tuft = put(new THREE.CylinderGeometry(0.006, 0.016, 0.16 * t, 3), materials.glow)
      tuft.position.set((rand() - 0.5) * 0.2, 0.12 * t, (rand() - 0.5) * 0.24)
      tuft.rotation.set((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6)
      g.add(tuft)
    }
    return g
  },

  // a larder hump: fat put by, biggest over the middle of the back and gone by
  // the hips. The one trait that is larger for the group having done nothing.
  'spine.larderHump': ({ materials, index, count, rand }) => {
    const g = new THREE.Group()
    const t = alongSpine(index, count)
    const store = orb(materials.flesh, 0.3 * t, 1)
    store.scale.set(1.15, 0.88, 1.3)
    store.position.y = 0.03
    // Leaning off centre, because a full store does not sit square and a row
    // of matched domes down a back reads as packing material.
    const over = orb(materials.flesh, 0.16 * t, 1)
    over.scale.set(1.2, 0.7, 1.1)
    over.position.set((rand() - 0.5) * 0.17, 0.15 * t, -0.05)
    const tie = put(new THREE.TorusGeometry(0.27 * t, 0.022, 3, 10), materials.keratin)
    tie.rotation.x = Math.PI / 2
    tie.position.y = -0.03
    g.add(store, over, tie)
    return g
  },

  // handholds: a rung over each vertebra, polished where hands land. Somebody
  // is getting on, which is not a thing done to an animal nobody trusts.
  'spine.handholds': ({ materials, index, count }) => {
    const g = new THREE.Group()
    const h = 0.3 * alongSpine(index, count)
    for (const s of [-1, 1]) {
      const post = put(new THREE.CylinderGeometry(0.034, 0.05, h, 5), materials.keratin)
      post.position.set(0, h * 0.5, s * 0.13)
      g.add(post)
    }
    const rung = put(new THREE.CylinderGeometry(0.042, 0.042, 0.3, 6), materials.keratin)
    rung.position.y = h
    rung.rotation.x = Math.PI / 2
    // A short darker sleeve in the middle of the rung, so the wear is where a
    // hand actually goes rather than evenly along the whole bar.
    const worn = put(new THREE.CylinderGeometry(0.047, 0.047, 0.11, 6), materials.chitin)
    worn.position.y = h
    worn.rotation.x = Math.PI / 2
    g.add(rung, worn)
    return g
  },

  // travel knuckles: worn vertebrae, each one a little further out than sits
  // comfortably. The look of a creature that has been carried a long way.
  'spine.travelKnuckles': ({ materials, index, count }) => {
    const t = alongSpine(index, count)
    const g = new THREE.Group()
    const k = put(new THREE.OctahedronGeometry(0.22 * t, 0), materials.keratin)
    k.scale.set(0.8, 1.1, 0.9)
    k.position.y = 0.08 * t
    const under = put(new THREE.OctahedronGeometry(0.12 * t, 0), materials.keratin)
    under.position.y = -0.04
    g.add(k, under)
    return g
  },

  // a song comb: thin teeth that would ring if you ran a hand down them.
  'spine.songComb': ({ materials, index, count }) => {
    const g = new THREE.Group()
    const t = alongSpine(index, count)
    for (let i = 0; i < 3; i++) {
      const b = blade(materials.keratin, 0.06, 0.42 * t * lerp(1, 0.6, i / 2), 0.012, 0.5, 0)
      b.position.z = (i - 1) * 0.09
      g.add(b)
      const tip = orb(materials.glow, 0.022)
      tip.position.set(0, 0.42 * t * lerp(1, 0.6, i / 2), (i - 1) * 0.09)
      g.add(tip)
    }
    return g
  },

  // kiln plates: heavy fired slabs, overlapping, still hot in the gaps.
  'spine.kilnPlates': ({ materials, index, count }) => {
    const g = new THREE.Group()
    const t = alongSpine(index, count)
    const plate = put(
      patch(2, 2, (u, v, out) => {
        out.set((u - 0.5) * 0.44 * lerp(1, 0.55, v), v * 0.46 * t, -0.1 + v * 0.16)
      }),
      materials.chitin,
    )
    const heat = put(
      patch(2, 1, (u, v, out) => {
        out.set((u - 0.5) * 0.4, 0.02 + v * 0.08 * t, -0.11 - v * 0.02)
      }),
      materials.glow,
    )
    heat.castShadow = false
    g.add(plate, heat)
    return g
  },

  // gift spurs: small hooks that face forward, toward whoever is in front.
  'spine.giftSpurs': ({ materials, index, count }) => {
    const g = new THREE.Group()
    const t = alongSpine(index, count)
    for (const s of [-1, 1]) {
      const c = chain(materials.keratin, {
        segments: 3,
        len: 0.34 * t,
        baseR: 0.045,
        tipR: 0.008,
        curve: -0.95,
        twist: 0,
        radial: 4,
      })
      c.root.rotation.z = s * 0.42
      c.root.position.x = s * 0.06
      g.add(c.root)
    }
    return g
  },

  // a blade row: tall, thin, sharp, tallest over the shoulders.
  'spine.bladeRow': ({ materials, index, count }) => {
    const t = alongSpine(index, count)
    const g = new THREE.Group()
    const b = blade(materials.keratin, 0.16, 0.78 * t, 0.022, 0.12, 0)
    const spur = blade(materials.keratin, 0.09, 0.3 * t, 0.014, 0.2, 0.5)
    spur.position.z = -0.1
    g.add(b, spur)
    return g
  },

  // a stillness bloom: nothing at all along most of the back, and one open
  // flower at the middle of it. The payoff for a group that mostly waited.
  'spine.stillnessBloom': ({ materials, index, count }) => {
    const g = new THREE.Group()
    const mid = (count - 1) / 2
    const near = 1 - Math.min(1, Math.abs(index - mid) / 1.2)
    if (near < 0.2) {
      const bud = orb(materials.flesh, 0.09, 1)
      bud.scale.y = 0.7
      g.add(bud)
      return g
    }
    const petals = 6
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2
      const p = put(
        patch(2, 3, (u, v, out) => {
          const w = 0.16 * Math.sin(v * Math.PI) * near
          out.set((u - 0.5) * 2 * w, v * 0.4 * near + Math.sin(v * Math.PI) * 0.1, 0)
        }),
        materials.membrane,
      )
      p.castShadow = false
      p.rotation.y = a
      p.rotation.x = 0.75
      g.add(p)
    }
    const core = orb(materials.glow, 0.075 * near, 1)
    core.position.y = 0.1
    g.add(core)
    return g
  },

  // a war saddle: armour where somebody would sit, strapped down hard.
  'spine.warSaddle': ({ materials, index, count }) => {
    const g = new THREE.Group()
    const t = alongSpine(index, count)
    const shell = put(
      patch(5, 2, (u, v, out) => {
        const a = (u - 0.5) * Math.PI * 1.1
        out.set(Math.sin(a) * 0.34, Math.cos(a) * 0.2 * t + v * 0.05, (v - 0.5) * 0.42)
      }),
      materials.chitin,
    )
    g.add(shell)
    for (let i = 0; i < 3; i++) {
      const stud = orb(materials.keratin, 0.05, 0)
      stud.position.set(0, 0.2 * t + 0.02, (i - 1) * 0.14)
      g.add(stud)
    }
    const strap = put(new THREE.TorusGeometry(0.3, 0.024, 3, 9, Math.PI), materials.keratin)
    strap.rotation.y = Math.PI / 2
    g.add(strap)
    return g
  },

  // a peg-back: square pegs set in a row, the way a workshop wall holds tools.
  // Nothing organic about it, which is the point.
  'spine.pegBack': ({ materials, index, count }) => {
    const g = new THREE.Group()
    const t = alongSpine(index, count)
    for (let i = 0; i < 2; i++) {
      const h = 0.34 * t * lerp(1, 0.68, i)
      const peg = put(new THREE.BoxGeometry(0.11, h, 0.11), materials.keratin)
      peg.position.set(0, h * 0.5, (i - 0.5) * 0.16)
      peg.rotation.y = 0.2
      g.add(peg)
      const cap = put(new THREE.BoxGeometry(0.15, 0.04, 0.15), materials.chitin)
      cap.position.set(0, h, (i - 0.5) * 0.16)
      cap.rotation.y = 0.2
      g.add(cap)
    }
    const board = put(new THREE.BoxGeometry(0.24, 0.05, 0.34), materials.chitin)
    g.add(board)
    return g
  },
}

// ---------------------------------------------------------------------------
// Eye builders
// ---------------------------------------------------------------------------

// Sclera first, then whatever makes this eye that eye. Building the ball in one
// place keeps every eye the same size, which matters more than it sounds: an
// eye that changes size between alleles reads as the head changing shape.
function eyeball(mat: THREE.Material, r: number): THREE.Mesh {
  const m = put(new THREE.IcosahedronGeometry(r, 2), mat)
  m.castShadow = false
  return m
}

const eyes: Record<string, PartBuilder> = {
  // a milk veil: clouded over, looking at nothing in particular.
  'eye.milkVeil': ({ materials }) => {
    const g = new THREE.Group()
    const ball = eyeball(materials.keratin, 0.5)
    const veil = put(new THREE.IcosahedronGeometry(0.52, 1), materials.membrane)
    veil.castShadow = false
    g.add(ball, veil)
    return g
  },

  // honey rings: warm bands through the iris, laid down one at a time. Slow,
  // and there is no way at all to hurry them.
  'eye.honeyRings': ({ materials }) => {
    const g = new THREE.Group()
    g.add(eyeball(materials.eye, 0.5))
    for (let i = 0; i < 3; i++) {
      const r = 0.14 + i * 0.12
      const ring = put(new THREE.TorusGeometry(r, 0.022, 3, 14), materials.keratin)
      // Sat on the ball at the height the sphere is that wide, so the bands
      // curve with the eye instead of floating in front of it as a decal.
      ring.position.y = Math.sqrt(Math.max(0, 0.25 - r * r))
      ring.rotation.x = Math.PI / 2
      ring.castShadow = false
      g.add(ring)
    }
    const centre = orb(materials.pupil, 0.095, 0)
    centre.position.y = 0.47
    centre.castShadow = false
    g.add(centre)
    return g
  },

  // quick whites: a small pupil in a lot of white, already looking at the next
  // thing. The glance follows `side`, so a pair of them never quite stares.
  'eye.quickWhites': ({ materials, side, rand }) => {
    const g = new THREE.Group()
    g.add(eyeball(materials.keratin, 0.48))
    const look = new THREE.Vector3(side * 0.2 + (rand() - 0.5) * 0.12, 0.42, 0.19)
    const iris = orb(materials.eye, 0.16, 1)
    iris.position.copy(look)
    iris.castShadow = false
    const pupil = orb(materials.pupil, 0.085, 0)
    pupil.position.copy(look).multiplyScalar(1.12)
    pupil.castShadow = false
    // One lid, held high and clear of the iris. Without it the eye reads as
    // simply pale rather than as white showing where it should not.
    const lid = put(
      patch(5, 1, (u, v, out) => {
        const a = u * Math.PI
        out.set(Math.cos(a) * 0.52, 0.26 - v * 0.26, Math.sin(a) * 0.3 + 0.24 + v * 0.1)
      }),
      materials.flesh,
    )
    lid.castShadow = false
    g.add(iris, pupil, lid)
    return g
  },

  // weather eyes: a bar pupil, and a pale band riding across the eye like a
  // horizon sitting in it. Made for the far side of somewhere.
  'eye.weatherEyes': ({ materials }) => {
    const g = new THREE.Group()
    g.add(eyeball(materials.eye, 0.5))
    // Long across the face of the eye and thin the other way. A round pupil
    // here would lose the one thing the allele is named for.
    const bar = put(new THREE.BoxGeometry(0.11, 0.2, 0.56), materials.pupil)
    bar.position.y = 0.44
    bar.castShadow = false
    const band = put(
      patch(6, 1, (u, v, out) => {
        const x = 0.18 + v * 0.2
        const r = Math.sqrt(Math.max(0, 0.26 - x * x))
        // Kept to the outward face of the ball. Swept any further and the band
        // carries on round into the skull, where it is doing nobody any good.
        const a = (u - 0.5) * 2.2
        out.set(x, Math.cos(a) * r, Math.sin(a) * r)
      }),
      materials.keratin,
    )
    band.castShadow = false
    g.add(bar, band)
    return g
  },

  // coal pins: almost no eye at all, and a single hard point of light in it.
  'eye.coalPins': ({ materials }) => {
    const g = new THREE.Group()
    const ball = eyeball(materials.pupil, 0.46)
    const pin = orb(materials.glow, 0.09, 0)
    pin.position.y = 0.42
    pin.castShadow = false
    g.add(ball, pin)
    return g
  },

  // lamp gold: warm, wide open, and lit from behind.
  'eye.lampGold': ({ materials }) => {
    const g = new THREE.Group()
    const ball = eyeball(materials.eye, 0.54)
    const slit = put(new THREE.BoxGeometry(0.1, 0.62, 0.1), materials.pupil)
    slit.position.y = 0.16
    slit.castShadow = false
    g.add(ball, slit)
    return g
  },

  // split pupils: two of them, and they do not always agree.
  'eye.splitPupils': ({ materials }) => {
    const g = new THREE.Group()
    const ball = eyeball(materials.eye, 0.5)
    g.add(ball)
    for (const s of [-1, 1]) {
      const p = put(new THREE.BoxGeometry(0.12, 0.3, 0.1), materials.pupil)
      p.position.set(s * 0.17, 0.3, 0)
      p.rotation.z = s * 0.22
      p.castShadow = false
      g.add(p)
    }
    return g
  },

  // river glass: clear all the way through, with one bright facet.
  'eye.riverGlass': ({ materials }) => {
    const g = new THREE.Group()
    const ball = put(new THREE.IcosahedronGeometry(0.52, 1), materials.membrane)
    ball.castShadow = false
    const core = orb(materials.glow, 0.2, 0)
    core.castShadow = false
    const facet = put(new THREE.OctahedronGeometry(0.16, 0), materials.keratin)
    facet.position.set(0.2, 0.34, 0.2)
    facet.castShadow = false
    g.add(ball, core, facet)
    return g
  },

  // dusk lamps: big, low lidded, dim rather than bright.
  'eye.duskLamps': ({ materials }) => {
    const g = new THREE.Group()
    const ball = eyeball(materials.eye, 0.6)
    g.add(ball)
    for (const s of [1, -1]) {
      const lid = put(
        patch(4, 1, (u, v, out) => {
          const a = u * Math.PI
          out.set(Math.cos(a) * 0.64, s * (0.3 + v * 0.3), Math.sin(a) * 0.3 * (1 - v * 0.4))
        }),
        materials.flesh,
      )
      lid.castShadow = false
      g.add(lid)
    }
    return g
  },

  // far-sight rings: rings around the eye, focused on something not here.
  'eye.farSightRings': ({ materials }) => {
    const g = new THREE.Group()
    const ball = eyeball(materials.eye, 0.44)
    g.add(ball)
    for (let i = 0; i < 3; i++) {
      const r = 0.5 + i * 0.16
      const ring = put(new THREE.TorusGeometry(r, 0.03, 3, 10), materials.keratin)
      ring.position.y = 0.06 - i * 0.1
      ring.rotation.x = Math.PI / 2
      ring.castShadow = false
      g.add(ring)
    }
    return g
  },

  // witness eyes: the main eye, and smaller ones that also saw it.
  'eye.witnessEyes': ({ materials, side, rand }) => {
    const g = new THREE.Group()
    g.add(eyeball(materials.eye, 0.44))
    for (let i = 0; i < 3; i++) {
      const small = eyeball(materials.eye, 0.15 + rand() * 0.06)
      const a = -0.6 + i * 0.7 + rand() * 0.2
      small.position.set(Math.cos(a) * 0.62 * (side === 0 ? 1 : side), Math.sin(a) * 0.62, -0.1)
      g.add(small)
      const pin = orb(materials.pupil, 0.06, 0)
      pin.position.copy(small.position).multiplyScalar(1.12)
      pin.castShadow = false
      g.add(pin)
    }
    return g
  },

  // workbench eyes: focused close, with a loupe swung over one of them. The
  // asymmetry is deliberate, which is what `side` is for.
  'eye.workbenchEyes': ({ materials, side }) => {
    const g = new THREE.Group()
    g.add(eyeball(materials.eye, 0.46))
    const pupil = put(new THREE.BoxGeometry(0.16, 0.16, 0.1), materials.pupil)
    pupil.position.y = 0.3
    pupil.castShadow = false
    g.add(pupil)
    if (side >= 0) {
      const loupe = put(new THREE.TorusGeometry(0.6, 0.05, 3, 10), materials.keratin)
      loupe.rotation.x = Math.PI / 2
      loupe.position.y = 0.12
      const lens = put(new THREE.IcosahedronGeometry(0.58, 1), materials.membrane)
      lens.scale.y = 0.14
      lens.position.y = 0.12
      lens.castShadow = false
      const arm = put(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), materials.keratin)
      arm.position.set(-0.45, 0.1, -0.2)
      arm.rotation.z = 1.1
      g.add(loupe, lens, arm)
    }
    return g
  },
}

// ---------------------------------------------------------------------------
// Aura builders
// ---------------------------------------------------------------------------

// Auras are built in creature root space, not at a socket, and are animated by
// view.ts from the same auraFor() answer that chose the shape here. The named
// children below are the seam: view.ts looks them up by name, so an authored
// aura only has to use the same node names to animate identically.
export const AURA_NODES = {
  motes: 'aura.motes',
  shell: 'aura.shell',
  ring: 'aura.ring',
} as const

function moteField(color: THREE.Color, count: number, radius: number, size: number, rand: () => number): THREE.Points {
  const pos = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Rejection free spherical scatter, biased outward so the middle of the
    // cloud does not fill in and hide the animal.
    const a = rand() * Math.PI * 2
    const y = rand() * 2 - 1
    const r = radius * (0.45 + 0.55 * Math.cbrt(rand()))
    const s = Math.sqrt(Math.max(0, 1 - y * y))
    pos[i * 3] = Math.cos(a) * s * r
    pos[i * 3 + 1] = y * r * 0.75 + radius * 0.5
    pos[i * 3 + 2] = Math.sin(a) * s * r
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: color.clone(),
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const p = new THREE.Points(geo, mat)
  p.name = AURA_NODES.motes
  return p
}

// A back facing shell. Kept very faint and wider than the creature on purpose:
// at any real opacity its silhouette reads as a hard bubble drawn around the
// animal, which is the single most "programmer art" thing an aura can do.
function shell(color: THREE.Color, radius: number, opacity: number, additive: boolean): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(radius, 3)
  const mat = new THREE.MeshBasicMaterial({
    color: color.clone(),
    transparent: true,
    opacity,
    side: THREE.BackSide,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
  const m = new THREE.Mesh(geo, mat)
  m.name = AURA_NODES.shell
  return m
}

// Never fewer than about twenty sides. A six sided torus seen edge on is a set
// of straight hairlines crossing the animal, and that reads as a glitch.
function ringOf(color: THREE.Color, radius: number, thickness: number, sides: number): THREE.Mesh {
  const geo = new THREE.TorusGeometry(radius, thickness, 4, Math.max(20, sides))
  const mat = new THREE.MeshBasicMaterial({
    color: color.clone(),
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const m = new THREE.Mesh(geo, mat)
  m.name = AURA_NODES.ring
  return m
}

function buildAura(kind: Aura, opts: PartOpts): THREE.Object3D {
  const g = new THREE.Group()
  g.name = `aura:${opts.alleleId}`
  const c = opts.palette.glow
  switch (kind) {
    case 'none':
      break
    case 'motes':
      // Workshop dust: slow, plentiful, and it never quite settles.
      g.add(moteField(c, 90, 1.4, 0.028, opts.rand))
      break
    case 'emberfall':
      // Hearth warmth: fewer, bigger, and they rise.
      g.add(moteField(c, 46, 1.1, 0.05, opts.rand))
      g.add(shell(c, 2.1, 0.022, true))
      break
    case 'stormflick':
      // The smell of a coming storm: sparse, hard, and it snaps.
      g.add(moteField(c, 34, 1.6, 0.036, opts.rand))
      g.add(ringOf(c, 1.15, 0.012, 26))
      break
    case 'hush': {
      // A quiet room: a dark shell that eats the rim light rather than adding
      // to it. The only aura that makes the creature harder to see.
      const s = shell(opts.palette.background, 1.9, 0.3, false)
      g.add(s)
      break
    }
    case 'hum':
      g.add(shell(c, 1.9, 0.035, true))
      g.add(moteField(c, 22, 0.95, 0.03, opts.rand))
      break
    case 'ironring': {
      // Iron on the air: hard edged, tilted, and it does not soften.
      const a = ringOf(c, 1.3, 0.018, 30)
      a.rotation.set(1.15, 0.3, 0.2)
      const b = ringOf(c, 1.0, 0.013, 26)
      b.rotation.set(1.3, -0.5, -0.15)
      g.add(a, b)
      break
    }
    case 'tide':
      // A tide change: flat rings that leave the plinth and widen.
      for (let i = 0; i < 3; i++) {
        const r = ringOf(c, 0.5 + i * 0.02, 0.014, 24)
        r.rotation.x = Math.PI / 2
        r.position.y = 0.02
        g.add(r)
      }
      break
    case 'held':
      g.add(shell(c, 1.7, 0.045, true))
      g.add(moteField(c, 40, 1.25, 0.032, opts.rand))
      break
    case 'echo':
      // An answered quiet: rings that arrive from outside and close in, the
      // exact reverse of a tide change, which leaves.
      for (let i = 0; i < 4; i++) {
        const r = ringOf(c, 0.55, 0.016, 20)
        r.rotation.x = Math.PI / 2
        g.add(r)
      }
      g.add(moteField(c, 18, 0.8, 0.026, opts.rand))
      break
  }
  return g
}

// Two aura alleles that the shared Aura kinds in materials.ts do not name, so
// they are built here by id instead of by kind. Folding them into one of the
// nine existing kinds would mean two groups whose auras are described in
// different words are looking at the same particles in the same colour, and
// the aura is the layer people screenshot. They still use the AURA_NODES names
// so view.ts drives them like any other aura.
const extraAuras: Record<string, PartBuilder> = {
  // the feeling of somebody arriving: a wide ring low down, like a door open
  // somewhere out of frame, and what it stirs up drifting in rather than off.
  'aura.someoneComing': ({ alleleId, palette, rand }) => {
    const g = new THREE.Group()
    g.name = `aura:${alleleId}`
    const c = palette.glow
    for (let i = 0; i < 2; i++) {
      const r = ringOf(c, 1.45 - i * 0.5, 0.011 + i * 0.005, 32)
      r.rotation.x = Math.PI / 2
      r.position.y = 0.04 + i * 0.02
      g.add(r)
    }
    g.add(moteField(c, 30, 1.3, 0.03, rand))
    return g
  },

  // cold air coming off it: nothing rises. A still shell sitting low and wider
  // than it is tall, and frost catching the rim light and losing it again.
  'aura.coldAirOffIt': ({ alleleId, palette, rand }) => {
    const g = new THREE.Group()
    g.name = `aura:${alleleId}`
    const c = palette.glow
    const chill = shell(c, 1.75, 0.03, false)
    chill.scale.y = 0.6
    g.add(chill)
    g.add(moteField(c, 54, 1.5, 0.022, rand))
    return g
  },
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const HIDE_IDS: AlleleId[] = [
  'hide.tallowGloss',
  'hide.roadDust',
  'hide.thumbworn',
  'hide.brineArmour',
  'hide.kilnScale',
  'hide.stormPelt',
  'hide.lacquerCase',
  'hide.scarLattice',
  'hide.travelCoat',
  'hide.deepFelt',
  'hide.drumHide',
]

const AURA_IDS: AlleleId[] = [
  'aura.hearthWarm',
  'aura.stormSmell',
  'aura.workshopDust',
  'aura.quietRoom',
  'aura.lowHum',
  'aura.ironOnTheAir',
  'aura.tideChange',
  'aura.heldBreath',
  'aura.answeredQuiet',
]

let registered = false

// Called once by view.ts rather than run at import time, because a side effect
// on import is the kind of thing a bundler is allowed to drop and then nobody
// can work out why the creature is bald.
export function registerPlaceholderParts(): void {
  if (registered) return
  registered = true

  const tables: Array<Record<string, PartBuilder>> = [horns, ears, wings, tails, spines, eyes]
  for (const table of tables) {
    for (const id of Object.keys(table)) PART.register(id, table[id])
  }

  // A hide is a surface treatment, so there is nothing to hang anywhere. The
  // builder exists so the table is total over every allele and so an authored
  // decal or overlay mesh can be dropped in later without a special case.
  for (const id of HIDE_IDS) {
    PART.register(id, () => {
      const g = new THREE.Group()
      g.name = `hide:${id}`
      return g
    })
  }

  for (const id of AURA_IDS) {
    PART.register(id, (opts) => buildAura(auraFor(opts.alleleId), opts))
  }

  // The auras with no kind of their own, registered last so that giving one of
  // them a kind in materials.ts later is a deletion here and nothing else.
  for (const id of Object.keys(extraAuras)) PART.register(id, extraAuras[id])
}

// Which loci this module has builders for, so a caller can tell a missing part
// from a locus that is deliberately empty.
export function isSocketLocus(locus: Locus): boolean {
  return locus !== 'hide' && locus !== 'aura'
}
