// view.ts: the window onto the creature.
//
// Two rules run this file. The first is that setCreature is called on every
// snapshot the server sends, which is often, so it has to diff: an app that
// rebuilds the animal whenever anyone breathes both stutters and throws away
// the one thing worth watching, which is a trait arriving. The second is that
// nothing here decides what a creature looks like. Shape comes from body.ts,
// colour and light from materials.ts, and every grown piece from the registry.
// This file decides when things change and how they move while they change.

import * as THREE from 'three'
import type { ActionKind, Creature, Genome, Locus, Morphs } from '../core/types'
import { MORPHS } from '../core/types'
import {
  auraFor,
  bareSurface,
  createBackdrop,
  createGround,
  createLightRig,
  makeMaterials,
  paletteForSeed,
  seededRandom,
  surfaceFor,
  type Aura,
  type LightRig,
  type MaterialKit,
  type Palette,
  type Surface,
} from './materials'
import { buildBody, buildEgg, REST_POSE, type Body, type Egg, type PoseDrive, type Sockets } from './body'
import { builderFor } from './registry'
import { registerPlaceholderParts } from './parts'

const clamp = THREE.MathUtils.clamp
const lerp = THREE.MathUtils.lerp

// One grown trait, and the objects standing in for it. Kept as a record rather
// than read back off the scene graph so a removal can find its own meshes
// without guessing which child of which socket belongs to what.
interface Grown {
  key: string
  locus: Locus
  alleleId: string
  objects: THREE.Object3D[]
  born: number
  // Set once the grow-in has run to completion. Without it, a frame that lands
  // after the whole animation window has already passed (a backgrounded tab, a
  // slow first paint, a long stall) skips the animation and leaves the part at
  // the scale it started at, which is effectively invisible. The trait is then
  // grown, credited, named in the UI, and not on the creature.
  grownIn: boolean
  // Clock time the removal started, or -1 while it is alive. A trait that
  // stops expressing shrinks away instead of blinking out.
  dying: number
}

function emptyMorphs(): Morphs {
  const m = {} as Morphs
  for (const k of MORPHS) m[k] = 0.5
  return m
}

// A phone is fill-rate bound before it is anything else, and it throttles once
// it gets warm. This scene runs a shadow pass and antialiasing over a full
// bleed canvas, and the creature is meant to be watched for minutes at a time,
// so the target is a frame rate a warm phone can hold rather than the best
// first frame. Capping at 1.5 instead of 2 is 44 percent fewer fragments at the
// same canvas size: a 390 by 844 phone goes from 1.32 to 0.74 megapixels.
// Desktop keeps 2, where there is no thermal envelope worth defending.
// (visual.rendering-performance-optimization, mobile row.)
function pixelRatioCap(): number {
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  return Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
}

// Overshoots slightly and settles. A trait that eases in without overshooting
// reads as a fade, and a fade reads as a loading state rather than as growth.
function easeOutBack(t: number): number {
  const c = 1.9
  const p = t - 1
  return 1 + (c + 1) * p * p * p + c * p * p
}

// Rises fast, falls slow. Every reaction uses it, so all six read as the same
// animal responding rather than as six different animations.
function envelope(t: number): number {
  if (t <= 0 || t >= 1) return 0
  return Math.sin(Math.PI * Math.pow(t, 0.62))
}

type MeshLike = { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }

// Frees a subtree. Materials belonging to the shared kit are left alone: they
// outlive any one part, and disposing one would take the hide off the animal.
function release(obj: THREE.Object3D, keep: Set<THREE.Material>): void {
  obj.traverse((o) => {
    const m = o as unknown as MeshLike
    if (m.geometry) m.geometry.dispose()
    const mat = m.material
    if (Array.isArray(mat)) {
      for (const x of mat) if (!keep.has(x)) x.dispose()
    } else if (mat && !keep.has(mat)) {
      mat.dispose()
    }
  })
}

