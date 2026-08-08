# wave3:pwa

All checks pass. Final state verified.

**FILES TOUCHED**

- `D:\Programs\monstertime\index.html`
- `D:\Programs\monstertime\public\manifest.webmanifest` (new)
- `D:\Programs\monstertime\public\sw.js` (new)
- `D:\Programs\monstertime\scripts\build-sw.mjs` (new)
- `D:\Programs\monstertime\scripts\make-icons.mjs` (new)
- `D:\Programs\monstertime\public\icons\` (new: `icon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`)

Nothing outside that list was created or modified. No git, no build, no tsc, no vite.

**WHAT I DID**

*sw.js.* Structure, safety posture and comment voice carried from `symptime\public\sw.js`: one cache per generation (`monstertime-shell-<12 hex>`), all-or-nothing install, `usable()` rejecting the host's HTML fallback wearing a 200, `cache: 'reload'` on precache fetches, activate clearing only `^monstertime-shell-` so the siblings' caches survive, ROOT and cross-origin passthrough.

The MonsterTime-only rule is the first statement in the fetch handler, above the method check:

```js
if (request.url.startsWith(API_ROOT)) return
```

`API_ROOT` is absolute (`/api/monstertime/`), not relative to ROOT, because the API is a sibling of the app folder. It sits above everything else deliberately: today the API also falls outside ROOT, and today every API call is a POST or a WebSocket handshake (which workers never see at all), but both of those are accidents of the app's current shape and a later GET snapshot endpoint would quietly undo the rule. Returning without `respondWith` means offline these fail honestly rather than resolving stale.

One addition the siblings do not have. `sw.js` tests its own version against `/^[0-9a-f]{12}$/`. A copy served straight out of `public/` by the dev server never went through `build-sw.mjs`, so its version is the literal placeholder and its precache list is `['./']`; it now installs nothing and intercepts nothing instead of freezing the dev server's `index.html` under a cache name that can never rotate. `vite preview` still gets a real worker because it serves a built `dist`.

*build-sw.mjs.* SympTime's, adapted. Precaches document as `./`, `dist/assets/**`, the manifest, `dist/icons/**`. Two extra gates: it fails if `dist/sw.js` no longer contains `request.url.startsWith(API_ROOT)` (losing that guard is completely silent at runtime, the app would look healthy while handing someone an hour-old creature), and it fails if the shell list ever picks up anything under `api/`. It also asserts the version matches the 12-hex shape `sw.js` tests for, so the two ends of that contract cannot drift.

*make-icons.mjs.* Zero dependency, hand-packed PNG via zlib deflate plus CRC, single `SHAPES` table read by both the SVG writer and the raster sampler. I extended the renderer with `polygon` (ray casting, half-open vertical span) and `ellipse` kinds, and raised supersampling from 3 to 4 per axis because the horns are long diagonals. Added a build-time assert that every point of the artwork, once scaled by 0.78, falls inside the 40%-radius circle a maskable launcher may crop to; it sweeps ellipse boundaries at 360 points rather than sampling four axis ends, because the head is off-centre so its furthest point from the canvas centre is not one of its own extremes.

*Icons: superseded, not built on.* The mark descends from `public/favicon.svg` and keeps its two good ideas (uneven horns, off-centre eye), but the drawing and the palette are new. The favicon's purple `#4b2e73` and gold `#ffcb3d` trace to nothing in `src/index.css`; the icon now uses `--ground-2 #101314` and `--ember #ff7a45`, two colours, no gradient, no text, bright creature on dark ground so the silhouette carries on a light or dark tab strip. The head is an egg rather than a circle, which reconciles it with the egg sigil `src/ui/Landing.tsx` draws next to the wordmark: the same egg with the animal showing through.

It cost four drafts and the failures are recorded in the file's comments. Draft 1 was a cat (triangles rising off the outline of a round head are ears; horns needed 64 and 72 units of skull outside them). Drafts 1 and 2 also read as a speech bubble, because a rounded shape with a spike on it does that on either side, straight or curled. Draft 3 replaced the tail with a jaw ellipse and got a peanut. The shipped mark has nothing hanging off it.

*index.html.* Manifest link, `theme-color #0a0c0d` (single value, no light variant: the app declares `color-scheme: dark`), `color-scheme`, apple-touch-icon, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, app title, and status-bar-style. `viewport-fit=cover` was already present and I annotated it as load-bearing, since another agent has since made `src/index.css` depend on it via `--inset-*`. The favicon link moved from `favicon.svg` to `icons/icon.svg`.

Service worker registration is an inline classic script in the head, since `src/` is not mine. It guards https/localhost, records whether a controller existed before registering (so the first install claiming the page is not mistaken for an update), and checks for updates on visibility with a 5 minute throttle. It reloads on `controllerchange` **only while the document is hidden**, otherwise it flags and reloads at the next hide. The siblings reload immediately; MonsterTime is a live socket plus a WebGL scene, and yanking either from someone watching their creature is worse than being one version behind for a minute. Nothing is lost by waiting, because the creature is derived from the server's action list, not from anything held in the tab. Verified no CSP exists in `tevded-site\public\_headers` or its worker, so the inline script will run.

**MEASUREMENTS**

Icons (bytes are the real files): `apple-touch-icon.png` 180x180 1.9 KB, `icon-192.png` 192x192 1.9 KB, `icon-512.png` 512x512 6.1 KB, `icon-maskable-192.png` 1.7 KB, `icon-maskable-512.png` 5.3 KB, `icon.svg` 422 B. Maskable artwork reaches 186.0px of the 204.8px safe radius (9% headroom); the binding point is the right horn apex, not the head. Generation takes 0.70s. Horn asymmetry is 179 units base-to-tip against 123, on bases of 74 against 65. Ember on ground-2 measures about 7:1. I rendered 16, 32 and 48px previews and looked at them: at 16px both horns and the dark eye survive, the pupil drops out as intended.

`build-sw.mjs` run against a simulated dist (real `dist/assets` from the last build plus my manifest and icons): 10 files, 819.8 KB, version `16e80a98950a`, zero `__VERSION__`/`__PRECACHE__` residue, output parses under `node --check`.

I wrote a harness that loads the built worker in a `vm` context with fake `caches`/`fetch` and drives install, activate and fetch. 8 of 8 pass:

- precaches the whole shell on install (10 entries, document keyed as the folder root)
- serves the cached document for a navigation with the network throwing, zero fetches
- serves a hashed asset from its own generation offline, zero fetches
- **never answers or stores `/api/monstertime/*`**: tested `groups`, `groups/abc/socket` and a hypothetical `groups/abc/snapshot?since=3`, each as GET, POST and as a navigation (the navigation case matters, it is the path with a cached document waiting). All 9 returned no response and the cache size did not change.
- leaves `/symptime/*`, `/` and another origin alone
- clears only its own older generations (seeded `monstertime-shell-old`, `symptime-shell-*`, `colortime-art-v3`; deleted exactly one)
- an asset the build never shipped is fetched and not remembered
- the unbuilt worker opens 0 caches, fetches 0 files, answers 0 navigations

Negative tests on the gates: replacing the API guard fails the build with the right message, editing the PRECACHE placeholder fails, a missing `dist/icons` fails, and pushing a horn out to (400,8) fails the maskable assert at 223.7px before anything is written. All my files are pure ASCII, no dashes, no emoji, no smart quotes.

**WHAT I DELIBERATELY DID NOT DO**

- No install-prompt UI (`beforeinstallprompt` capture, the iOS "add to home screen" guide, an update-available banner). That is all React surface in `src/`, which is not mine. The registration script is the platform half only.
- No `launch_handler: focus-existing` in the manifest. It would keep one window, which suits this app, but it would also stop a freshly pasted group link from opening its group in an installed copy.
- No `robots: noindex`. SympTime has it, ColorTime does not; MonsterTime grows by pasted links, so I matched ColorTime.
- `make-icons.mjs` is not wired into `build`, matching the house pattern in both siblings where `icons` is its own script and `public/icons` is committed.
- I did not delete or edit `public/favicon.svg`; it is not on my list.

**DEVIATIONS**

Three, all argued in the comments: the `BUILT` inertness check in `sw.js` (siblings have nothing like it), the reload-when-hidden policy instead of the siblings' immediate reload, and registration from `index.html` instead of a `src/pwa.ts`.

**CHANGES YOU NEED TO MAKE**

1. `package.json`, exact replacement:

```
"build": "tsc -b && tsc -p tsconfig.worker.json && vite build && node scripts/build-sw.mjs",
```

and add alongside it, matching symptime and colortime:

```
"icons": "node scripts/make-icons.mjs",
```

Nothing needed in `types.ts`.

2. `public/favicon.svg` is now referenced by nothing. It still gets copied into `dist` and staged, and it is not precached. Delete it, or tell me to.

3. `D:\Programs\tevded-site\public\_headers` needs this block (the other session owns that repo, and `RESUME.md` section 7 already lists it):

```
/monstertime/manifest.webmanifest
  Content-Type: application/manifest+json

/monstertime/sw.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /monstertime/
```

**TWO PRODUCT GAPS THE PWA EXPOSES, BOTH IN `src/`, NEITHER MINE**

These are the difference between "installs" and "is worth installing", and my files cannot reach either.

*An installed copy always opens to the wrong screen.* `start_url` can only be `/monstertime/`, and routing is `location.hash` only (`src/ui/useGroup.ts`), so a home screen launch arrives with no hash. `src/ui/App.tsx` line 39 then does `if (!groupId) return <Landing mode="new" />`. Every single launch from the home screen asks the person to start a brand new group. Nothing persists the last group id. Fix belongs in `useGroup.ts`: write the group id to localStorage whenever it resolves, and when the hash is empty on boot, restore it. `NAME_FLAG` in that file is the pattern to copy.

*Offline still says "we could not reach that creature."* The worker now guarantees the shell opens with no signal, but `App.tsx` waits `PATIENCE_MS` (8s) and falls to `<Lost>` because `everConnected` is false and no snapshot was ever persisted. The brief's requirement, the last known creature marked as of last sync and read-only, needs the client to keep the last `GroupSnapshot` in localStorage and derive from it when the socket cannot open. The `stale` flag already computed at `App.tsx` line 46 (`everConnected && (status === 'closed' || status === 'error')`) is the right hook for the read-only treatment; it needs a sibling case for never-connected-but-have-a-cached-snapshot, and the action bar disabled with a visible "as of <time>" line. Whoever owns `src/net` and `src/ui` should take this; my API rule guarantees the stale data can only ever come from the app's own deliberate store, never from the worker pretending a cached response is live.

*One smaller note for the mobile agent.* I chose `apple-mobile-web-app-status-bar-style: black` rather than `black-translucent`. Translucent gives the full-bleed dark stage this app wants, and `.topbar` and `.frame` already add `--inset-t`, but `.notice` (line 544) and `.ticker` (line 562) in `src/index.css` are positioned at `calc(var(--topbar) + Npx)` with no inset, so they would sit under the clock. Add the inset to those two and translucent becomes the better choice.
