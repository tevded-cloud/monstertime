// serpent.ts: the second body plan, and the reason this file exists at all.
//
// body.ts opens by saying "one body, deformed. Never a different body per
// creature." That was the right rule for one animal and it is what stopped
// every creature looking assembled from a parts bin. It is also why two groups'
// creatures came out as the same dragon in different paint: no number in a
// Morphs record can take four legs away.
//
// So the rule changes shape rather than being dropped. There is still exactly
// one body per PLAN, deformed by the same Morphs record, and the plan is rolled
// from the group's seed and fixed for life. A group's creature is still one
// animal that grows; two groups now get different animals.
//
// This is a spike, and it is honest about being one. Two plans, quadruped and
// this, in placeholder geometry, to answer one question before anybody draws a
// single asset: do two plans actually read as different animals, or does the
// shared material and morph treatment make even a snake look like a dragon?
//
// It satisfies the same Body interface as buildBody, so view.ts does not know
// which one it is holding.

import * as THREE from 'three'
import type { Morphs } from '../core/types'
import { REST_POSE, Tube, type Body, type PoseDrive, type RingOut, type Sockets } from './body'
import type { MaterialKit, Palette, Surface } from './materials'

const lerp = THREE.MathUtils.lerp
const clamp = THREE.MathUtils.clamp

/**
 * How many segments the body is made of.
 *
 * Chosen for the bend rather than the silhouette: each one is a joint, and a
 * snake needs enough of them that a curve reads as a curve rather than as an
 * elbow. Below about twelve the coil turns into a polygon.
 */
const SEGMENTS = 16

/** Which segments carry a spine socket. Spread rather than every one, so a
 *  sail tapers along the animal instead of becoming a zip. */
const SPINE_AT = [1, 3, 5, 7, 9, 11]

/** Where the vestigial wing sockets sit. A winged serpent is its own creature
 *  and the catalogue already has wing alleles, so they hang near the front
 *  third rather than being dropped on the floor. */
const WING_AT = 2

/**
 * How hard each joint turns when the animal is fully coiled, from the neck end
 * to the tail end.
 *
 * Sixteen segments is a hard ceiling on what a coil can be here. The file's own
 * opening says a curve below about twelve joints reads as an elbow, and a real
 * double coil wants sixty degrees a joint, which at this count is a fifteen
 * sided polygon with seven corners a loop. So this is one ring and a bit,
 * roughly three hundred and thirty degrees in total, and the turn TIGHTENS
 * toward the tail so the thin end spirals inside the ring rather than running
 * into its own neck. That is also what a snake actually does.
 */
const COIL_NECK = 0.28
const COIL_TAIL = 0.5

/** Which way it coils. Fixed rather than rolled for the same reason the
 *  quadruped's is: buildSerpent is handed the generator view.ts then hands to
 *  every part builder, so one more draw here re-jitters every part on every
 *  serpent that already exists. */
const CURL_SIDE = 1

/** How much of the front of the animal a head gesture reaches back into. A
 *  snake has no neck to stop at, so turning its head is really the first few
 *  joints turning, and a head that swivels on a rigid body reads as an owl. */
function frontWeight(along: number): number {
  return Math.max(0, 1 - along * 3.6)
}

interface Rig {
  girth: number
  headLen: number
  headRx: number
  headRy: number
  snoutLen: number
  segLen: number
  taper: number
  coil: number
  rear: number
  eyeScale: number
  hornScale: number
}

