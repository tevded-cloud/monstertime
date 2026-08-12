// body.ts: one body, deformed. Never a different body per creature.
//
// The whole point of the product is that a group's creature is theirs, so the
// tempting move is to build a fresh mesh for every combination. That is the
// move that makes a creature look assembled out of a parts bin. Instead there
// is exactly one animal here, made of nine segments, and the Morphs record
// stretches it. A long necked heavy sprawler and a short snouted upright are
// the same nine tubes with different numbers in them, which is why they still
// look related, and why a morph can be tweened rather than swapped.
//
// The tubes are placeholders in the same sense as everything in parts.ts: the
// intended replacement is an authored, rigged mesh whose bones are driven by
// the same Morphs record. The socket names below are the contract that makes
// that swap survivable, so they are stable even though the geometry is not.

import * as THREE from 'three'
import type { Morphs } from '../core/types'
import type { MaterialKit, Palette, Surface } from './materials'
import { hideColorAt, hideReliefAt } from './materials'

// ---------------------------------------------------------------------------
// Sockets
// ---------------------------------------------------------------------------

// Anchors parts hang off. A part builder never asks where the head is: it is
// handed a socket that is already in the right place, facing the right way,
// and already carrying the scale the anatomy implies (a big headed creature
// grows big horns without the horn builder knowing what a head is).
export interface Sockets {
  horn: THREE.Object3D[]
  ear: THREE.Object3D[]
  wing: THREE.Object3D[]
  tail: THREE.Object3D[]
  // Ordered from the base of the neck back to the rump, so a builder can taper
  // a sail without guessing which end it is at.
  spine: THREE.Object3D[]
  eye: THREE.Object3D[]
}

// What a pose wants the body to do. Kept as plain numbers rather than an action
// kind or a stance name so the anatomy stays in this file and the meaning of
// each one stays in view.ts: this file knows how far a neck bends, view.ts
// knows that a creature which has mostly been sung to holds its head over.
//
// TWO KINDS OF SCALAR LIVE IN HERE NOW, and the difference is what every rig
// below is written against. The first five are TRANSIENT: a reaction pushes
// one, it peaks, and it is back at zero a second later, so a rig may add it
// straight on top of the idle. The last seven are HELD: a stance or sleep puts
// a value in one and it stays there for hours. A rig must read those as the
// pose it is idling AROUND rather than as a departure from rest, which is why
// `settle` moves the pelvis to a second base height instead of subtracting from
// the first, and why the idle terms are damped as the held ones deepen. An
// animal lying down that goes on swaying its hips as though it were standing is
// the exact thing this split exists to stop.
export interface PoseDrive {
  /** Nose toward the ground. Negative raises the head instead. */
  headDip: number
  /** Weight loaded back onto the hindquarters. */
  crouch: number
  /** The whole animal turned away, hips and all. */
  turn: number
  /** A flick that runs out along the tail. */
  tailFlick: number
  /** Chest and front end carried up. */
  lift: number
  /** Head turned off the body's own axis, hips left square. Separate from
   *  `turn` because looking at something and walking away from it are two
   *  different acts, and one rig has hips to keep still while the other has
   *  none to turn. */
  headTurn: number
  /** Head rolled over, one ear brought down toward the shoulder. Nothing else
   *  in the set can cock a head, and a cocked head is the whole of listening. */
  headTilt: number
  /** Tipped onto one side, weight shifted that way. */
  lean: number
  /** Neck out, head forward and level, as if to reach what is in front of it. */
  reach: number
  /** 0..1, how far down onto the ground it is, weight off the legs. HELD. */
  settle: number
  /** 0..1, how far curled in on itself, nose round toward the tail. HELD. */
  tuck: number
  /** 0..1, how asleep. Only the parts a pose cannot say: the breath slows and
   *  deepens, and the eyes shut. The SHAPE of a sleeping animal is `settle` and
   *  `tuck`, which is exactly why a creature can be curled up and wide awake
   *  and still not look asleep. HELD. */
  sleep: number
}

// Every field, as a list, so a caller can compose two poses without naming
// twelve fields by hand.
//
// `satisfies` refuses a name that is not a field. UnlistedPoseKey below refuses
// a field the list forgot, which is the direction that actually bites: a scalar
// view.ts never blends is a pose that half works, and a pose that half works
// looks like a badly judged pose rather than like a missing line.
export const POSE_KEYS = [
  'headDip',
  'crouch',
  'turn',
  'tailFlick',
  'lift',
  'headTurn',
  'headTilt',
  'lean',
  'reach',
  'settle',
  'tuck',
  'sleep',
] as const satisfies readonly (keyof PoseDrive)[]

export type PoseKey = (typeof POSE_KEYS)[number]

/** A constraint, not a value: `T extends never` holds only when T IS never, so
 *  naming a non-empty union here is a compile error on the line below. */
type Nothing<T extends never> = T

/** Empty by construction. If PoseDrive gains a field and POSE_KEYS does not,
 *  the build stops here rather than three files away. */
export type UnlistedPoseKey = Nothing<Exclude<keyof PoseDrive, PoseKey>>

export const REST_POSE: PoseDrive = {
  headDip: 0,
  crouch: 0,
  turn: 0,
  tailFlick: 0,
  lift: 0,
  headTurn: 0,
  headTilt: 0,
  lean: 0,
  reach: 0,
  settle: 0,
  tuck: 0,
  sleep: 0,
}

export interface Body {
  root: THREE.Group
  sockets: Sockets
  // repaintHide is skipped frame by frame during a morph tween: recolouring
  // every facet sixty times a second to produce almost identical colours is the
  // kind of cost that only shows up on somebody else's laptop.
  setMorphs(m: Morphs, repaintHide?: boolean): void
  setSurface(surface: Surface, palette: Palette): void
  update(dt: number, clock: number, motion: number, drive: PoseDrive): void
  bounds(target: THREE.Box3): THREE.Box3
  dispose(): void
}

// ---------------------------------------------------------------------------
// Tube: the one geometry primitive the body is made of
// ---------------------------------------------------------------------------

export interface RingOut {
  x: number
  y: number
  z: number
  rx: number
  ry: number
}

// A tube runs along its own +Z with an elliptical cross section in XY, because
// almost every part of an animal is a stretched ellipse travelling along a
// line. Non indexed on purpose: each triangle owns its three vertices, which
// is what lets a facet take one flat colour and push out on its own for scales.
export class Tube {
  readonly geo: THREE.BufferGeometry
  readonly mesh: THREE.Mesh
  private readonly R: number
  private readonly S: number
  private readonly triCount: number
  private readonly pos: Float32Array
  private readonly cx: Float32Array
  private readonly cy: Float32Array
  private readonly cz: Float32Array
  private readonly er: Float32Array
  private readonly eh: Float32Array
  private surface: Surface
  private readonly out: RingOut = { x: 0, y: 0, z: 0, rx: 1, ry: 1 }