export class CreatureView {
  private readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60)
  private readonly stage = new THREE.Group()

  private rig: LightRig | null = null
  private backdrop: THREE.Mesh | null = null
  private ground: THREE.Mesh | null = null

  private seed: string | null = null
  private palette: Palette | null = null
  private materials: MaterialKit | null = null
  private surface: Surface = bareSurface()
  private rand: () => number = Math.random

  private body: Body | null = null
  private egg: Egg | null = null
  private grown = new Map<string, Grown>()

  private auraNode: THREE.Object3D | null = null
  // Two fields for one thing, deliberately. auraKind drives the animation and
  // the light rig, which genuinely care only about the kind. The rebuild has to
  // key on the allele instead: several alleles share a kind, so comparing kinds
  // meant a creature moving between two of them kept the old node forever.
  private auraAllele: string | null = null
  private auraKind: Aura = 'none'
  private auraMotes: THREE.Points | null = null
  private auraShell: THREE.Mesh | null = null
  private auraRings: THREE.Mesh[] = []
  private moteBase: Float32Array | null = null

  private morphFrom: Morphs = emptyMorphs()
  private morphTo: Morphs = emptyMorphs()
  private morphNow: Morphs = emptyMorphs()
  private morphT = 1

  private growth = 0
  private growthTarget = 0

  // The shared kit's materials, so a per frame teardown pass never allocates a
  // set just to answer "is this one of ours".
  private keep = new Set<THREE.Material>()

  private clock = 0
  private lastFrame = 0
  private motion = 1
  private reduced = false

  private pulseKind: ActionKind | null = null
  private pulseT = 1
  private flash = 0
  private readonly drive: PoseDrive = { ...REST_POSE }

  private ripple: THREE.Mesh | null = null
  private gift: THREE.Mesh | null = null

  private rimBase = 1.5
  private camDist = 4
  private camDistTarget = 4
  private camHeight = 0.6
  private camHeightTarget = 0.6
  private readonly box = new THREE.Box3()
  private readonly sphere = new THREE.Sphere()

  private observer: ResizeObserver | null = null
  private media: MediaQueryList | null = null
  private readonly onMedia = () => this.readMotionPreference()
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    registerPlaceholderParts()

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
    } catch (err) {
      // A machine without WebGL should get a dark panel, not a blank app. Every
      // method below no-ops from here.
      console.warn('[forge] no WebGL context, the creature will not render', err)
      this.renderer = null
      return
    }

    this.renderer.setPixelRatio(pixelRatioCap())
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // Neutral rather than ACES: the palette is chosen in sRGB and ACES pulls the
    // saturation out of exactly the mid tones the creature is made of.
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 1.28
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera.position.set(2.6, 1.5, 3.4)
    this.scene.add(this.stage)

    this.readMotionPreference()
    if (typeof window.matchMedia === 'function') {
      this.media = window.matchMedia('(prefers-reduced-motion: reduce)')
      this.media.addEventListener('change', this.onMedia)
    }
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.resize())
      this.observer.observe(canvas)
    }
    this.resize()

    this.lastFrame = performance.now()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  // -------------------------------------------------------------------------
  // Public surface
  // -------------------------------------------------------------------------

  setCreature(creature: Creature, genome: Genome): void {
    if (!this.renderer || this.disposed) return

    if (genome.seed !== this.seed) this.rebuildWorld(genome.seed)
    const materials = this.materials
    const palette = this.palette
    if (!materials || !palette) return

    this.growthTarget = clamp(creature.stage / 4, 0, 1)

    if (creature.stage <= 0) {
      this.showEgg(materials, palette)
      this.egg?.setProgress(creature.stageProgress)
      return
    }

    const hatching = this.showBody(materials, palette)

    // Morphs drift continuously, so they are always a tween, never a set.
    let moved = false
    for (const k of MORPHS) {
      if (Math.abs(creature.morphs[k] - this.morphTo[k]) > 0.001) moved = true
    }
    if (moved || hatching) {
      for (const k of MORPHS) {
        this.morphFrom[k] = hatching ? creature.morphs[k] : this.morphNow[k]
        this.morphTo[k] = creature.morphs[k]
      }
      this.morphT = hatching ? 1 : 0
      if (hatching) {
        for (const k of MORPHS) this.morphNow[k] = creature.morphs[k]
        this.body?.setMorphs(this.morphNow, true)
      }
    }

    this.syncTraits(creature, materials, palette)
  }

  pulse(kind: ActionKind): void {
    if (!this.renderer || this.disposed) return
    this.pulseKind = kind
    this.pulseT = 0
    this.flash = 1
    if (kind === 'sing') this.armRipple()
    if (kind === 'give') this.armGift()
  }

  resize(): void {
    const r = this.renderer
    if (!r || this.disposed) return
    const w = Math.max(1, this.canvas.clientWidth || this.canvas.width)
    const h = Math.max(1, this.canvas.clientHeight || this.canvas.height)
    r.setPixelRatio(pixelRatioCap())
    // updateStyle false: the page owns the canvas box, this only owns the
    // drawing buffer inside it.
    r.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.frameCamera(true)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    this.observer?.disconnect()
    this.observer = null
    this.media?.removeEventListener('change', this.onMedia)
    this.media = null

    const keep = this.keep
    for (const g of this.grown.values()) {
      for (const o of g.objects) {
        o.removeFromParent()
        release(o, keep)
      }
    }
    this.grown.clear()
    this.clearAura(keep)

    this.body?.dispose()
    this.body = null
    this.egg?.dispose()
    this.egg = null

    if (this.ripple) {
      this.ripple.removeFromParent()
      release(this.ripple, keep)
      this.ripple = null
    }
    if (this.gift) {
      this.gift.removeFromParent()
      release(this.gift, keep)
      this.gift = null
    }

    if (this.backdrop) {
      release(this.backdrop, new Set())
      this.backdrop.removeFromParent()
      this.backdrop = null
    }
    if (this.ground) {
      this.ground.geometry.dispose()
      this.ground.removeFromParent()
      this.ground = null
    }
    this.rig?.dispose()
    this.rig = null
    this.materials?.dispose()
    this.materials = null

    this.scene.clear()

    if (this.renderer) {
      this.renderer.setAnimationLoop(null)
      this.renderer.dispose()
      this.renderer.forceContextLoss()
      this.renderer = null
    }
  }

  // -------------------------------------------------------------------------
  // World
  // -------------------------------------------------------------------------

  // A new seed is a different group's creature. Nothing survives it, because
  // the palette, the materials and every part were all derived from the old one.
  private rebuildWorld(seed: string): void {
    const keep = this.keep
    for (const g of this.grown.values()) {
      for (const o of g.objects) {
        o.removeFromParent()
        release(o, keep)
      }
    }
    this.grown.clear()
    this.clearAura(keep)
    this.body?.dispose()
    this.body?.root.removeFromParent()
    this.body = null
    this.egg?.dispose()
    this.egg?.root.removeFromParent()
    this.egg = null

    if (this.backdrop) {
      release(this.backdrop, new Set())
      this.backdrop.removeFromParent()
    }
    if (this.ground) {
      this.ground.geometry.dispose()
      this.ground.removeFromParent()
    }
    this.rig?.dispose()
    this.rig?.group.removeFromParent()
    this.materials?.dispose()

    this.seed = seed
    this.rand = seededRandom('forge:' + seed)
    this.palette = paletteForSeed(seed)
    this.surface = bareSurface()
    const kit = makeMaterials(this.palette, this.surface)
    this.materials = kit
    this.keep = new Set<THREE.Material>([
      kit.body,
      kit.flesh,
      kit.keratin,
      kit.membrane,
      kit.chitin,
      kit.glow,
      kit.eye,
      kit.pupil,
      kit.ground,
      kit.shell,
    ])

    this.backdrop = createBackdrop(this.palette)
    this.ground = createGround(kit)
    this.rig = createLightRig(this.palette)
    this.rimBase = this.rig.rim.intensity
    this.scene.add(this.backdrop, this.ground, this.rig.group)
    this.scene.fog = new THREE.FogExp2(this.palette.background.getHex(), 0.035)
  }

  private showEgg(materials: MaterialKit, palette: Palette): void {
    if (this.body) {
      // Parts live on the body's sockets, so they go with it. Clearing the
      // records too keeps the diff honest instead of leaving it holding
      // references to meshes that no longer exist.
      for (const g of this.grown.values()) {
        for (const o of g.objects) {
          o.removeFromParent()
          release(o, this.keep)
        }
      }
      this.grown.clear()
      this.body.root.removeFromParent()
      this.body.dispose()
      this.body = null
    }
    if (!this.egg) {
      this.egg = buildEgg(materials, palette, this.rand)
      this.stage.add(this.egg.root)
      this.growth = 0
      this.frameCamera(true)
    }
  }

  // Returns true when the body has just appeared, which is the moment the
  // caller must not tween anything: there is no previous shape to tween from.
  private showBody(materials: MaterialKit, palette: Palette): boolean {
    if (this.egg) {
      this.egg.root.removeFromParent()
      this.egg.dispose()
      this.egg = null
    }
    if (this.body) return false
    this.body = buildBody(materials, palette, this.surface, this.rand)
    this.stage.add(this.body.root)
    this.body.setMorphs(this.morphNow, true)
    this.flash = 1
    this.frameCamera(true)
    return true
  }

  // -------------------------------------------------------------------------
  // Traits
  // -------------------------------------------------------------------------

  private syncTraits(creature: Creature, materials: MaterialKit, palette: Palette): void {
    const body = this.body
    if (!body) return

    const wanted = new Map<string, { locus: Locus; alleleId: string }>()
    let hide: string | null = null
    let aura: string | null = null
    for (const t of creature.traits) {
      if (t.locus === 'hide') {
        hide = t.allele
        continue
      }
      if (t.locus === 'aura') {
        aura = t.allele
        continue
      }
      wanted.set(`${t.locus}:${t.allele}`, { locus: t.locus, alleleId: t.allele })
    }

    // Hide: a material and colour change, not a mesh. Crossfaded by the body.
    const nextSurface = surfaceFor(hide)
    if (nextSurface !== this.surface) {
      this.surface = nextSurface
      materials.body.roughness = nextSurface.roughness
      materials.body.metalness = nextSurface.metalness
      materials.body.emissiveIntensity = nextSurface.sheen
      materials.flesh.roughness = nextSurface.roughness
      materials.flesh.metalness = nextSurface.metalness
      body.setSurface(nextSurface, palette)
      this.flash = 1
    }

    // Aura: one object at the creature root, rebuilt only when the allele moves.
    const nextAura = auraFor(aura)
    if (aura !== this.auraAllele) {
      this.clearAura(this.keep)
      this.auraAllele = aura
      this.auraKind = nextAura
      if (aura) {
        const node = builderFor(aura)({
          alleleId: aura,
          locus: 'aura',
          palette,
          materials,
          side: 0,
          index: 0,
          count: 1,
          growth: this.growth,
          rand: this.rand,
        })
        this.auraNode = node
        this.stage.add(node)
        node.traverse((o) => {
          if (o.name === 'aura.motes' && (o as THREE.Points).isPoints) this.auraMotes = o as THREE.Points
          else if (o.name === 'aura.shell') this.auraShell = o as THREE.Mesh
          else if (o.name === 'aura.ring') this.auraRings.push(o as THREE.Mesh)
        })
        if (this.auraMotes) {
          const attr = this.auraMotes.geometry.attributes.position as THREE.BufferAttribute
          this.moteBase = new Float32Array(attr.array as Float32Array)
        }
        this.flash = 1
      }
    }

    // Sockets. One instance per socket, so a horn allele grows two horns and a
    // spine allele grows a whole run without any builder knowing that.
    for (const [key, want] of wanted) {
      const existing = this.grown.get(key)
      if (existing) {
        existing.dying = -1
        continue
      }
      this.attach(key, want.locus, want.alleleId, body.sockets, materials, palette)
    }
    for (const [key, g] of this.grown) {
      if (!wanted.has(key) && g.dying < 0) g.dying = this.clock
    }
  }

  private attach(
    key: string,
    locus: Locus,
    alleleId: string,
    sockets: Sockets,
    materials: MaterialKit,
    palette: Palette,
  ): void {
    const anchors = socketsFor(sockets, locus)
    if (anchors.length === 0) return
    const build = builderFor(alleleId)
    const objects: THREE.Object3D[] = []
    for (let i = 0; i < anchors.length; i++) {
      const side = anchors.length === 2 ? (i === 0 ? -1 : 1) : 0
      const obj = build({
        alleleId,
        locus,
        palette,
        materials,
        side,
        index: i,
        count: anchors.length,
        growth: this.growth,
        rand: this.rand,
      })
      obj.scale.setScalar(0.0001)
      anchors[i].add(obj)
      objects.push(obj)
    }
    this.grown.set(key, { key, locus, alleleId, objects, born: this.clock, grownIn: false, dying: -1 })
    this.flash = 1
  }

  private clearAura(keep: Set<THREE.Material>): void {
    if (this.auraNode) {
      this.auraNode.removeFromParent()
      release(this.auraNode, keep)
    }
    this.auraNode = null
    this.auraMotes = null
    this.auraShell = null
    this.auraRings = []
    this.moteBase = null
    this.auraAllele = null
    this.auraKind = 'none'
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  private readMotionPreference(): void {
    this.reduced =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Damped rather than stopped. A creature frozen solid reads as broken, and
    // the point of the idle is that somebody else's pet is alive on your screen.
    this.motion = this.reduced ? 0.25 : 1
  }

  private frame(): void {
    const r = this.renderer
    if (!r || this.disposed) return
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    this.clock += dt * this.motionRate()

    this.stepMorphs(dt)
    this.stepGrowth(dt)
    this.stepPulse(dt)
    this.stepTraits()
    this.stepAura(dt)
    this.stepCamera(dt)

    this.body?.update(dt, this.clock, this.motion, this.drive)
    this.egg?.update(dt, this.clock, this.motion)

    this.flash = Math.max(0, this.flash - dt / 0.7)
    if (this.rig) {
      const base = this.auraLightBase()
      this.rig.accent.intensity = base + this.flash * 2.2
      // A quiet-room hush is the only thing in the game that takes light away.
      this.rig.rim.intensity = this.auraKind === 'hush' ? this.rimBase * 0.36 : this.rimBase
    }

    r.render(this.scene, this.camera)
  }

  private motionRate(): number {
    return this.reduced ? 0.55 : 1
  }

  private stepMorphs(dt: number): void {
    if (this.morphT >= 1 || !this.body) return
    const was = this.morphT
    this.morphT = Math.min(1, this.morphT + dt / 1.1)
    const t = THREE.MathUtils.smootherstep(this.morphT, 0, 1)
    for (const k of MORPHS) this.morphNow[k] = lerp(this.morphFrom[k], this.morphTo[k], t)
    // The hide is repainted once, on the last frame of the drift.
    this.body.setMorphs(this.morphNow, this.morphT >= 1 && was < 1)
  }

  private stepGrowth(dt: number): void {
    if (Math.abs(this.growth - this.growthTarget) < 0.0005) {
      this.growth = this.growthTarget
    } else {
      this.growth += (this.growthTarget - this.growth) * Math.min(1, dt * 1.6)
    }
    // A hatchling is small and an adult fills the plinth. Scaling the root
    // rather than the rig keeps the feet on the ground for free.
    const s = lerp(0.52, 1, this.growth)
    if (this.body) this.body.root.scale.setScalar(s)
    if (this.auraNode) this.auraNode.scale.setScalar(lerp(0.6, 1, this.growth))
    // The plinth grows with the animal, so the composition holds from egg to
    // adult instead of an egg sitting alone in the middle of a car park.
    if (this.ground) this.ground.scale.setScalar(lerp(0.5, 1, this.growth))
  }

  private stepTraits(): void {
    const keep = this.keep
    for (const [key, g] of this.grown) {
      if (g.dying >= 0) {
        const t = clamp((this.clock - g.dying) / 0.45, 0, 1)
        const s = 1 - THREE.MathUtils.smootherstep(t, 0, 1)
        for (const o of g.objects) o.scale.setScalar(Math.max(0.0001, s))
        if (t >= 1) {
          for (const o of g.objects) {
            o.removeFromParent()
            release(o, keep)
          }
          this.grown.delete(key)
        }
        continue
      }
      if (g.grownIn) continue
      const age = (this.clock - g.born) / 0.95
      const s = easeOutBack(clamp(age, 0, 1))
      for (const o of g.objects) o.scale.setScalar(Math.max(0.0001, s))
      if (age >= 1) g.grownIn = true
    }
  }

  // -------------------------------------------------------------------------
  // Reactions
  // -------------------------------------------------------------------------

  private stepPulse(dt: number): void {
    const d = this.drive
    if (this.pulseT >= 1 || !this.pulseKind) {
      d.headDip = 0
      d.crouch = 0
      d.turn = 0
      d.tailFlick = 0
      d.lift = 0
      this.hideTransients()
      return
    }
    this.pulseT = Math.min(1, this.pulseT + dt / (this.reduced ? 0.75 : 1.25))
    const t = this.pulseT
    const e = envelope(t)

    d.headDip = 0
    d.crouch = 0
    d.turn = 0
    d.tailFlick = 0
    d.lift = 0

    switch (this.pulseKind) {
      case 'feed':
        // Head down to the food, then back up, chewing on the way.
        d.headDip = e
        d.tailFlick = e * 0.3
        break
      case 'train':
        // Load, then release. The tail goes with the effort.
        d.crouch = e
        d.tailFlick = e
        break
      case 'explore':
        // Looks away, then back. The only reaction that turns the whole body.
        d.turn = Math.sin(t * Math.PI * 2) * e
        d.tailFlick = e * 0.7
        break
      case 'sing':
        d.lift = e
        this.stepRipple(t)
        break
      case 'give':
        d.lift = e * 0.35
        d.headDip = e * 0.4
        this.stepGift(t)
        break
      case 'tend':
        // No movement worth the name. The change is all in the light.
        d.lift = e * 0.25
        break
    }
  }

  private ensureRipple(): THREE.Mesh {
    if (!this.ripple) {
      const geo = new THREE.TorusGeometry(0.3, 0.012, 3, 28)
      const mat = new THREE.MeshBasicMaterial({
        color: this.palette ? this.palette.glow.clone() : new THREE.Color(0xffffff),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      this.ripple = new THREE.Mesh(geo, mat)
      this.ripple.visible = false
      this.stage.add(this.ripple)
    }
    return this.ripple
  }

  private ensureGift(): THREE.Mesh {
    if (!this.gift) {
      const geo = new THREE.TetrahedronGeometry(0.11, 0)
      const mat = new THREE.MeshBasicMaterial({
        color: this.palette ? this.palette.glow.clone() : new THREE.Color(0xffffff),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
      this.gift = new THREE.Mesh(geo, mat)
      this.gift.visible = false
      this.stage.add(this.gift)
    }
    return this.gift
  }

  private armRipple(): void {
    const m = this.ensureRipple()
    m.visible = true
  }

  private armGift(): void {
    const m = this.ensureGift()
    m.visible = true
  }

  private stepRipple(t: number): void {
    const m = this.ripple
    if (!m) return
    const head = this.headHeight()
    m.position.set(0, head, 0.2)
    m.rotation.set(Math.PI / 2 + 0.35, 0, 0)
    const s = 0.4 + t * 2.4
    m.scale.setScalar(s)
    ;(m.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8
  }

  private stepGift(t: number): void {
    const m = this.gift
    if (!m) return
    const head = this.headHeight()
    // Comes down from above and is taken, rather than appearing on the animal.
    m.position.set(0, lerp(head + 1.1, head + 0.1, THREE.MathUtils.smootherstep(t, 0, 0.65)), 0.35)
    m.rotation.set(t * 4, t * 3, 0)
    m.scale.setScalar(lerp(1, 0.1, clamp((t - 0.6) / 0.4, 0, 1)))
    ;(m.material as THREE.MeshBasicMaterial).opacity = t < 0.8 ? 0.95 : (1 - t) * 4.75
  }

  private hideTransients(): void {
    if (this.ripple?.visible) this.ripple.visible = false
    if (this.gift?.visible) this.gift.visible = false
  }

  private headHeight(): number {
    return this.sphere.radius > 0 ? this.box.max.y * 0.92 : 1
  }

  // -------------------------------------------------------------------------
  // Aura
  // -------------------------------------------------------------------------

  private auraLightBase(): number {
    switch (this.auraKind) {
      case 'none':
        return 0
      case 'hush':
        return 0
      case 'emberfall':
        return 1.5 + Math.sin(this.clock * 1.6) * 0.35
      case 'hum':
        return 1.1 + Math.sin(this.clock * 2.4) * 0.7
      case 'stormflick':
        return 0.5 + (Math.sin(this.clock * 17) > 0.7 ? 1.8 : 0)
      case 'held':
        return 0.9 + Math.pow(Math.max(0, Math.sin(this.clock * 0.7)), 6) * 1.6
      default:
        return 0.7
    }
  }

  private stepAura(dt: number): void {
    const node = this.auraNode
    if (!node) return
    const t = this.clock
    const amp = this.motion

    switch (this.auraKind) {
      case 'motes':
        node.rotation.y = t * 0.08 * amp
        node.position.y = Math.sin(t * 0.4) * 0.03 * amp
        break
      case 'emberfall':
        this.driftMotes(dt * 0.22 * amp, 1.5)
        node.rotation.y = t * 0.05 * amp
        if (this.auraShell) this.setOpacity(this.auraShell, 0.022 + Math.sin(t * 1.4) * 0.008)
        break
      case 'stormflick': {
        node.rotation.y = t * 0.5 * amp
        const snap = Math.sin(t * 11) > 0.86 ? 1 : 0
        if (this.auraMotes) this.setOpacity(this.auraMotes, 0.25 + snap * 0.75)
        for (const r of this.auraRings) {
          r.rotation.z = t * 1.3 * amp
          this.setOpacity(r, snap * 0.7)
        }
        break
      }
      case 'hush':
        // The one aura that takes light away. It barely moves on purpose.
        if (this.auraShell) {
          this.auraShell.scale.setScalar(1 + Math.sin(t * 0.5) * 0.015 * amp)
          this.setOpacity(this.auraShell, 0.28 + Math.sin(t * 0.5) * 0.03)
        }
        break
      case 'hum': {
        const p = 0.5 + 0.5 * Math.sin(t * 2.4)
        if (this.auraShell) {
          this.auraShell.scale.setScalar(1 + p * 0.06 * amp)
          this.setOpacity(this.auraShell, 0.02 + p * 0.045)
        }
        node.rotation.y = t * 0.12 * amp
        break
      }
      case 'ironring':
        for (let i = 0; i < this.auraRings.length; i++) {
          this.auraRings[i].rotation.z = t * (0.55 - i * 0.2) * amp
        }
        break
      case 'tide':
        // Rings leave the plinth on a stagger and fade out as they widen.
        for (let i = 0; i < this.auraRings.length; i++) {
          const phase = (t * 0.3 + i / this.auraRings.length) % 1
          const r = this.auraRings[i]
          r.scale.setScalar(0.6 + phase * 3.2)
          r.position.y = 0.02 + phase * 0.1
          this.setOpacity(r, (1 - phase) * 0.55)
        }
        break
      case 'held': {
        // In, hold, out. The motes stop dead during the hold, which is the bit
        // that makes it read as a held breath rather than as a pulse.
        const cycle = (t * 0.22) % 1
        const held = cycle > 0.35 && cycle < 0.72
        const k = held ? 0.82 : 0.82 + Math.sin((cycle < 0.35 ? cycle / 0.35 : (cycle - 0.72) / 0.28) * Math.PI) * 0.24
        if (this.auraShell) {
          this.auraShell.scale.setScalar(k)
          this.setOpacity(this.auraShell, held ? 0.08 : 0.035)
        }
        if (!held) node.rotation.y += dt * 0.4 * amp
        break
      }
      case 'echo': {
        // Arriving rather than leaving: the rings start wide and close in, and
        // brighten as they land. Same mechanism as tide, run backwards, which
        // is the whole difference between a tide change and an answer.
        for (let i = 0; i < this.auraRings.length; i++) {
          const phase = (t * 0.26 + i / this.auraRings.length) % 1
          const r = this.auraRings[i]
          const shrink = 1 - phase
          r.scale.setScalar(0.5 + shrink * 3)
          r.position.y = 0.06 + shrink * 0.5
          this.setOpacity(r, Math.pow(phase, 1.6) * 0.7)
        }
        if (this.auraMotes) this.setOpacity(this.auraMotes, 0.5 + Math.sin(t * 1.1) * 0.3)
        break
      }
      case 'none':
        break
    }
  }

  private setOpacity(o: THREE.Object3D, value: number): void {
    const mat = (o as unknown as MeshLike).material
    if (mat && !Array.isArray(mat)) mat.opacity = clamp(value, 0, 1)
  }

  // Embers rise and start again at the bottom. Worth doing per point rather
  // than by spinning the whole cloud, because rising is the entire idea.
  private driftMotes(step: number, height: number): void {
    const pts = this.auraMotes
    const base = this.moteBase
    if (!pts || !base) return
    const attr = pts.geometry.attributes.position as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 1; i < arr.length; i += 3) {
      let y = arr[i] + step
      if (y > height) y = base[i] - 0.4
      arr[i] = y
    }
    attr.needsUpdate = true
  }

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  private frameCamera(instant: boolean): void {
    const target = this.body ? this.body.root : this.egg ? this.egg.root : null
    if (!target) return
    this.box.setFromObject(target)
    if (this.box.isEmpty()) return
    this.box.getBoundingSphere(this.sphere)

    const vFov = (this.camera.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect)
    const fit = Math.min(vFov, hFov)
    // Just enough air to see the plinth edge. Anything more and the creature
    // becomes an object in a room rather than the thing you came to look at.
    this.camDistTarget = (this.sphere.radius / Math.sin(fit / 2)) * 1.04 + 0.12
    this.camHeightTarget = this.sphere.center.y * 0.88 + 0.06
    if (instant) {
      this.camDist = this.camDistTarget
      this.camHeight = this.camHeightTarget
    }
  }

  private stepCamera(dt: number): void {
    this.frameCamera(false)
    const k = Math.min(1, dt * 2.2)
    this.camDist += (this.camDistTarget - this.camDist) * k
    this.camHeight += (this.camHeightTarget - this.camHeight) * k

    // A very slow drift around a fixed three quarter view. The lights never
    // move, so the creature keeps the same read while the frame stays alive.
    const a = 0.62 + Math.sin(this.clock * 0.07) * 0.11 * this.motion
    const el = 0.2 + Math.sin(this.clock * 0.05 + 1.7) * 0.035 * this.motion
    this.camera.position.set(
      Math.sin(a) * Math.cos(el) * this.camDist,
      this.camHeight + Math.sin(el) * this.camDist,
      Math.cos(a) * Math.cos(el) * this.camDist,
    )
    this.camera.lookAt(0, this.camHeight, 0)

    if (this.rig) {
      this.rig.accent.position.set(0, this.camHeight + 0.5, 0)
      this.rig.key.target.position.set(0, this.camHeight * 0.6, 0)
      this.rig.key.target.updateMatrixWorld()
      this.rig.rim.target.position.set(0, this.camHeight * 0.7, 0)
      this.rig.rim.target.updateMatrixWorld()
    }
  }
}

function socketsFor(sockets: Sockets, locus: Locus): THREE.Object3D[] {
  switch (locus) {
    case 'horn':
      return sockets.horn
    case 'ear':
      return sockets.ear
    case 'wing':
      return sockets.wing
    case 'tail':
      return sockets.tail
    case 'spine':
      return sockets.spine
    case 'eye':
      return sockets.eye
    case 'hide':
    case 'aura':
      return []
  }
}
