// deploy.mjs: puts a finished build where the website will serve it from.
//
//   node scripts/deploy.mjs
//
// tevded.com is one Cloudflare Worker serving a folder, and every small app on
// it (crimetime, colortime, symptime, dubtime) lives as a plain directory
// under public/. MonsterTime is the same: this copies dist into
// public/monstertime, and the site's own deploy publishes it. Nothing here
// talks to Cloudflare, so a mistake at this step cannot reach the live site
// on its own.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DIST = join(ROOT, 'dist')
const SITE = process.env.SITE_DIR || 'D:\\Programs\\tevded-site'
const TARGET = join(SITE, 'public', 'monstertime')

function bail(message) {
  console.error('deploy: ' + message)
  process.exit(1)
}

if (!existsSync(DIST)) bail('no dist folder. Run npm run build first.')
if (!existsSync(join(DIST, 'index.html'))) bail('dist has no index.html, so the build did not finish.')
if (!existsSync(SITE)) bail('cannot find the website at ' + SITE + '. Set SITE_DIR.')

// A half-finished build can still leave an index.html behind if a prior run
// succeeded and the new one died before overwriting assets. The one thing
// that reliably tells the two apart is whether the hashed bundle actually
// landed, so that is what gets checked rather than trusting the html alone.
const ASSETS = join(DIST, 'assets')
if (!existsSync(ASSETS)) bail('dist has no assets folder, so the build did not finish.')
const hasScript = readdirSync(ASSETS).some((name) => name.endsWith('.js'))
if (!hasScript) bail('dist/assets has no .js file, so the build did not finish.')

function measure(dir) {
  let files = 0
  let bytes = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const inner = measure(full)
      files += inner.files
      bytes += inner.bytes
    } else {
      files += 1
      bytes += statSync(full).size
    }
  }
  return { files, bytes }
}

// Replaced wholesale rather than merged: a stale hashed asset left behind from
// an older build is exactly the kind of thing a browser will happily keep
// serving forever.
if (existsSync(TARGET)) rmSync(TARGET, { recursive: true, force: true })
mkdirSync(TARGET, { recursive: true })
cpSync(DIST, TARGET, { recursive: true })

const { files, bytes } = measure(TARGET)
console.log('deploy: copied ' + files + ' files (' + (bytes / 1024 / 1024).toFixed(2) + ' MB) to ' + TARGET)

// MonsterTime is the first app on this site that needs a server: the static
// folder just staged is only the UI. Without worker/monstertime.ts wired into
// the site Worker, plus a Durable Object binding for it, a group that opens
// the page gets a creature screen with nothing alive behind it. That failure
// mode is silent (the page loads fine, it just cannot hatch anything), so the
// reminder below is deliberately loud rather than a one-line note.
console.log('')
console.log('====================================================================')
console.log('  STATIC STAGE ONLY. THIS IS NOT A WORKING DEPLOY BY ITSELF.')
console.log('')
console.log('  MonsterTime needs server code that dubtime and its neighbours')
console.log('  did not: worker/monstertime.ts wired into the tevded-site Worker,')
console.log('  and a Durable Object binding for it in wrangler.jsonc.')
console.log('')
console.log('  Confirm both of those are in place in ' + SITE + ' before')
console.log('  publishing, or the live page will have a UI and no creature.')
console.log('====================================================================')
console.log('')

console.log('deploy: now publish the site with: cd ' + SITE + ' ; npm run deploy')