  constructor(rings: number, radial: number, material: THREE.Material, surface: Surface) {
    this.R = rings
    this.S = radial
    this.surface = surface
    this.triCount = (rings - 1) * radial * 2 + radial * 2
    this.pos = new Float32Array(this.triCount * 9)
    this.cx = new Float32Array(rings)
    this.cy = new Float32Array(rings)
    this.cz = new Float32Array(rings)
    this.er = new Float32Array(rings)
    this.eh = new Float32Array(rings)

    this.geo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(this.pos, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('position', posAttr)
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.triCount * 9), 3))

    this.mesh = new THREE.Mesh(this.geo, material)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
  }

  setSurface(s: Surface): void {
    this.surface = s
  }

  // Fills the rings from a profile function and rebuilds every triangle.
  write(fn: (u: number, out: RingOut) => void): void {
    const { R, S, cx, cy, cz, er, eh, out } = this
    for (let i = 0; i < R; i++) {
      out.x = 0
      out.y = 0
      out.z = 0
      out.rx = 1
      out.ry = 1
      fn(i / (R - 1), out)
      cx[i] = out.x
      cy[i] = out.y
      cz[i] = out.z
      er[i] = out.rx
      eh[i] = out.ry
    }

    const p = this.pos
    let v = 0
    let face = 0
    const cos = Math.cos
    const sin = Math.sin
    const step = (Math.PI * 2) / S

    for (let i = 0; i < R - 1; i++) {
      const u = i / (R - 1)
      for (let j = 0; j < S; j++) {
        const a = j * step
        const b = ((j + 1) % S) * step
        const mid = a + step * 0.5
        const meanR = (er[i] + er[i + 1] + eh[i] + eh[i + 1]) * 0.25
        const push = hideReliefAt(this.surface, u, face) * meanR
        const dx = cos(mid) * push
        const dy = sin(mid) * push

        const ax0 = cx[i] + er[i] * cos(a) + dx
        const ay0 = cy[i] + eh[i] * sin(a) + dy
        const az0 = cz[i]
        const ax1 = cx[i] + er[i] * cos(b) + dx
        const ay1 = cy[i] + eh[i] * sin(b) + dy
        const bx0 = cx[i + 1] + er[i + 1] * cos(a) + dx
        const by0 = cy[i + 1] + eh[i + 1] * sin(a) + dy
        const bz0 = cz[i + 1]
        const bx1 = cx[i + 1] + er[i + 1] * cos(b) + dx
        const by1 = cy[i + 1] + eh[i + 1] * sin(b) + dy

        // Two triangles per quad, wound so the normal points away from the axis.
        p[v++] = ax0
        p[v++] = ay0
        p[v++] = az0
        p[v++] = bx1
        p[v++] = by1
        p[v++] = bz0
        p[v++] = bx0
        p[v++] = by0
        p[v++] = bz0
        face++

        p[v++] = ax0
        p[v++] = ay0
        p[v++] = az0
        p[v++] = ax1
        p[v++] = ay1
        p[v++] = az0
        p[v++] = bx1
        p[v++] = by1
        p[v++] = bz0
        face++
      }
    }

    // Caps. No relief on them: a scale hanging off the tip of a snout reads as
    // a bug rather than as detail.
    for (let j = 0; j < S; j++) {
      const a = j * step
      const b = ((j + 1) % S) * step
      p[v++] = cx[0]
      p[v++] = cy[0]
      p[v++] = cz[0]
      p[v++] = cx[0] + er[0] * cos(b)
      p[v++] = cy[0] + eh[0] * sin(b)
      p[v++] = cz[0]
      p[v++] = cx[0] + er[0] * cos(a)
      p[v++] = cy[0] + eh[0] * sin(a)
      p[v++] = cz[0]
    }
    const L = R - 1
    for (let j = 0; j < S; j++) {
      const a = j * step
      const b = ((j + 1) % S) * step
      p[v++] = cx[L]
      p[v++] = cy[L]
      p[v++] = cz[L]
      p[v++] = cx[L] + er[L] * cos(a)
      p[v++] = cy[L] + eh[L] * sin(a)
      p[v++] = cz[L]
      p[v++] = cx[L] + er[L] * cos(b)
      p[v++] = cy[L] + eh[L] * sin(b)
      p[v++] = cz[L]
    }

    this.geo.attributes.position.needsUpdate = true
    this.geo.computeVertexNormals()
    // Both bounds, every write. Box3.setFromObject trusts a cached box, and a
    // stale one shows up as the camera framing an animal that is not there.
    this.geo.computeBoundingBox()
    this.geo.computeBoundingSphere()
  }

  // Colours are computed from the facet's position in BODY space, not segment
  // space, so "belly" means the underside of the animal and a band drawn along
  // the flank carries on across the shoulder onto the leg.
  paint(toBody: THREE.Matrix4, palette: Palette, surface: Surface, jitter: number): Float32Array {
    const colors = new Float32Array(this.triCount * 9)
    const p = this.pos
    const v = new THREE.Vector3()
    for (let f = 0; f < this.triCount; f++) {
      const o = f * 9
      v.set(
        (p[o] + p[o + 3] + p[o + 6]) / 3,
        (p[o + 1] + p[o + 4] + p[o + 7]) / 3,
        (p[o + 2] + p[o + 5] + p[o + 8]) / 3,
      )
      v.applyMatrix4(toBody)
      const c = hideColorAt(palette, surface, v.x, v.y, v.z, f, jitter)
      for (let k = 0; k < 3; k++) {
        colors[o + k * 3] = c.r
        colors[o + k * 3 + 1] = c.g
        colors[o + k * 3 + 2] = c.b
      }
    }
    return colors
  }

  applyColors(from: Float32Array, to: Float32Array, t: number): void {
    const attr = this.geo.attributes.color as THREE.BufferAttribute
    const dst = attr.array as Float32Array
    if (t >= 1) {
      dst.set(to)
    } else {
      for (let i = 0; i < dst.length; i++) dst[i] = from[i] + (to[i] - from[i]) * t
    }
    attr.needsUpdate = true
  }

  // A copy of what is on screen right now. A crossfade has to start from the
  // displayed colours rather than from the previous target, otherwise a second
  // hide change mid fade jumps.
  snapshotColors(): Float32Array {
    const attr = this.geo.attributes.color as THREE.BufferAttribute
    return new Float32Array(attr.array as Float32Array)
  }

  dispose(): void {
    this.geo.dispose()
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _p = new THREE.Vector3()
const _basis = new THREE.Matrix4()
const _inv = new THREE.Matrix4()
const _rel = new THREE.Matrix4()
const _tmpBox = new THREE.Box3()

// Points an object's local +Y along `up`, which is the direction a part grows.
function orientY(o: THREE.Object3D, ux: number, uy: number, uz: number): void {
  _y.set(ux, uy, uz).normalize()
  _z.set(0, 0, 1)
  if (Math.abs(_y.z) > 0.94) _z.set(0, 1, 0)
  _x.crossVectors(_y, _z).normalize()
  _z.crossVectors(_x, _y).normalize()
  _basis.makeBasis(_x, _y, _z)
  o.quaternion.setFromRotationMatrix(_basis)
}

// Points an object's local +Z along `dir`, which is the way a tube runs. The
// reference direction is passed in rather than chosen here: picking it from the
// direction itself makes the frame flip when the direction crosses the guard,
// and a limb frame that flips halfway through a stance change is a bug you
// spend an afternoon on.
function orientZ(
  o: THREE.Object3D,
  dx: number,
  dy: number,
  dz: number,
  rx: number,
  ry: number,
  rz: number,
): void {
  _z.set(dx, dy, dz).normalize()
  _y.set(rx, ry, rz)
  _x.crossVectors(_y, _z).normalize()
  _y.crossVectors(_z, _x).normalize()
  _basis.makeBasis(_x, _y, _z)
  o.quaternion.setFromRotationMatrix(_basis)
}

function sample(table: readonly number[], u: number): number {
  const t = THREE.MathUtils.clamp(u, 0, 1) * (table.length - 1)
  const i = Math.min(Math.floor(t), table.length - 2)
  return THREE.MathUtils.lerp(table[i], table[i + 1], t - i)
}

const lerp = THREE.MathUtils.lerp
const clamp = THREE.MathUtils.clamp

// Which way a creature curls when it goes down: nose toward its own left, tail
// round the same way to meet it. Every creature curls the same way on purpose.
// The alternative is one more draw off the generator buildBody is handed, and
// view.ts hands that SAME generator to every part builder afterwards, so one
// extra call here would re-jitter every horn, ear and plate on every creature
// that already exists. A group can never see two of these side by side anyway.
const CURL_SIDE = 1

// Silhouette tables. These are the shape of the animal and the most opinionated
// numbers in the forge: they decide that it is a heavy chested quadruped and
// not a snake or a blob, whatever the morphs say.
const TORSO_W = [0.74, 0.94, 1.0, 0.97, 0.88, 0.7] as const
const TORSO_H = [0.7, 0.9, 1.0, 1.0, 0.9, 0.72] as const
const HIPS_W = [0.5, 0.86, 0.98, 0.92, 0.78] as const
const HIPS_H = [0.46, 0.82, 0.96, 0.94, 0.8] as const
const HEAD_W = [0.22, 0.78, 1.0, 0.94, 0.7, 0.54, 0.46, 0.3] as const
const HEAD_H = [0.22, 0.8, 1.0, 0.88, 0.6, 0.48, 0.44, 0.24] as const
const LIMB_W = [1.0, 0.86, 0.94, 0.78, 0.7, 0.62] as const

// ---------------------------------------------------------------------------
// The rig numbers, derived from the morphs in one place
// ---------------------------------------------------------------------------

interface Rig {
  bodyRx: number
  bodyRy: number
  torsoLen: number
  hipsLen: number
  neckLen: number
  neckR: number
  skullLen: number
  snoutLen: number
  headRx: number
  headRy: number
  tailLen: number
  tailR: number
  limbLen: number
  limbR: number
  splay: number
  hipY: number
  torsoPitch: number
  neckPitch: number
  headPitch: number
  eyeScale: number
  hornScale: number
}

function deriveRig(m: Morphs): Rig {
  const bulk = m.bulk
  const stance = m.stance
  const bodyRx = lerp(0.3, 0.6, bulk)
  const bodyRy = lerp(0.28, 0.56, bulk) * lerp(1.0, 0.92, stance)
  const limbLen = lerp(0.32, 0.86, m.limbLength)
  const splay = lerp(0.62, 0.1, stance)
  const headRx = lerp(0.2, 0.34, m.headSize)
  // A heavy animal on short legs still has to clear the ground. Standing it on
  // leg length alone drags the belly through the plinth, so the hips take the
  // higher of the two, and the legs stretch to meet the floor. It reads as an
  // animal whose legs had to be long enough to hold that body up.
  const belly = bodyRy * (1.14 + 0.12 * bulk) + 0.05

  return {
    bodyRx,
    bodyRy,
    torsoLen: lerp(0.78, 1.02, bulk),
    hipsLen: lerp(0.34, 0.48, bulk),
    neckLen: lerp(0.22, 1.05, m.neckLength),
    neckR: lerp(0.1, 0.19, bulk) * lerp(1.05, 0.86, m.neckLength),
    skullLen: lerp(0.26, 0.42, m.headSize),
    snoutLen: lerp(0.07, 0.46, m.snoutLength),
    headRx,
    headRy: headRx * lerp(0.96, 0.82, m.snoutLength),
    tailLen: lerp(0.3, 1.0, m.tailBase),
    tailR: lerp(0.08, 0.25, m.tailBase) * lerp(0.9, 1.15, bulk),
    limbLen,
    limbR: lerp(0.07, 0.14, bulk),
    splay,
    hipY: Math.max(0.055 + limbLen * Math.cos(splay), belly),
    torsoPitch: lerp(0.03, 0.5, stance),
    neckPitch: lerp(0.34, -0.06, stance),
    headPitch: lerp(-0.28, -0.34, stance),
    eyeScale: lerp(0.66, 1.5, m.eyeSize),
    hornScale: lerp(0.78, 1.24, m.headSize),
  }
}

// ---------------------------------------------------------------------------
// buildBody
// ---------------------------------------------------------------------------

export function buildBody(materials: MaterialKit, palette: Palette, surface: Surface, rand: () => number): Body {
  const root = new THREE.Group()
  root.name = 'creature'

  const pelvis = new THREE.Group()
  const torso = new THREE.Group()
  const neck = new THREE.Group()
  const head = new THREE.Group()
  // The tail is two nodes: one aimed with a quaternion by setMorphs, one swung
  // with Euler angles by update. Writing both onto one node would have the
  // animation quietly wipe the aim, because three keeps the two in sync.
  const tailAim = new THREE.Group()
  const tailSway = new THREE.Group()
  root.add(pelvis)
  pelvis.add(torso, tailAim)
  tailAim.add(tailSway)
  torso.add(neck)
  neck.add(head)

  const hipsTube = new Tube(5, 9, materials.body, surface)
  const torsoTube = new Tube(6, 9, materials.body, surface)
  const neckTube = new Tube(5, 8, materials.body, surface)
  const headTube = new Tube(8, 10, materials.body, surface)
  const jawTube = new Tube(4, 7, materials.body, surface)
  const tailTube = new Tube(6, 8, materials.body, surface)
  pelvis.add(hipsTube.mesh)
  torso.add(torsoTube.mesh)
  neck.add(neckTube.mesh)
  head.add(headTube.mesh, jawTube.mesh)
  tailSway.add(tailTube.mesh)

  // Four limbs, each a node holding one tapered tube and one foot.
  //
  // Two nodes per limb for the same reason the tail has two: `node` is aimed
  // with a quaternion by setMorphs and `fold` is swung with Euler angles by
  // update. Writing both onto one node would have the fold quietly wipe the
  // splay, because three keeps quaternion and rotation in sync and the last
  // write wins.
  interface Limb {
    node: THREE.Group
    fold: THREE.Group
    tube: Tube
    foot: Tube
    footNode: THREE.Group
    side: number
    fore: boolean
    // Where this limb hangs from when the animal is standing, and how far down
    // from there its foot reaches, both in root space and both recorded by
    // setMorphs. update needs the pair to work out how far the leg has to swing
    // to leave the foot where it was, which is the only thing standing between
    // a held crouch and four feet buried in the plinth.
    hipY: number
    span: number
  }
  const limbs: Limb[] = []
  for (const fore of [false, true]) {
    for (const side of [-1, 1]) {
      const node = new THREE.Group()
      const fold = new THREE.Group()
      const tube = new Tube(6, 7, materials.body, surface)
      const footNode = new THREE.Group()
      const foot = new Tube(3, 6, materials.body, surface)
      node.add(fold)
      fold.add(tube.mesh, footNode)
      footNode.add(foot.mesh)
      ;(fore ? torso : pelvis).add(node)
      limbs.push({ node, fold, tube, foot, footNode, side, fore, hipY: 1, span: 1 })
    }
  }

  const tubes = [hipsTube, torsoTube, neckTube, headTube, jawTube, tailTube]
  for (const l of limbs) tubes.push(l.tube, l.foot)

  // Sockets. Created once, moved by setMorphs, never rebuilt, so a part that is
  // attached stays attached while the creature changes shape underneath it.
  const mk = (parent: THREE.Object3D, name: string) => {
    const o = new THREE.Object3D()
    o.name = name
    parent.add(o)
    return o
  }
  const sockets: Sockets = {
    horn: [mk(head, 'horn.l'), mk(head, 'horn.r')],
    ear: [mk(head, 'ear.l'), mk(head, 'ear.r')],
    wing: [mk(torso, 'wing.l'), mk(torso, 'wing.r')],
    tail: [mk(tailSway, 'tail.tip')],
    spine: [
      mk(neck, 'spine.0'),
      mk(torso, 'spine.1'),
      mk(torso, 'spine.2'),
      mk(torso, 'spine.3'),
      mk(pelvis, 'spine.4'),
      mk(pelvis, 'spine.5'),
    ],
    eye: [mk(head, 'eye.l'), mk(head, 'eye.r')],
  }

  // Base transforms recorded by setMorphs so the idle animation can add to them
  // rather than fight them.
  //
  // lieY is the second base height and it is what makes lying down a pose
  // rather than a crouch. A held `settle` cannot be a subtraction from the
  // standing height: subtract enough to get the belly down and a long legged
  // creature drives its feet through the plinth, subtract little enough to keep
  // the feet honest and a short legged one never reaches the ground. So the two
  // heights are measured separately and the pose crossfades between them.
  let base = {
    pelvisY: 1,
    lieY: 1,
    pelvisPitch: 0,
    torsoPitch: 0,
    neckPitch: 0,
    headPitch: 0,
    tailPitch: 0,
    bodyRx: 0.4,
    bodyRy: 0.4,
    neckLen: 0.5,
    headDrop: 0.2,
    footRot: -Math.PI / 2,
  }
  // What setMorphs put on the eye sockets, kept because update squashes them
  // shut and has to know what open was.
  let eyeBase = 0.1

  let currentSurface = surface
  let currentPalette = palette
  const colorFrom = new Map<Tube, Float32Array>()
  const colorTo = new Map<Tube, Float32Array>()
  let fade = 1
  const jitterAmount = 0.045 + rand() * 0.03
  // The breath's own clock, advanced by update at its own rate. See update for
  // why it is not simply `clock`.
  let lastClock = 0
  let breathClock = 0

  // A morph change repaints instantly: the colours barely move, and fading them
  // would only add a pointless second of blur. A hide change crossfades,
  // because that is the moment a group actually earned.
  function repaint(crossfade: boolean): void {
    root.updateMatrixWorld(true)
    _inv.copy(root.matrixWorld).invert()
    const started = crossfade && colorTo.size > 0
    for (const t of tubes) {
      _rel.multiplyMatrices(_inv, t.mesh.matrixWorld)
      const next = t.paint(_rel, currentPalette, currentSurface, jitterAmount)
      colorFrom.set(t, started ? t.snapshotColors() : next)
      colorTo.set(t, next)
    }
    fade = started ? 0 : 1
    for (const t of tubes) t.applyColors(colorFrom.get(t)!, colorTo.get(t)!, fade)
  }

  function setMorphs(m: Morphs, repaintHide = true): void {
    const r = deriveRig(m)

    pelvis.position.set(0, r.hipY, -r.torsoLen * 0.45)
    pelvis.rotation.set(0, 0, 0)
    torso.position.set(0, 0, r.hipsLen * 0.5)
    torso.rotation.x = -r.torsoPitch
    neck.position.set(0, r.bodyRy * 0.42, r.torsoLen)
    neck.rotation.x = -r.neckPitch
    head.position.set(0, 0, r.neckLen)
    head.rotation.x = -r.headPitch
    tailAim.position.set(0, r.bodyRy * 0.34, -r.hipsLen * 0.5)
    orientZ(tailAim, 0, -0.16 - 0.28 * m.tailBase, -1, 0, 1, 0)

    base = {
      pelvisY: r.hipY,
      // Where the pelvis sits when the belly is on the plinth. Read off the
      // same body radius the torso tube is written from, plus a little, and
      // clamped below to the standing height after settle() has had its say: a
      // creature whose legs are shorter than its body is already lying down and
      // must not rise to lie down.
      lieY: r.bodyRy * 1.2 + 0.02,
      pelvisPitch: 0,
      torsoPitch: -r.torsoPitch,
      neckPitch: -r.neckPitch,
      headPitch: -r.headPitch,
      tailPitch: 0,
      bodyRx: r.bodyRx,
      bodyRy: r.bodyRy,
      neckLen: r.neckLen,
      footRot: -Math.PI / 2 + r.splay * 0.3,
      // Roughly how far the head hangs below the end of the neck: half its own
      // length, since it is pitched down off the neck to begin with, plus the
      // jaw. Only ever used to keep the thing off the floor, so it is allowed
      // to be an estimate as long as it is not an underestimate.
      headDrop: r.headRy * 1.5 + (r.skullLen + r.snoutLen) * 0.5,
    }

    // Hips run backward from the pelvis node, torso forward from it.
    hipsTube.write((u, o) => {
      o.z = -r.hipsLen * 0.5 + u * r.hipsLen
      o.y = -r.bodyRy * 0.05 * (1 - u)
      o.rx = r.bodyRx * sample(HIPS_W, u) * 0.95
      o.ry = r.bodyRy * sample(HIPS_H, u) * 0.95
    })
    torsoTube.write((u, o) => {
      o.z = u * r.torsoLen
      // The gut hangs below the spine line, and hangs further on a heavy animal.
      o.y = -r.bodyRy * 0.12 * Math.sin(Math.PI * u) * (0.4 + m.bulk)
      o.rx = r.bodyRx * sample(TORSO_W, u)
      o.ry = r.bodyRy * sample(TORSO_H, u)
    })
    neckTube.write((u, o) => {
      o.z = u * r.neckLen
      o.y = r.neckLen * 0.16 * Math.sin(Math.PI * u)
      o.rx = r.neckR * lerp(1.25, 0.86, u)
      o.ry = r.neckR * lerp(1.2, 0.86, u)
    })

    const headZ = (u: number) => (u < 0.55 ? (u / 0.55) * r.skullLen : r.skullLen + ((u - 0.55) / 0.45) * r.snoutLen)
    const headY = (u: number) => -r.headRy * 0.2 * THREE.MathUtils.smoothstep(u, 0.5, 1)
    headTube.write((u, o) => {
      o.z = headZ(u)
      o.y = headY(u)
      o.rx = r.headRx * sample(HEAD_W, u)
      o.ry = r.headRy * sample(HEAD_H, u)
    })
    // The jaw is what makes the head read as a head and not as a thumb.
    jawTube.write((u, o) => {
      const t = 0.42 + u * 0.58
      o.z = headZ(t)
      o.y = headY(t) - r.headRy * lerp(0.34, 0.2, u)
      o.rx = r.headRx * sample(HEAD_W, t) * lerp(0.86, 0.6, u)
      o.ry = r.headRy * lerp(0.3, 0.16, u)
    })

    tailTube.write((u, o) => {
      o.z = u * r.tailLen
      o.rx = r.tailR * lerp(1.0, 0.32, u)
      o.ry = r.tailR * lerp(1.0, 0.32, u)
    })

    // Limb attach points first, then measure how far each one is off the
    // ground, then cut the limb to length. Front limbs come out shorter on an
    // upright creature and that is the whole silhouette of standing up.
    for (const l of limbs) {
      if (l.fore) {
        l.node.position.set(l.side * r.bodyRx * 0.66, -r.bodyRy * 0.22, r.torsoLen * 0.72)
      } else {
        l.node.position.set(l.side * r.bodyRx * 0.74, -r.bodyRy * 0.2, r.hipsLen * 0.1)
      }
      // The reference is the creature's forward axis, which a leg direction is
      // never parallel to, so this frame is stable at every stance: local +Z
      // runs down the leg and local +Y points forward.
      orientZ(l.node, l.side * Math.sin(r.splay), -Math.cos(r.splay), l.fore ? -0.06 : 0.06, 0, 0, 1)
    }
    root.updateMatrixWorld(true)
    _inv.copy(root.matrixWorld).invert()

    for (const l of limbs) {
      // Measured in root space, so the growth scale view.ts puts on the root
      // cannot make the feet sink into the plinth or float above it.
      const hipY = l.node.getWorldPosition(_p).applyMatrix4(_inv).y
      const reach = THREE.MathUtils.clamp((hipY - 0.06) / Math.max(0.25, Math.cos(r.splay)), 0.16, r.limbLen * 2.1)
      l.hipY = hipY
      // The vertical part of the leg. A splayed leg spends some of its length
      // going sideways, and a leg clamped short by limbLength does not reach
      // the ground at all, so this is measured rather than assumed to be the
      // hip height: the swing below has to be exact at rest or every creature
      // stands with bent legs.
      l.span = reach * Math.max(0.25, Math.cos(r.splay))
      const thick = r.limbR * (l.fore ? 0.88 : 1.0)
      l.tube.write((u, o) => {
        o.z = u * reach
        // A knee, pushed backward on the hind limb and forward on the fore.
        o.y = (l.fore ? 1 : -1) * thick * 0.55 * Math.sin(Math.PI * u)
        o.rx = thick * sample(LIMB_W, u)
        o.ry = thick * sample(LIMB_W, u) * 1.08
      })
      l.footNode.position.set(0, 0, reach)
      // Swings the foot from pointing down the leg to pointing forward. update
      // takes the leg's own swing back out of this, so the sole stays flat to
      // the plinth however far the leg has folded.
      l.footNode.rotation.set(base.footRot, 0, 0)
      l.foot.write((u, o) => {
        o.z = u * thick * 2.4
        o.y = -thick * 0.15
        o.rx = thick * lerp(0.95, 1.15, u)
        o.ry = thick * lerp(0.7, 0.34, u)
      })
    }

    // Sockets. Everything below reads the same profile numbers the tubes were
    // written from, which is the mechanism that keeps horns on the skull.
    //
    // Each socket also carries a scale, so a part builder works in "fractions
    // of a socket width" and never has to ask how big the head is. A big
    // headed creature grows big horns without the horn builder knowing what a
    // head is.
    const headWidth = r.headRx * 2
    const bodyWidth = r.bodyRx * 2
    const skullU = 0.3
    const sRx = r.headRx * sample(HEAD_W, skullU)
    const sRy = r.headRy * sample(HEAD_H, skullU)
    const sZ = headZ(skullU)
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1
      const horn = sockets.horn[i]
      horn.position.set(s * sRx * 0.44, sRy * 0.86 + headY(skullU), sZ)
      orientY(horn, s * 0.3, 0.94, -0.14)
      horn.scale.setScalar(headWidth * r.hornScale * 0.9)

      const ear = sockets.ear[i]
      ear.position.set(s * sRx * 0.82, sRy * 0.46 + headY(skullU), headZ(0.2))
      orientY(ear, s * 0.86, 0.5, -0.12)
      ear.scale.setScalar(headWidth * r.hornScale * 0.8)

      const eyeU = 0.5
      const eRx = r.headRx * sample(HEAD_W, eyeU)
      const eRy = r.headRy * sample(HEAD_H, eyeU)
      const eye = sockets.eye[i]
      eye.position.set(s * eRx * 0.72, eRy * 0.4 + headY(eyeU), headZ(eyeU))
      orientY(eye, s * 0.8, 0.36, 0.34)
      eyeBase = headWidth * r.eyeScale * 0.34
      eye.scale.setScalar(eyeBase)

      const wingU = 0.72
      const wing = sockets.wing[i]
      wing.position.set(
        s * r.bodyRx * sample(TORSO_W, wingU) * 0.82,
        r.bodyRy * sample(TORSO_H, wingU) * 0.52,
        r.torsoLen * wingU,
      )
      orientY(wing, s * 0.72, 0.68, -0.1)
      wing.scale.setScalar(bodyWidth * lerp(0.9, 1.25, m.bulk))
    }

    // Spine run, ordered neck first. Each anchor sits on the top of whichever
    // segment it belongs to and inherits that segment's motion for free.
    sockets.spine[0].position.set(0, r.neckR * 0.95 + r.neckLen * 0.16 * Math.sin(Math.PI * 0.72), r.neckLen * 0.72)
    orientY(sockets.spine[0], 0, 1, 0.28)
    const torsoUs = [0.78, 0.5, 0.22]
    for (let i = 0; i < 3; i++) {
      const u = torsoUs[i]
      const so = sockets.spine[1 + i]
      so.position.set(0, r.bodyRy * sample(TORSO_H, u), r.torsoLen * u)
      orientY(so, 0, 1, 0.06)
    }
    const hipUs = [0.7, 0.3]
    for (let i = 0; i < 2; i++) {
      const u = hipUs[i]
      const so = sockets.spine[4 + i]
      so.position.set(0, r.bodyRy * sample(HIPS_H, u) * 0.95, -r.hipsLen * 0.5 + u * r.hipsLen)
      orientY(so, 0, 1, -0.05)
    }
    for (const s of sockets.spine) s.scale.setScalar(r.bodyRy * 2 * lerp(0.44, 0.62, m.bulk))

    sockets.tail[0].position.set(0, 0, r.tailLen)
    orientY(sockets.tail[0], 0, 0, 1)
    sockets.tail[0].scale.setScalar(r.tailR * 4.2)

    settle()
    // After settle(), never before: settle shifts the whole animal to put its
    // lowest point on the plinth, so the standing height is not known until it
    // has run, and lying down must never lift the creature up.
    base.lieY = Math.min(base.pelvisY, base.lieY)

    if (repaintHide || colorTo.size === 0) repaint(false)
    else root.updateMatrixWorld(true)
  }

  // Drops the whole animal until its lowest point rests on the plinth, then
  // records the corrected hip height so the idle animates around it.
  //
  // This is measured rather than derived because the analytic version has to
  // know how far a foot hangs below its own ankle at a given splay, and every
  // future change to the foot would silently break it. Measuring is one pass
  // per morph change, not per frame, and it cannot go out of date. Only the
  // body's own tubes are measured: a wing hanging low is not the animal
  // standing on its wingtip.
  function settle(): void {
    // Everything update leaves behind that setMorphs does not already reset,
    // put back to rest before a single vertex is measured. This is not tidying:
    // update leaves the legs FOLDED, and a morph drift arriving while the
    // creature is lying down would otherwise measure an animal standing at full
    // height with its legs stretched out in front of it, decide its belly was
    // the lowest thing on it, and drop the whole rig by most of a leg. The
    // standing height recorded here is the one every pose is measured against,
    // so it has to be the height of the animal STANDING.
    //
    // The rolls and the breath are in the list for a smaller version of the
    // same reason: without them the height a creature settles at depends on
    // which frame of its idle the morph tween happened to land on.
    for (const l of limbs) l.fold.rotation.set(0, 0, 0)
    torso.rotation.z = 0
    torso.scale.set(1, 1, 1)
    neck.rotation.y = 0
    neck.rotation.z = 0
    head.rotation.y = 0
    head.rotation.z = 0
    tailSway.rotation.set(0, 0, 0)

    root.updateMatrixWorld(true)
    _inv.copy(root.matrixWorld).invert()
    let lowest = Infinity
    for (const t of tubes) {
      const bb = t.geo.boundingBox
      if (!bb) continue
      _rel.multiplyMatrices(_inv, t.mesh.matrixWorld)
      _tmpBox.copy(bb).applyMatrix4(_rel)
      if (_tmpBox.min.y < lowest) lowest = _tmpBox.min.y
    }
    if (!Number.isFinite(lowest)) return
    pelvis.position.y -= lowest
    base.pelvisY = pelvis.position.y
    // The limbs' recorded attach heights moved down with the body. update
    // measures the leg swing against them, so leaving them at their pre-settle
    // values would fold every leg by exactly the settle correction on the very
    // first frame.
    for (const l of limbs) l.hipY -= lowest
  }

  function setSurface(s: Surface, p: Palette): void {
    currentSurface = s
    currentPalette = p
    for (const t of tubes) t.setSurface(s)
    repaint(false)
  }

  function update(dt: number, clock: number, motion: number, drive: PoseDrive): void {
    if (fade < 1) {
      fade = Math.min(1, fade + dt / 0.9)
      for (const t of tubes) t.applyColors(colorFrom.get(t)!, colorTo.get(t)!, fade)
    }

    const settled = clamp(drive.settle, 0, 1)
    const tuck = clamp(drive.tuck, 0, 1)
    const asleep = clamp(drive.sleep, 0, 1)

    // The breath runs on its own accumulated clock so sleep can slow it without
    // slowing anything else: `clock` is also what the sway, the trait grow-ins
    // and the camera drift are timed off, and a sleeping creature whose newly
    // grown horn takes twice as long to appear would be a bug caused by a mood.
    // Fed the DIFFERENCE in clock rather than dt, so it still inherits the time
    // warp view.ts puts on for a reduced-motion preference.
    const step = clock - lastClock
    lastClock = clock
    if (step > 0 && step < 1) breathClock += step * lerp(1, 0.44, asleep)

    // Breathing is a scale on the torso, never a geometry rewrite, so it costs
    // nothing and everything hanging off the torso breathes with it. The pelvis
    // is only ever moved, never squashed: a non uniform scale there shears the
    // legs, which are rotated hard away from its axes.
    //
    // The sleeping term is added rather than multiplied into `amp`, which is
    // the one place in this file that deliberately ignores how much motion the
    // caller asked for. A reduced-motion preference can damp the sway to
    // nothing and should, but a creature with no visible breath does not read
    // as asleep, it reads as dead, and that is not an accessible outcome.
    const breath = Math.sin(breathClock * 1.15) * 0.5 + 0.5
    const amp = motion
    const swell = 1 + breath * (0.035 * amp + 0.045 * asleep) + drive.lift * 0.03
    torso.scale.set(swell, swell * 0.98, 1)

    // Standing height and lying height are two bases, crossfaded. The bob rides
    // on top of whichever it is between, damped as it goes down: a belly on the
    // ground does not rise and fall the way a ribcage on four legs does.
    const standY = base.pelvisY * (1 - drive.crouch * 0.2)
    const bob = Math.sin(breathClock * 1.15 + 0.6) * 0.012 * amp
    pelvis.position.y = lerp(standY, base.lieY, settled) + bob * (1 - settled * 0.55)
    pelvis.position.x = drive.lean * base.bodyRx * 0.16
    pelvis.rotation.x = base.pelvisPitch + drive.crouch * 0.12 + settled * 0.05
    pelvis.rotation.y = drive.turn * 0.5 + Math.sin(clock * 0.31) * 0.05 * amp
    pelvis.rotation.z = drive.lean * 0.12

    torso.rotation.x = base.torsoPitch - drive.lift * 0.1 - drive.reach * 0.06
    torso.rotation.z = Math.sin(clock * 0.43) * 0.03 * amp + drive.lean * 0.16

    // reach pitches the neck out and down and takes the same amount back out of
    // the head, so the head travels forward and stays level. Lengthening the
    // neck instead would mean rewriting its geometry every frame, and a neck
    // that grows when the animal is interested is a different animal.
    //
    // A neck can only dip as far as it has room for, and how much room it has
    // depends on the pose the rest of the animal is holding. The same pitch
    // that reads as a nose on the ground while it is standing puts a long
    // necked creature's jaw through the plinth once it has lain down, because
    // lying down took most of a leg length out of the height its neck starts
    // from. Measured off the pelvis as it is THIS frame rather than off the
    // standing height, so it tightens as the animal goes down.
    const neckRoom = pelvis.position.y + base.bodyRy * 0.42 - base.headDrop
    const maxDip = Math.asin(clamp(neckRoom / Math.max(0.06, base.neckLen), 0, 1))
    neck.rotation.x = Math.min(
      base.neckPitch + drive.headDip * 0.62 - drive.lift * 0.42 + drive.reach * 0.3 + tuck * 0.42,
      maxDip,
    )
    neck.rotation.y =
      Math.sin(clock * 0.37 + 1.1) * 0.07 * amp +
      drive.turn * 0.35 +
      drive.headTurn * 0.34 +
      tuck * CURL_SIDE * 0.5
    neck.rotation.z = drive.lean * 0.14
    head.rotation.x =
      base.headPitch +
      drive.headDip * 0.34 -
      drive.lift * 0.2 -
      drive.reach * 0.3 +
      tuck * 0.2 +
      Math.sin(clock * 0.79) * 0.03 * amp
    head.rotation.y = drive.headTurn * 0.52 + tuck * CURL_SIDE * 0.42
    head.rotation.z = Math.sin(clock * 0.53 + 2.2) * 0.045 * amp + drive.headTilt * 0.6

    // The tail comes round the same way the nose does, which is the whole read
    // of a curled animal: the two ends meet. Its aim node points it down and
    // back, so settling has to lift it toward level or it saws into the plinth.
    tailSway.rotation.y =
      Math.sin(clock * 0.61) * 0.16 * amp +
      Math.sin(clock * 3.4) * 0.22 * drive.tailFlick -
      tuck * CURL_SIDE * 0.85
    tailSway.rotation.x = base.tailPitch + Math.sin(clock * 0.47 + 0.8) * 0.06 * amp - settled * 0.18

    // Legs. One bone each, so nothing here can bend a knee: the only way to
    // lose height without driving a foot through the plinth is to put the foot
    // further out, which is a swing about the limb frame's own X. The angle is
    // not a number anybody chose, it is the one that leaves the foot at the
    // height it was standing at, so a short legged creature folds almost
    // nothing when it lies down and a long legged one folds itself nearly flat.
    // The fore pair swing forward and the hind pair back, which is the shape a
    // dog makes lying down and the only lying shape this rig can hold honestly.
    //
    // Measured rather than guessed because guessing was tried: fixed fold
    // angles put the feet up to a fifth of a body height under the plinth on a
    // long legged creature, and a held pose does that for hours rather than for
    // the second a reaction lasts.
    for (const l of limbs) {
      // Where this limb hangs from THIS frame, in root space, composed by hand
      // rather than read off matrixWorld because the root carries the growth
      // scale and this has to be in root units. It cannot be the height
      // setMorphs recorded: the pelvis pitches, the torso pitches on top of
      // that, and a fore limb sits a body length forward of both, so seven
      // degrees of pitch drops its shoulder further than the crouch did.
      _p.copy(l.node.position)
      if (l.fore) _p.multiply(torso.scale).applyEuler(torso.rotation).add(torso.position)
      _p.applyEuler(pelvis.rotation).add(pelvis.position)
      // How much of the leg's vertical span is left to spend, as a cosine. The
      // target is the height the foot STANDS at, not the plinth: a leg clamped
      // short by a low limbLength never reached the plinth in the first place,
      // and aiming at the floor would fold those legs on a creature that is
      // doing nothing.
      const swing = Math.acos(clamp(1 - (l.hipY - _p.y) / Math.max(0.05, l.span), 0, 1))
      const way = l.fore ? -1 : 1
      l.fold.rotation.x = way * swing
      // The sole keeps the angle to the ground it had while standing. Two
      // rotations about the same axis, so they cancel exactly, and that is why
      // there is nothing on the fold's other two axes: a yaw in between stops
      // them cancelling and the foot comes out pointing down through the floor,
      // which is measured, not feared.
      l.footNode.rotation.x = base.footRot - way * swing
    }

    // The eyelid, such as there is one. orientY builds the eye socket with its
    // local X running down the side of the head, so squashing X turns the ball
    // into a horizontal slit and takes the pupil with it, whatever eye allele
    // happens to be attached. Y comes in a little as well so the shut eye sits
    // back against the head rather than standing off it as a fin.
    for (const e of sockets.eye) {
      e.scale.set(eyeBase * lerp(1, 0.1, asleep), eyeBase * lerp(1, 0.72, asleep), eyeBase * lerp(1, 1.06, asleep))
    }
  }

  function bounds(target: THREE.Box3): THREE.Box3 {
    return target.setFromObject(root)
  }

  function dispose(): void {
    for (const t of tubes) t.dispose()
    colorFrom.clear()
    colorTo.clear()
  }

  return { root, sockets, setMorphs, setSurface, update, bounds, dispose }
}

