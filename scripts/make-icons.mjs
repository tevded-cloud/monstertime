// make-icons.mjs: draws the MonsterTime mark and writes every size the manifest
// and iOS want.
//
//   node scripts/make-icons.mjs
//
// Zero dependencies: the shapes below are rasterized with a small built in
// renderer, then packed into PNG by hand (deflate plus a CRC), so the icons
// exist with nothing to install and nothing that can go missing at build time.
//
// The mark descends from public/favicon.svg and keeps the two things that
// drawing got right: an uneven pair of horns (a matched pair reads as a logo,
// an uneven one reads as an animal) and a single eye set off centre, so the
// head has a direction. Three things changed on purpose.
//
// The proportions were redrawn on a 512 canvas with real margins, because the
// favicon's tail ran off the right edge and a home screen icon is cropped
// rather than shown whole.
//
// The colours moved onto the app's own palette: ground-2 for the ground, ember
// for the creature, the eye punched back out in the ground colour. The old
// purple and gold traced to nothing in src/index.css, and the mark a person
// keeps on their home screen should be the animal the app is about.
//
// And the tail is gone. See the note on HEAD below: it cost three drafts.
//
// Bright creature on a dark ground rather than the reverse, because a favicon
// is 16px on a tab strip that may be light or dark: the ember silhouette is
// what has to carry, and it sits at about 7:1 against the ground either way.
//
// The head is deliberately an egg, taller than it is wide, rather than a
// circle. src/ui/Landing.tsx draws the app's inline sigil as an egg with a
// single ember mark where it is about to give, and an app icon that shared
// nothing with the mark beside the wordmark would be a third unrelated drawing
// on one product. This is the same egg with the animal already showing through
// it, which is also the thing the app is actually about.
//
// A sibling app that once did this kept the SVG artwork and the raster artwork
// as two separate hand written copies, and the two quietly drifted apart when
// the palette changed. To make that impossible here, both the SVG writer and
// the raster sampler below read the exact same SHAPES table. There is no
// second copy to forget.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const ICONS_DIR = join(HERE, '..', 'public', 'icons')
const SVG_PATH = join(ICONS_DIR, 'icon.svg')

const TARGETS = [
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
]

// Maskable icons get cropped to a shape (a circle, a squircle, whatever the
// launcher wants) by the OS, so the artwork inside has to sit well clear of
// that crop line. Shrinking it to about 78 percent of the canvas is the usual
// safe margin. The ground itself is not shrunk: it already fills the whole
// square, on every size, so there is nothing extra to do for it here.
const MASKABLE_SCALE = 0.78

/* --------------------------------------------------- the mark, once, here */

// Both taken straight from src/index.css so the icon cannot drift away from
// the app it opens: --ground-2 and --ember.
const GROUND = '#101314'
const EMBER = '#ff7a45'

const CANVAS = 512

// The horns are deliberately unequal: the right one is longer, leans further
// out, and sits on a wider base (74 units against 65). Their bases are placed
// inside the head ellipse rather than against it, so the union of the shapes is
// one silhouette with no seam where they meet.
//
// They also sit well inboard of the head's own edge, which is the whole
// difference between horns and ears. A triangle rising off the outline of a
// round head is an ear, and the first draft of this mark was a cat because of
// it. Leaving 64 units of skull outside the left horn and 72 outside the right
// puts them on a crown instead of on the sides.
const LEFT_HORN = [
  { x: 152, y: 84 },
  { x: 162, y: 214 },
  { x: 222, y: 188 },
]
// Longer, thicker at the base, and leaning further out. 179 units from base to
// tip against the left horn's 123, which is enough to be seen as uneven rather
// than as a drawing mistake.
const RIGHT_HORN = [
  { x: 348, y: 36 },
  { x: 246, y: 182 },
  { x: 310, y: 220 },
]

// One ellipse, taller than it is wide, so the head is an egg rather than a
// circle. Two earlier drafts hung a tail off a round body and both read as a
// speech bubble first and an animal second: a rounded shape with a spike on it
// does that on either side, straight or curled. A third gave it a second
// ellipse for a jaw and got a peanut. There is nothing hanging off this one.
// The character comes from the two horns being visibly different animals from
// each other and from where the eye sits, both of which survive being 16px on a
// tab strip, which no small appendage does.
const HEAD = { cx: 240, cy: 296, rx: 142, ry: 152 }

// A dark eye with a lit pupil, which is the app's own art direction on a 512px
// square: the creature is the only thing in MonsterTime allowed to glow. At
// 16px the pupil is under a pixel and drops out, leaving a plain dark eye,
// which is the right thing for it to degrade to.
const EYE = { cx: 288, cy: 268, r: 46 }
const PUPIL = { cx: 296, cy: 260, r: 15 }

// One flat table, read by both the SVG writer and the raster sampler below.
// Order matters: it is also paint order. The horns go down first so the head
// can sit over the joins, then the eye, which is a hole cut in the head rather
// than a mark on top of it, and the pupil last inside the hole.
const SHAPES = [
  { kind: 'polygon', points: LEFT_HORN, color: EMBER },
  { kind: 'polygon', points: RIGHT_HORN, color: EMBER },
  { kind: 'ellipse', cx: HEAD.cx, cy: HEAD.cy, rx: HEAD.rx, ry: HEAD.ry, color: EMBER },
  { kind: 'circle', x: EYE.cx, y: EYE.cy, r: EYE.r, color: GROUND },
  { kind: 'circle', x: PUPIL.cx, y: PUPIL.cy, r: PUPIL.r, color: EMBER },
]

/* ------------------------------------------------------------- SVG side */

