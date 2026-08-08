// build-sw.mjs: runs once after `vite build`, right before the app ships.
//
// Vite already copied public/sw.js into dist/sw.js untouched, because it is a
// static file sitting in the public directory, not something Vite's module
// graph understands. This script is the only thing that ever teaches that
// worker what a particular build actually contains: the real list of shell
// files, and a version string that changes whenever any of them do.
//
// Why a version derived from file contents rather than the package version or a
// timestamp: a changed build must always get a new cache name so phones pick it
// up, and a developer forgetting to bump a version number by hand is a
// certainty sooner or later. A content hash never forgets.
//
// MonsterTime keeps nothing on disk beyond its own shell, unlike a picture
// heavy sibling app, so there is no folder deliberately left out here:
// everything under dist that the app needs becomes the precache list. What it
// does have that its siblings do not is a live API, and the one check at the
// bottom of this file exists to make sure the worker still refuses to cache it.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = join(HERE, '..', 'dist')
const SW_PATH = join(DIST, 'sw.js')

function fail(message) {
  console.error('build-sw: ' + message)
  process.exit(1)
}

if (!existsSync(DIST)) fail('dist/ does not exist. Run vite build before this script.')
if (!existsSync(SW_PATH)) fail('dist/sw.js is missing. Check that public/sw.js still exists for Vite to copy.')

// Walks a folder and returns every file inside it, recursively, as absolute
// paths. Vite's own hashing can nest generated files in subfolders, so this
// cannot assume a flat list.
function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function toRelative(full) {
  return relative(DIST, full).split(sep).join('/')
}

const documentPath = join(DIST, 'index.html')
if (!existsSync(documentPath)) fail('dist/index.html is missing, so there is no document for the shell to serve.')

// Vite's hashed JS and CSS.
const assetFiles = walk(join(DIST, 'assets'))
if (assetFiles.length === 0) fail('no built files found under dist/assets. The vite build may have failed or produced nothing.')

const manifestPath = join(DIST, 'manifest.webmanifest')
if (!existsSync(manifestPath)) fail('dist/manifest.webmanifest is missing. Check that public/manifest.webmanifest still exists.')

const iconFiles = walk(join(DIST, 'icons'))
if (iconFiles.length === 0) fail('no icon files found under dist/icons. Run scripts/make-icons.mjs before building.')

// The document is precached as './', matching how sw.js resolves its own
// INDEX_URL, and matching that a redirected index.html can never be served for
// a navigation in the first place. Routing is location.hash, so every group is
// this same one document.
const shellFiles = [
  { url: './', full: documentPath },
  ...assetFiles.map((full) => ({ url: toRelative(full), full })),
  { url: 'manifest.webmanifest', full: manifestPath },
  ...iconFiles.map((full) => ({ url: toRelative(full), full })),
]

if (shellFiles.length === 0) fail('collected nothing to precache. The checks above should already have caught this.')

const hash = createHash('sha256')
let totalBytes = 0
for (const file of shellFiles) {
  const contents = readFileSync(file.full)
  totalBytes += contents.length
  hash.update(file.url)
  hash.update(contents)
}
const version = hash.digest('hex').slice(0, 12)

// sw.js decides whether it has been through this script by testing its version
// against exactly this shape, and stays inert if it does not match. Asserting it
// here rather than trusting the slice above keeps the two ends of that contract
// from drifting apart silently, which would ship a worker that does nothing at
// all and looks fine.
if (!/^[0-9a-f]{12}$/.test(version)) fail('the version came out as "' + version + '", which is not the 12 hex characters sw.js tests for.')

let sw = readFileSync(SW_PATH, 'utf8')

if (!sw.includes('__VERSION__')) fail('the __VERSION__ placeholder is missing from dist/sw.js. Was public/sw.js edited?')
sw = sw.replaceAll('__VERSION__', version)

const PRECACHE_PLACEHOLDER = "const PRECACHE = ['./']; /* __PRECACHE__ */"
if (!sw.includes(PRECACHE_PLACEHOLDER)) fail('the PRECACHE placeholder line is missing from dist/sw.js. Was public/sw.js edited?')
const precacheList = shellFiles.map((f) => JSON.stringify(f.url)).join(', ')
sw = sw.replace(PRECACHE_PLACEHOLDER, `const PRECACHE = [${precacheList}];`)

// The one rule MonsterTime has that its siblings do not, checked at build time
// because losing it is silent. A worker that started caching the API would look
// perfectly healthy: the app would open, the creature would appear, and it
// would be somebody's creature from an hour ago being acted on as if it were
// current. Nothing in a test or a page load would say so.
if (!sw.includes('request.url.startsWith(API_ROOT)')) {
  fail('dist/sw.js no longer refuses /api/monstertime/* before anything else. That guard is not optional: the creature is live shared state and a cached copy of it would be handed to somebody as current. Restore it in public/sw.js.')
}
// Nothing under an api path may ever end up in the precache list either. dist
// cannot contain one today, but a public/api folder added later would be picked
// up by the walks above without a word.
const strayApi = shellFiles.filter((f) => f.url === 'api' || f.url.startsWith('api/'))
if (strayApi.length > 0) {
  fail('the shell list picked up ' + strayApi.length + ' file(s) under api/, starting with ' + strayApi[0].url + '. Nothing from the API is ever precached.')
}

writeFileSync(SW_PATH, sw)

console.log(
  'build-sw: injected ' + shellFiles.length + ' files (' +
  (totalBytes / 1024).toFixed(1) + ' KB), version ' + version
)
