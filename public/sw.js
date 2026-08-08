// sw.js: keeps MonsterTime able to open with the phone completely offline.
//
// Only files this app owns are cached. Everything else, including anything on
// another origin, is passed straight through to the network and never stored
// here: other apps share this same domain and this worker has no business
// touching their files.
//
// One cache holds one whole generation of the app. The worker only ever serves
// out of its own generation's cache, and it only starts serving once that cache
// is complete. That is what stops a phone running a brand new index.html
// against last week's script.
//
// THE RULE THIS APP HAS THAT ITS NEIGHBOURS DO NOT: /api/monstertime/* is never
// cached, under any circumstance. SympTime and ColorTime hold nothing but the
// person's own local data, so anything they cache is still true when they hand
// it back. MonsterTime's creature is live state a whole group owns together,
// and it moves whenever any of them touches it. A stored API response handed
// over later would show somebody a creature that has already changed, and they
// would act on it believing it was current, which is worse than showing them
// nothing. See the guard at the top of the fetch handler.
//
// Offline the right answer is the last creature this device actually saw,
// labelled as of its last sync and with the actions switched off. That belongs
// to the app, not to this file. All this file does is make sure the app is
// there to say it, and refuse to lie about the network on its behalf.

// Filled in by scripts/build-sw.mjs after every build.
const VERSION = '__VERSION__'

// A copy served straight out of public/ by the dev server never went through
// build-sw.mjs, so its file list is the placeholder below and its version is a
// string that never changes. Caching the dev server's index.html under a name
// that can never rotate is how an afternoon disappears, so an unbuilt copy
// makes itself inert instead: it installs nothing and intercepts nothing. A
// real version is always the first 12 hex characters of a content hash, which
// is a shape the placeholder cannot accidentally have.
const BUILT = /^[0-9a-f]{12}$/.test(VERSION)

const CACHE = 'monstertime-shell-' + VERSION

// Filled in by scripts/build-sw.mjs after every build: the document, the hashed
// JS and CSS Vite produced, the manifest, and the icons. That list is the
// entire shell, so it is also the entire precache. There is nothing this app
// ships that arrives later.
const PRECACHE = ['./']; /* __PRECACHE__ */

// Relative URLs resolve against this file's own folder, so the app keeps
// working under /monstertime/ or wherever it actually ends up deployed. The
// document is the same one URL as the root: routing is location.hash, so every
// group in the world is the same single page.
const INDEX_URL = new URL('./', self.location.href).href
const ROOT = new URL('./', self.location.href).href

// Absolute rather than relative to ROOT on purpose. The API is a sibling of the
// app folder, not a child of it, because the site Worker answers it while the
// asset store answers everything else.
const API_ROOT = new URL('/api/monstertime/', self.location.href).href

// The host is a Cloudflare Worker whose static assets fall back to another
// site's page for anything it does not recognise, so it answers a wrong path
// with a 200 and someone else's HTML rather than a 404. A fetch that merely
// succeeds is therefore not enough to trust: a script, style sheet, manifest,
// or icon that actually came back as an HTML page counts as a failure, never as
// the real file.
const ASSET_EXT = /\.(?:js|mjs|css|json|webmanifest|svg|png)$/i

function usable(response, path) {
  if (!response || !response.ok || response.status !== 200) return false
  // A redirect means what was asked for is not what came back, and a browser
  // refuses a redirected response for a navigation anyway.
  if (response.redirected) return false
  if (ASSET_EXT.test(new URL(path, self.location.href).pathname)) {
    const type = response.headers.get('content-type') || ''
    if (/text\/html/i.test(type)) return false
  }
  return true
}

// cache: 'reload' goes past the browser's own HTTP cache. Without it a long
// max-age at the host could quietly fill a brand new generation with last
// generation's bytes, which would make the version bump pointless.
async function fetchFresh(path) {
  const href = new URL(path, self.location.href).href
  const response = await fetch(new Request(href, { cache: 'reload' }))
  return { href, response }
}

self.addEventListener('install', (event) => {
  if (!BUILT) return
  event.waitUntil((async () => {
    // All of it or none of it. Everything is fetched and checked before a
    // single thing is written, so a half filled cache never exists to serve out
    // of, and a slow or missing file fails the whole install instead of
    // shipping a shell with holes in it.
    const got = await Promise.all(PRECACHE.map(async (path) => {
      const { href, response } = await fetchFresh(path)
      if (!usable(response, path)) throw new Error('sw: precache failed for ' + path)
      return { href, response }
    }))
    const cache = await caches.open(CACHE)
    for (const { href, response } of got) await cache.put(href, response)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  if (!BUILT) return
  event.waitUntil((async () => {
    const names = await caches.keys()
    // Only this app's own old shells get cleared. Other apps live on this same
    // domain and keep caches of their own, so clearing every cache on the
    // origin would throw their work away too.
    await Promise.all(names
      .filter((n) => /^monstertime-shell-/.test(n) && n !== CACHE)
      .map((n) => caches.delete(n)))
    await self.clients.claim()
  })())
})

// Lets the page ask a waiting worker to take over right now, instead of waiting
// for every tab to close on its own.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

// Every read goes to this generation's cache by name, never a search across
// every cache on the origin. A search like that is how a file from an older
// generation could leak into a newer page.
async function serveDocument(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(INDEX_URL)
  if (cached) return cached
  // No document cached means this worker never finished installing, so there is
  // nothing of ours to fall back to. Whatever the network says, including its
  // failure, is the honest answer.
  return fetch(request)
}

async function serveAsset(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  // A miss here means a path the precache list did not name, most likely one
  // this app never shipped. Nothing is written on a miss: this app has no shell
  // content that arrives after the build, so remembering a stray response would
  // only risk keeping a wrong one around past the generation that produced it.
  return fetch(request)
}

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Never, under any condition, on any code path below this line. The creature
  // is live shared state, so an API response is only true at the instant it
  // came back; see the note at the top of this file. Returning without calling
  // respondWith hands the request to the network untouched, which also means
  // that offline it fails rather than resolving with something stale, and the
  // app gets to say so in its own words.
  //
  // This check sits above every other one deliberately, including the method
  // check. Today the API also happens to fall outside ROOT below, and today
  // every API call is either a POST or a WebSocket handshake, which service
  // workers are not given at all. Both of those are accidents of the current
  // shape of the app, and a rule that matters this much is not allowed to rest
  // on an accident that a later GET endpoint would quietly undo.
  if (request.url.startsWith(API_ROOT)) return

  if (!BUILT) return
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Cross origin requests go straight to the network, untouched. This app makes
  // none of these itself: this only guards against a stray request a browser or
  // extension might make on its own behalf.
  if (url.origin !== self.location.origin) return
  // Anything outside this app's own folder is none of its business either:
  // other apps live on this same domain.
  if (!url.href.startsWith(ROOT)) return

  if (request.mode === 'navigate') {
    event.respondWith(serveDocument(request))
    return
  }

  event.respondWith(serveAsset(request))
})