function svgShape(s) {
  if (s.kind === 'polygon') {
    const points = s.points.map((p) => p.x + ',' + p.y).join(' ')
    return `<polygon points="${points}" fill="${s.color}" />`
  }
  if (s.kind === 'ellipse') {
    return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${s.color}" />`
  }
  return `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.color}" />`
}

// scale 1 is what ships as icon.svg. scale MASKABLE_SCALE is only ever used in
// memory, to hand the raster renderer below something drawn smaller, so there
// is no second SVG file to keep in step with this one.
function buildSvg(scale) {
  const shapes = SHAPES.map(svgShape).join('\n    ')
  const body = scale === 1
    ? shapes
    : `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">\n    ${shapes}\n  </g>`
  return `<svg viewBox="0 0 ${CANVAS} ${CANVAS}" xmlns="http://www.w3.org/2000/svg">\n  <rect width="${CANVAS}" height="${CANVAS}" fill="${GROUND}" />\n  ${body}\n</svg>\n`
}

/* ---------------------------------------------------------- raster side */

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const GROUND_RGB = hexToRgb(GROUND)

// Ray casting: count how many edges lie to the right of the sample on its own
// scanline. The half open test on the vertical span is what stops a sample
// exactly level with a vertex being counted by both edges that meet there and
// flipping straight back out of the shape.
function insidePolygon(px, py, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]
    const b = points[j]
    if ((a.y > py) !== (b.y > py)) {
      const cross = a.x + ((py - a.y) / (b.y - a.y)) * (b.x - a.x)
      if (px < cross) inside = !inside
    }
  }
  return inside
}

function samplePixel(x, y, scale) {
  // Sampling further from the centre than the output pixel actually sits is
  // what shrinks the drawing for maskable icons, while the ground below never
  // moves, so it always still reaches every edge.
  const sx = 256 + (x - 256) / scale
  const sy = 256 + (y - 256) / scale
  let color = GROUND_RGB
  for (const shape of SHAPES) {
    if (shape.kind === 'polygon') {
      if (insidePolygon(sx, sy, shape.points)) color = hexToRgb(shape.color)
    } else if (shape.kind === 'ellipse') {
      const dx = (sx - shape.cx) / shape.rx
      const dy = (sy - shape.cy) / shape.ry
      if (dx * dx + dy * dy <= 1) color = hexToRgb(shape.color)
    } else if (Math.hypot(sx - shape.x, sy - shape.y) <= shape.r) {
      color = hexToRgb(shape.color)
    }
  }
  return color
}

function render(size, scale) {
  // 4 per axis rather than 3. The horns are long diagonals and the eye is a
  // small circle inside a filled body, and both of those are where a coarser
  // grid shows its stair steps at 180px and below.
  const SS = 4
  const px = new Uint8Array(size * size * 4)
  const step = CANVAS / size
  for (let py = 0; py < size; py += 1) {
    for (let pxi = 0; pxi < size; pxi += 1) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (pxi + (sx + 0.5) / SS) * step
          const y = (py + (sy + 0.5) / SS) * step
          const c = samplePixel(x, y, scale)
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const n = SS * SS
      const o = (py * size + pxi) * 4
      px[o] = Math.round(r / n)
      px[o + 1] = Math.round(g / n)
      px[o + 2] = Math.round(b / n)
      px[o + 3] = 255
    }
  }
  return px
}

/* ---------------------------------------------------- minimal PNG writer */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0 // no per row filter, kept simple over compact
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------------------------------------------------- run */

// A maskable launcher crops to a circle of radius 40 percent of the canvas, so
// every point of the drawing has to fall inside that circle once it has been
// scaled down. Checked here rather than left to somebody noticing a clipped
// horn on a phone, because moving a single number in the table above is all it
// takes to break it.
function assertMaskableFits() {
  const points = []
  for (const s of SHAPES) {
    if (s.kind === 'polygon') points.push(...s.points)
    else if (s.kind === 'ellipse') {
      // Swept rather than sampled at the four axis ends. The head does not sit
      // on the canvas centre, so the point of it furthest from that centre is
      // not one of its own extremes and four samples would miss it.
      for (let i = 0; i < 360; i += 1) {
        const a = (i * Math.PI) / 180
        points.push({ x: s.cx + s.rx * Math.cos(a), y: s.cy + s.ry * Math.sin(a) })
      }
    }
  }
  const safeRadius = CANVAS * 0.4
  let worst = 0
  for (const p of points) {
    const x = 256 + (p.x - 256) * MASKABLE_SCALE
    const y = 256 + (p.y - 256) * MASKABLE_SCALE
    worst = Math.max(worst, Math.hypot(x - 256, y - 256))
  }
  if (worst > safeRadius) {
    console.error(
      'make-icons: the mark reaches ' + worst.toFixed(1) + 'px from the centre once scaled, ' +
      'past the ' + safeRadius + 'px a maskable launcher is allowed to crop to. Pull the shapes in.'
    )
    process.exit(1)
  }
  return worst
}

const worstReach = assertMaskableFits()

mkdirSync(ICONS_DIR, { recursive: true })
writeFileSync(SVG_PATH, buildSvg(1))
console.log('wrote icon.svg')

for (const t of TARGETS) {
  const rgba = render(t.size, t.maskable ? MASKABLE_SCALE : 1)
  writeFileSync(join(ICONS_DIR, t.file), encodePng(t.size, rgba))
  console.log('wrote', t.file)
}

console.log(
  'make-icons: maskable artwork reaches ' + worstReach.toFixed(1) + 'px of the ' +
  (CANVAS * 0.4) + 'px safe radius'
)