// ---------------------------------------------------------------------------
// The egg
// ---------------------------------------------------------------------------

// Stage zero is the first thing anybody ever sees of a group's creature, often
// before they have done anything at all, so it has to hold the screen on its
// own. It is the same tube primitive, a nest to sit in so it is a composition
// rather than a floating object, and a light inside it that comes up as the
// group gets closer to hatching.
// An egg sleeps too, and it has to, because the sleep gate is stage free: a
// group can open the app on their second evening and find an egg that will not
// take an action. Something on screen has to be different, or that is
// indistinguishable from an app that has stopped working.
export interface Egg {
  root: THREE.Group
  setProgress(p: number): void
  update(dt: number, clock: number, motion: number, sleep: number): void
  bounds(target: THREE.Box3): THREE.Box3
  dispose(): void
}

export function buildEgg(materials: MaterialKit, palette: Palette, rand: () => number): Egg {
  const root = new THREE.Group()
  root.name = 'egg'
  const shellNode = new THREE.Group()
  root.add(shellNode)

  // The shell's own surface, not a hide. An egg is banded because eggs are,
  // and it must not change when a hide allele expresses after hatching.
  const surface: Surface = { pattern: 'banded', roughness: 0.5, metalness: 0.04, relief: 0.012, sheen: 0, wash: 0 }
  const tube = new Tube(15, 16, materials.shell, surface)
  tube.mesh.rotation.x = -Math.PI / 2
  shellNode.add(tube.mesh)

  const H = 0.86
  const W = 0.35
  // An ovoid, not a teardrop. The obvious profile (a sine raised to a power)
  // draws the top out into a cone and the whole thing reads as an onion. A
  // circle profile leaned toward the base keeps the crown round, which is what
  // makes an egg look like an egg.
  const eggR = (u: number) => {
    const t = 2 * u - 1
    return W * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.17 * t)
  }
  tube.write((u, o) => {
    o.z = u * H
    const r = eggR(u)
    o.rx = r
    o.ry = r
  })
  shellNode.position.y = 0.015

  // Bands are painted here rather than through the hide painter, because an
  // egg's markings are not a hide pattern and should not change when the hide
  // allele expresses later.
  {
    const attr = tube.geo.attributes.color as THREE.BufferAttribute
    const dst = attr.array as Float32Array
    const pos = tube.geo.attributes.position as THREE.BufferAttribute
    const bands = 3 + Math.floor(rand() * 3)
    const phase = rand() * Math.PI
    const c = new THREE.Color()
    const faces = dst.length / 9
    for (let f = 0; f < faces; f++) {
      const o = f * 9
      // The tube runs along its own Z, which the mesh rotation stands upright.
      const y = (pos.getZ(f * 3) + pos.getZ(f * 3 + 1) + pos.getZ(f * 3 + 2)) / 3 / H
      const band = Math.sin(y * Math.PI * bands + phase) > 0.25
      c.copy(palette.base).lerp(palette.belly, THREE.MathUtils.smoothstep(y, 0.0, 0.9))
      if (band) c.lerp(palette.marking, 0.7)
      c.offsetHSL(0, 0, ((((f * 2246822519) >>> 20) / 4095) - 0.5) * 0.04)
      for (let k = 0; k < 3; k++) {
        dst[o + k * 3] = c.r
        dst[o + k * 3 + 1] = c.g
        dst[o + k * 3 + 2] = c.b
      }
    }
    attr.needsUpdate = true
  }

  // The nest: seven shards, no two the same, angled outward.
  const nestGeo = new THREE.TetrahedronGeometry(0.19, 0)
  for (let i = 0; i < 7; i++) {
    const shard = new THREE.Mesh(nestGeo, materials.keratin)
    const a = (i / 7) * Math.PI * 2 + rand() * 0.3
    shard.position.set(Math.cos(a) * 0.36, 0.05 + rand() * 0.03, Math.sin(a) * 0.36)
    shard.rotation.set(rand() * 0.8, a, 0.5 + rand() * 0.5)
    shard.scale.set(1, lerp(0.5, 1.1, rand()), 0.55)
    shard.castShadow = true
    shard.receiveShadow = true
    root.add(shard)
  }

  // The light inside. Sits low so the shell glows from the bottom up.
  const coreGeo = new THREE.IcosahedronGeometry(0.19, 0)
  const core = new THREE.Mesh(coreGeo, materials.glow)
  core.position.y = 0.3
  root.add(core)
  const coreLight = new THREE.PointLight(palette.glow.clone(), 0, 2.4, 2)
  coreLight.position.y = 0.34
  root.add(coreLight)

  // Cracks, revealed one at a time as hatching gets close. Thin slabs rather
  // than lines, because a one pixel line looks like a rendering mistake.
  const crackGeo = new THREE.BoxGeometry(0.012, 0.26, 0.012)
  const crackMat = new THREE.MeshBasicMaterial({ color: palette.background.clone() })
  const cracks: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(crackGeo, crackMat)
    const a = rand() * Math.PI * 2
    const h = 0.28 + rand() * 0.38
    const s = Math.sin(Math.PI * Math.pow(h / H, 0.82)) * W * lerp(1.08, 0.9, h / H)
    m.position.set(Math.cos(a) * s * 0.99, h, Math.sin(a) * s * 0.99)
    m.rotation.set(rand() * 0.5 - 0.25, -a, rand() * 0.7 - 0.35)
    m.scale.setScalar(0)
    cracks.push(m)
    shellNode.add(m)
  }

  let progress = 0
  let shown = 0
  let lastClock = 0
  let slowClock = 0
  let spin = 0

  function setProgress(p: number): void {
    progress = THREE.MathUtils.clamp(p, 0, 1)
  }

  function update(dt: number, clock: number, motion: number, sleep: number): void {
    shown += (progress - shown) * Math.min(1, dt * 2.4)
    const asleep = clamp(sleep, 0, 1)
    // Same trick as the body's breath: a second clock, fed the change in the
    // first, so sleep slows everything the egg does without slowing the tween
    // that reveals the cracks or the camera drift outside.
    const step = clock - lastClock
    lastClock = clock
    if (step > 0 && step < 1) slowClock += step * lerp(1, 0.4, asleep)

    // The rock is the egg's version of being awake, so it is what goes away.
    // The swell is the egg's version of breathing, so it stays and deepens: an
    // egg that has stopped moving entirely is an egg that has stopped.
    const amp = motion * lerp(1, 0.18, asleep)
    const breath = Math.sin(slowClock * 0.9) * 0.5 + 0.5
    const swell = 1 + breath * ((0.014 + 0.03 * shown) * amp + 0.02 * asleep)
    shellNode.scale.set(swell, 1 + breath * (0.02 * amp + 0.012 * asleep), swell)
    // A rock that gets more insistent the closer it is to hatching.
    shellNode.rotation.z = Math.sin(slowClock * (0.7 + shown * 1.9)) * (0.012 + shown * 0.055) * amp
    shellNode.rotation.x = Math.sin(slowClock * (0.53 + shown * 1.4) + 1.3) * (0.008 + shown * 0.03) * amp

    // The light inside banks rather than going out. Hatching is the one thing
    // that must never look cancelled, and growth keeps accruing while it
    // sleeps, so the glow that says how close it is has to stay readable.
    const dim = lerp(1, 0.45, asleep)
    const pulse = 0.55 + 0.45 * Math.sin(slowClock * (1.1 + shown * 1.6))
    materials.shell.emissiveIntensity = shown * 0.5 * (0.7 + 0.3 * pulse) * dim
    coreLight.intensity = shown * 2.6 * (0.6 + 0.4 * pulse) * dim
    core.scale.setScalar(0.6 + shown * 0.55 + pulse * 0.06 * amp)
    // Accumulated, not clock times amplitude. A turn written as elapsed time
    // times a speed runs BACKWARDS whenever the speed drops, and the speed now
    // drops every time the creature goes to sleep, so the core would unwind for
    // three and a half seconds each evening.
    spin += step * 0.25 * amp
    core.rotation.y = spin
    core.rotation.x = spin * 0.68

    for (let i = 0; i < cracks.length; i++) {
      const t = THREE.MathUtils.clamp((shown - 0.45 - i * 0.11) / 0.14, 0, 1)
      cracks[i].scale.set(1, t, 1)
      cracks[i].visible = t > 0.001
    }
  }

  function bounds(target: THREE.Box3): THREE.Box3 {
    return target.setFromObject(root)
  }

  function dispose(): void {
    tube.dispose()
    nestGeo.dispose()
    coreGeo.dispose()
    crackGeo.dispose()
    crackMat.dispose()
    coreLight.dispose()
  }

  return { root, setProgress, update, bounds, dispose }
}