function deriveRig(m: Morphs): Rig {
  const bulk = m.bulk
  return {
    // The eight morphs are read again rather than reused. They were written for
    // a quadruped, so limbLength has nothing to attach to here; it becomes how
    // high the front of the animal is carried, which is the same idea (how far
    // off the ground it holds itself) expressed by the body it actually has.
    girth: lerp(0.1, 0.23, bulk),
    headLen: lerp(0.24, 0.4, m.headSize),
    headRx: lerp(0.11, 0.2, m.headSize) * lerp(0.94, 1.1, bulk),
    headRy: lerp(0.09, 0.16, m.headSize),
    snoutLen: lerp(0.08, 0.34, m.snoutLength),
    segLen: lerp(0.17, 0.29, m.neckLength),
    taper: lerp(0.42, 0.86, m.tailBase),
    coil: lerp(0.1, 0.52, m.stance),
    rear: lerp(0.04, 0.42, m.limbLength),
    eyeScale: lerp(0.66, 1.5, m.eyeSize),
    hornScale: lerp(0.78, 1.24, m.headSize),
  }
}

export function buildSerpent(
  materials: MaterialKit,
  palette: Palette,
  surface: Surface,
  rand: () => number,
): Body {
  const root = new THREE.Group()
  root.name = 'creature'

  // A kinematic chain rather than one long curved tube. Each segment hangs off
  // the one in front, so bending is a rotation instead of a rebuild, and any
  // socket parented to a segment follows the bend for free. That last part is
  // what makes the difference: a spine plate baked onto a curve would detach
  // from the body the moment the animal moved.
  const chain: THREE.Group[] = []
  const segTubes: Tube[] = []
  let parent: THREE.Object3D = root
  for (let i = 0; i < SEGMENTS; i++) {
    const node = new THREE.Group()
    node.name = `seg.${i}`
    const tube = new Tube(4, 9, materials.body, surface)
    node.add(tube.mesh)
    parent.add(node)
    parent = node
    chain.push(node)
    segTubes.push(tube)
  }

  const head = new THREE.Group()
  head.name = 'head'
  const headTube = new Tube(7, 10, materials.body, surface)
  const jawTube = new Tube(4, 7, materials.body, surface)
  head.add(headTube.mesh, jawTube.mesh)
  // On the front of the first segment, facing the way the animal is going.
  chain[0].add(head)

  const tubes = [...segTubes, headTube, jawTube]

  const mk = (owner: THREE.Object3D, name: string): THREE.Object3D => {
    const o = new THREE.Object3D()
    o.name = name
    owner.add(o)
    return o
  }

  const sockets: Sockets = {
    horn: [mk(head, 'horn.l'), mk(head, 'horn.r')],
    ear: [mk(head, 'ear.l'), mk(head, 'ear.r')],
    wing: [mk(chain[WING_AT], 'wing.l'), mk(chain[WING_AT], 'wing.r')],
    tail: [mk(chain[SEGMENTS - 1], 'tail.tip')],
    spine: SPINE_AT.map((i) => mk(chain[i], `spine.${i}`)),
    eye: [mk(head, 'eye.l'), mk(head, 'eye.r')],
  }

  let rig = deriveRig({
    bulk: 0.5,
    neckLength: 0.5,
    limbLength: 0.5,
    snoutLength: 0.5,
    headSize: 0.5,
    eyeSize: 0.5,
    tailBase: 0.5,
    stance: 0.5,
  })
  let currentSurface = surface
  let currentPalette = palette

  /** How thick the body is at segment i, 1 at the head end and tapering back. */
  function girthAt(i: number): number {
    const along = i / (SEGMENTS - 1)
    // Thickest just behind the head rather than at it, which is what stops a
    // snake reading as a worm.
    const swell = Math.sin(clamp(along * 3.4, 0, Math.PI * 0.5))
    return rig.girth * lerp(0.72, 1, swell) * lerp(1, 1 - rig.taper, along)
  }

  function writeSegments(): void {
    for (let i = 0; i < SEGMENTS; i++) {
      const r0 = girthAt(i)
      const r1 = girthAt(i + 1)
      segTubes[i].write((u: number, out: RingOut) => {
        const r = lerp(r0, r1, u)
        out.z = u * rig.segLen
        // Flattened underneath, which is how a body that lies on the ground
        // reads even before it moves.
        out.rx = r
        out.ry = r * 0.82
      })
    }

    headTube.write((u: number, out: RingOut) => {
      const taper = Math.sin(clamp((1 - u) * 2.2, 0, Math.PI * 0.5))
      out.z = u * rig.headLen
      out.rx = rig.headRx * lerp(0.55, 1, taper)
      out.ry = rig.headRy * lerp(0.5, 1, taper)
    })

    jawTube.write((u: number, out: RingOut) => {
      out.z = rig.headLen * 0.52 + u * rig.snoutLen
      out.y = -rig.headRy * 0.34
      out.rx = rig.headRx * lerp(0.72, 0.3, u)
      out.ry = rig.headRy * lerp(0.44, 0.2, u)
    })
  }

  function layout(): void {
    for (let i = 0; i < SEGMENTS; i++) {
      const along = i / (SEGMENTS - 1)
      const node = chain[i]
      if (i === 0) {
        // The whole animal sits on the plinth, front carried off the ground by
        // however much `rear` says.
        node.position.set(0, girthAt(0) * 0.9 + rig.rear, 0)
        node.rotation.set(-rig.rear * 0.9, 0, 0)
      } else {
        node.position.set(0, 0, rig.segLen)
        // A resting S, tightest at the front and opening out toward the tail.
        const turn = rig.coil * Math.sin(along * Math.PI * 2.1 + 0.6)
        node.rotation.set(rig.rear * 0.12 * (1 - along), turn, 0)
      }
    }

    head.position.set(0, girthAt(0) * 0.15, 0)
    head.rotation.set(rig.rear * 0.5, 0, 0)

    const hr = rig.headRx
    sockets.horn[0].position.set(-hr * 0.52, rig.headRy * 0.72, rig.headLen * 0.42)
    sockets.horn[1].position.set(hr * 0.52, rig.headRy * 0.72, rig.headLen * 0.42)
    sockets.ear[0].position.set(-hr * 0.78, rig.headRy * 0.3, rig.headLen * 0.3)
    sockets.ear[1].position.set(hr * 0.78, rig.headRy * 0.3, rig.headLen * 0.3)
    sockets.eye[0].position.set(-hr * 0.72, rig.headRy * 0.34, rig.headLen * 0.66)
    sockets.eye[1].position.set(hr * 0.72, rig.headRy * 0.34, rig.headLen * 0.66)
    for (const s of sockets.horn) s.scale.setScalar(rig.hornScale)
    for (const s of sockets.eye) s.scale.setScalar(rig.eyeScale)
    sockets.ear[0].rotation.set(0, -0.5, -0.35)
    sockets.ear[1].rotation.set(0, 0.5, 0.35)

    const wr = girthAt(WING_AT)
    sockets.wing[0].position.set(-wr * 0.8, wr * 0.4, rig.segLen * 0.5)
    sockets.wing[1].position.set(wr * 0.8, wr * 0.4, rig.segLen * 0.5)
    sockets.wing[0].rotation.set(0, 0, 0.5)
    sockets.wing[1].rotation.set(0, 0, -0.5)

    SPINE_AT.forEach((seg, n) => {
      const s = sockets.spine[n]
      s.position.set(0, girthAt(seg) * 0.92, rig.segLen * 0.5)
      s.scale.setScalar(lerp(1.05, 0.62, n / Math.max(1, SPINE_AT.length - 1)))
    })

    const tip = sockets.tail[0]
    tip.position.set(0, 0, rig.segLen)
    tip.scale.setScalar(lerp(0.7, 1.15, rig.taper))
  }

  // -- colour ----------------------------------------------------------------

  const colorFrom = new Map<Tube, Float32Array>()
  const colorTo = new Map<Tube, Float32Array>()
  const _inv = new THREE.Matrix4()
  const _rel = new THREE.Matrix4()
  let fade = 1
  const jitterAmount = 0.045 + rand() * 0.03

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

  // -- the Body contract -----------------------------------------------------

  function setMorphs(m: Morphs, repaintHide = true): void {
    rig = deriveRig(m)
    writeSegments()
    layout()
    if (repaintHide) repaint(false)
  }

  function setSurface(next: Surface, nextPalette: Palette): void {
    currentSurface = next
    currentPalette = nextPalette
    for (const t of tubes) t.setSurface(next)
    writeSegments()
    repaint(true)
  }

  let clockOffset = rand() * 100
  // The breath's own clock. See the body's, and the reason is the same: sleep
  // has to slow the breath without slowing the trait grow-ins or the camera.
  let lastClock = 0
  let breathClock = 0

  function update(dt: number, clock: number, motion: number, drive: PoseDrive): void {
    if (fade < 1) {
      fade = Math.min(1, fade + dt * 1.6)
      for (const t of tubes) t.applyColors(colorFrom.get(t)!, colorTo.get(t)!, fade)
    }

    const settled = clamp(drive.settle, 0, 1)
    const tuck = clamp(drive.tuck, 0, 1)
    const asleep = clamp(drive.sleep, 0, 1)

    const step = clock - lastClock
    lastClock = clock
    if (step > 0 && step < 1) breathClock += step * lerp(1, 0.44, asleep)

    const t = clock + clockOffset
    // Damped out as it goes down, because a creature already on the plinth has
    // nothing left to crouch with. Left undamped, the crouch a sleeping pose
    // carries pitched segment zero nose down, and every one of the fifteen
    // segments hanging off it inherited that pitch: the far end of a sleeping
    // serpent finished a fifth of a body length under the floor.
    const lift = (drive.lift * 0.5 - drive.crouch * 0.25) * (1 - settled)

    // A wave travelling from head to tail. This is the whole animation: a snake
    // at rest is never actually still, and the travelling phase is what stops
    // sixteen segments looking like one bent stick.
    for (let i = 1; i < SEGMENTS; i++) {
      const along = i / (SEGMENTS - 1)
      const front = frontWeight(along)
      const base = rig.coil * Math.sin(along * Math.PI * 2.1 + 0.6)
      const wave = Math.sin(t * 1.15 - along * 4.2) * 0.09 * motion
      const flick = drive.tailFlick * along * along * 0.5
      // Coiling is a different operation from bending, and the two have to be
      // crossfaded rather than added. The resting shape is an S, which is a
      // turn that ALTERNATES sign along the body; a coil is the same sign at
      // every joint. Added together, a half coiled snake is just a wavier
      // snake, and the one pose that has to read at a glance reads as nothing.
      const coil = CURL_SIDE * lerp(COIL_NECK, COIL_TAIL, along)
      // Straightening the front is how this body reaches: there is no neck to
      // put out, so it takes the bend out of the first few joints and points
      // itself at whatever it is interested in.
      const rest = (base + wave) * (1 - drive.reach * 0.7 * front)
      chain[i].rotation.y =
        lerp(rest, coil, tuck) + flick + (drive.headTurn * 0.24 + drive.lean * 0.2) * front
      // Flattened as it goes down. The resting carriage lifts the front of the
      // animal off the plinth by `rear`, and an animal asleep on the ground has
      // put all of that down.
      chain[i].rotation.x = lerp(rig.rear * 0.12 * (1 - along) + drive.crouch * -0.04 * (1 - along), 0, settled)
      // Rolled onto one side, front of the animal only. Rolling segment zero
      // would roll the entire chain hanging off it and tip the coil off the
      // ground, so the lean is spread across the joints that can afford it.
      chain[i].rotation.z = drive.lean * 0.12 * front
    }

    chain[0].position.y = girthAt(0) * 0.9 + rig.rear * (1 - settled) + lift * 0.28
    chain[0].rotation.x = -rig.rear * 0.9 * (1 - settled) - lift * 0.5
    chain[0].rotation.y = drive.turn * 0.5

    // The head rides up onto the top of the body as the coil closes, and turns
    // the same way the coil does, so it comes to rest lying ACROSS the thinner
    // loop the tail has spiralled inside it. That is where a snake actually
    // puts its head, and it is the only place this rig can put it: raising the
    // head clear of the body would leave a gap with no neck in it, because the
    // head is a rigid child of segment zero and there is no geometry between
    // them. Lifting segment zero instead is worse still, since every other
    // segment hangs off it and the whole coil would stand up.
    head.position.y = girthAt(0) * (0.15 + 0.35 * tuck)
    head.rotation.y = drive.turn * 0.6 + drive.headTurn * 0.5 + tuck * CURL_SIDE * 0.55

    // The same floor guard the quadruped's neck has, and needed for the same
    // reason: a head can only dip as far as the height it is dipping from, and
    // once this animal is flat on the plinth that height is one body thickness.
    // Unguarded, a sleeping serpent puts its jaw through the floor directly
    // under the part of it a viewer is already looking at.
    const jawReach = rig.headLen * 0.52 + rig.snoutLen + rig.headRy
    const room = Math.max(0, chain[0].position.y + head.position.y - rig.headRy * 0.5)
    const maxDip = Math.asin(clamp(room / Math.max(0.05, jawReach), 0, 1))
    head.rotation.x = Math.min(
      rig.rear * 0.5 * (1 - settled) + drive.headDip * 0.55 - lift * 0.2 + tuck * 0.3,
      maxDip,
    )
    // The head sways a beat behind the body, which is what makes it look like
    // the body is carrying it rather than the two being one rigid piece.
    head.rotation.z = Math.sin(t * 1.15 - 0.9) * 0.05 * motion + drive.headTilt * 0.7 + drive.lean * 0.3

    // The breath. A serpent has no chest to raise, so it is a swell that
    // travels down the whole animal, and it is put on each segment's MESH
    // rather than its node: the chain, the sockets and everything grown on them
    // stay exactly where they were, so this is a breath and not a growth spurt.
    // Deeper and slower asleep, with a floor that survives a reduced-motion
    // preference, for the reason the quadruped's has one.
    const deep = 0.03 * motion + 0.05 * asleep
    for (let i = 0; i < SEGMENTS; i++) {
      const along = i / (SEGMENTS - 1)
      const swell = 1 + (Math.sin(breathClock * 1.05 - along * 1.3) * 0.5 + 0.5) * deep
      segTubes[i].mesh.scale.set(swell, swell, 1)
    }

    // The eyes. The serpent's eye sockets sit unrotated on the head, so their
    // local Y is the way the eye looks: flattening it presses the pupil into
    // the ball and leaves a lidded slit lying along the side of the skull.
    const shut = lerp(1, 0.12, asleep)
    for (const s of sockets.eye) s.scale.set(rig.eyeScale, rig.eyeScale * shut, rig.eyeScale)
  }

  const _box = new THREE.Box3()

  function bounds(target: THREE.Box3): THREE.Box3 {
    root.updateMatrixWorld(true)
    target.makeEmpty()
    for (const t of tubes) {
      t.geo.computeBoundingBox()
      if (!t.geo.boundingBox) continue
      _box.copy(t.geo.boundingBox).applyMatrix4(t.mesh.matrixWorld)
      target.union(_box)
    }
    return target
  }

  function dispose(): void {
    for (const t of tubes) t.dispose()
    colorFrom.clear()
    colorTo.clear()
  }

  setMorphs(
    {
      bulk: 0.5,
      neckLength: 0.5,
      limbLength: 0.5,
      snoutLength: 0.5,
      headSize: 0.5,
      eyeSize: 0.5,
      tailBase: 0.5,
      stance: 0.5,
    },
    true,
  )
  update(0, 0, 1, REST_POSE)

  return { root, sockets, setMorphs, setSurface, update, bounds, dispose }
}
