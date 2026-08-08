# verify:worker

## Findings, most severe first

---

### 1. Every per-actor rate limit is bypassable by re-sending `hello`; anyone with the link can permanently freeze a group's creature

`worker/monstertime.ts:441-450` (`hello`), `:452-507` (`act`)

`hello()` has no once-per-connection guard. It unconditionally overwrites the socket attachment with whatever `actorId` the client just sent, and `act()` re-reads that attachment on every message (`this.seatOf(ws)` at `:453`). The three brakes at `:483-507` are all a SQL scan `WHERE actorId = ?` against the log. So the client picks which bucket it is billed against, immediately before each action.

The only limit that is not client-controlled is the per-connection flood guard (`:640-649`, 40 messages per 10s), and its state lives in a `WeakMap` keyed by the `WebSocket` object (`:323`), so a new socket starts with a fresh budget.

Failure scenario: a script holding the group link opens a socket and loops `{"type":"hello","actorId":"<random>"}` then `{"type":"act","variantId":"feed.emberfruit"}`. Two messages per action, so 20 actions per 10 seconds per socket, and it may open sockets without limit. `MAX_ACTIONS` (5000) is reached in about 40 minutes on one socket, or a few minutes on ten. After that, `act()` at `:472` refuses every action from every real member forever: "This creature has a full life behind it." The group's creature is permanently dead and there is no delete or reset path anywhere in the file. Along the way the log holds 5000 distinct `actorId`s, so `bonds` in the derived creature (keyed by actorId) has 5000 entries and the pressure vector is whatever the attacker chose.

The README (`worker/README.md:62-65`) states the per-actor limits are "the real rule" and the flood guard merely "sits in front". The code inverts that: the flood guard is the only rule, and it is per-socket, not per-person.

---

### 2. The client stores the creature's name as the person's own display name, for every member of the group

`src/net/connection.ts:153` and `:249`

`rename()` at `:244-255` is the creature-rename path. `src/ui/Stage.tsx:100` passes `creature.name` into `NamePlate`, and `NamePlate.commit` at `:145-149` calls `onRename(clean)` with the creature's new name, which reaches `connection.rename()`. That function calls `setLocalName(name)` before sending. `setLocalName` (`src/net/identity.ts:80-84`) writes to `localStorage['monstertime.actor'].name`, which is the actor's own display name.

Worse, the receive side does the same to everyone. The server broadcasts `{type:'named', name}` to all sockets (`worker/monstertime.ts:561`) where `name` is the creature's name from the `meta` table. `connection.ts:153` handles it with `setLocalName(message.name)`. The comment above it claims the server is reporting "what name it actually recorded for this connection", which is not what that message is.

Failure scenario: Alice, Bob and Carol are in a group. Alice taps the nameplate and names the creature "Bumble". All three browsers write `name: "Bumble"` into their stored actor. Next time any of them reloads the page, `localActor()` reads it back and `hello` is sent with `actorName: "Bumble"` (`connection.ts:90`), so the server records "Bumble" as the author of every subsequent action (`worker/monstertime.ts:518`). The presence list shows three people all called Bumble, and the chronicle (`src/dna/express.ts:723-724`, `src/ui/Chronicle.tsx:99`) credits traits to "Bumble started it off". The personal attribution that the app exists for is destroyed by one rename, and it is written to localStorage so it survives everything.

---

### 3. Any unauthenticated GET instantiates a Durable Object and performs schema writes before the 404 is decided

`worker/monstertime.ts:266`, `:271`, `:282`, and the constructor at `:328-344`

`route()` calls `env.MONSTER_GROUP.getByName(groupId)` for any id matching `/^[A-Za-z0-9_-]{16,64}$/`, then `await group.snapshot()`. The stub is lazy, but the `snapshot()` RPC instantiates the object, which runs the constructor: two `CREATE TABLE IF NOT EXISTS` and one `CREATE INDEX IF NOT EXISTS` against `ctx.storage.sql`. Only after that does `readSnapshot()` find no seed and return `null`, producing the 404 at `:272`. The socket path at `:282` does the same via `group.fetch(request)` and `:377`.

Failure scenario: `for i in $(seq 1 100000); do curl https://tevded.com/api/monstertime/groups/$(openssl rand -hex 11); done`. Every one of those returns a correct 404 and every one of them first spins up a distinct Durable Object that writes its schema. There is no per-caller throttle in the Worker and no edge rule specified for the read paths. This shares an account and a Workers free-plan quota (100k requests/day, 100k rows written/day, 5 GB stored, per `worker/README.md:145-150`) with ColorTime's `Room` objects. Exhausting it takes ColorTime's shared rooms down with MonsterTime, which is exactly the cross-app blast radius this integration is supposed to avoid.

`worker/README.md:138-141` flags rate-limiting `POST /api/monstertime/groups` at the edge, but the GET paths are strictly worse (no POST required, same DDL writes) and are not mentioned. If an edge rule is added it must cover `/api/monstertime/*`, not just the create endpoint.

---

### 4. Renaming the creature has no visible effect until the socket reconnects

`src/net/connection.ts:148-155`

The `'named'` case updates `identity` and nothing else. It never assigns to `this.snapshot.name` and never calls `this.emitSnapshot()`. The nameplate renders `creature.name`, which comes from `deriveCreature(snapshot.genome, snapshot.actions, snapshot.name)` (`src/ui/useGroup.ts:164`), so it can only change when a whole new `snapshot` message arrives.

Failure scenario: Alice types "Bumble", presses Enter, `NamePlate` exits edit mode (`Stage.tsx:148`) and re-renders the unchanged prop, so the button still reads "Give it a name". Bob and Carol see nothing either. The name is correctly stored server-side, so it appears for everyone on the next page load or dropped-socket reconnect, which makes it look like the feature is intermittently broken rather than consistently broken. There is no local optimistic path to cover for it because the client deliberately keeps none.

---

### 5. `actorId` is self-asserted, so any member can post actions as a specific other member

`worker/monstertime.ts:441-450` and `:513-519`

`readClient` (`:208-212`) only shape-checks `actorId` against `/^[A-Za-z0-9_-]{1,64}$/`. The seat is then written verbatim into every `ActionRecord` for both `actorId` and `actorName`. Separately, `present()` (`:627-638`) broadcasts the full `{actorId, actorName}` of everyone connected to every socket in the group, so the ids needed to impersonate are handed to every participant automatically.

Failure scenario: Bob opens devtools on the MonsterTime tab, reads the `present` frame to get Carol's `actorId`, then sends `{"type":"hello","actorId":"<carol's uuid>","actorName":"Carol"}` followed by 40 `act` messages. Those rows go into the log under Carol's id. `src/dna/express.ts` credits expressed traits by `actorId` (`ExpressedTrait.credited`, `types.ts:123`), so the trait that locks in is attributed to Carol in the chronicle and in her bond, and it also consumes Carol's real per-hour allowance so she is told "That is a lot from one person this hour" when she next tries to act. Since the app's stated emotional payload is that a trait is *somebody's*, this is a correctness failure and not just an abuse one.

This is not fixable by validation alone (there are no accounts by design), but it should at least be stated in the README's access-control paragraph, which currently says only that the link is the access control and says nothing about actors being unauthenticated within a group.

---

## Areas I checked and found clean

- **Fallthrough (`handleMonsterTime`, `:241-245`).** Sound. `/api/monstertime-evil`, `/api/monstertime`, and `/api/monstertimex/...` all fail `startsWith('/api/monstertime/')` and return `null`. `/api/monstertime/../foo` is normalised by `new URL` to `/foo` before the check, so it also returns `null`. `/api/monstertime/%2e%2e/x` stays percent-encoded, is claimed, and gets a JSON 404 from `route()` rather than reaching `getByName` (`:249` rejects `parts[0] !== 'groups'`). `request.url` in a Worker is always an absolute URL, so the `new URL` cannot throw; the function has no other synchronous throw site. Anything thrown inside `route()` is an async rejection scoped to that one request, not to the Worker. I did not find a path where an unrelated request gets a `Response` or an exception.
- **Group id entropy (`:53`, `:257`).** Real: `crypto.getRandomValues` over 16 bytes, 128 bits, base64url to 22 characters, minted server-side only. Not guessable, not enumerable, not derived from time. The `GROUP_ID` regex accepting 16-64 characters widens what is *accepted*, not what is *minted*, and every accepted id still has to exist in storage to return anything but a 404. (Its one cost is finding 3.)
- **`variantId` validation.** `worker/monstertime.ts:461` checks `variantById(variantId) === undefined` against the real catalogue before storing, and rejects rather than stores. Correct, and correctly ordered before the insert.
- **`actorName` handling.** Capped at 24 code points by `cleanText` (`:182-190`), which also strips C0/C1 controls and the bidi override range, and cuts by code point so a surrogate pair cannot be split. No `dangerouslySetInnerHTML` or `innerHTML` anywhere in `src/`, so names reach the DOM only through React's escaping.
- **Duplicate delivery.** `src/net/connection.ts:59` and `:175-188`: `seenActionIds` is rebuilt from the snapshot on every `snapshot` message and consulted on every `action`. Server-side, `act()` inserts and broadcasts with no `await` between them (`:523-535`), and a Durable Object is single-threaded, so no interleaving can produce a gap or a reorder. A reconnect that delivers both the fresh snapshot and a re-broadcast of the same action is deduped by id. I could not construct a double-count.
- **Reconnect vs `close()`.** `close()` (`:257-278`) sets `closed` first, clears `retryTimer`, nulls all four handlers before calling `socket.close()`. `open()` (`:79`) and `scheduleReconnect()` (`:205`) both return early on `closed`, and the timer callback goes through `open()`. React strict mode's double mount creates two `SocketConnection` instances and closes the first, which cannot resurrect. No path to two live sockets found.
- **Action cap.** Enforced on the write path at `:469-478`, before the insert, using `MAX(n)` which equals the row count because rows are never deleted. Not skippable by the client; the only way past it is finding 1, which reaches it faster rather than around it.
- **Presence leak.** `present()` derives from `ctx.getWebSockets()` on every call rather than from any retained map, so a socket lost to an unclean close cannot leave a ghost actor. `left()` (`:564-570`) excludes by `sid` rather than by object identity, which is the right call given hibernation.

## One note, not a defect

`src/core/types.ts:100` says the seed is "never sent to the client in full until the creature is adult". It is sent in full to every viewer at connect: `readSnapshot` returns `rollGenome(seed)` (`worker/monstertime.ts:595`) and `rollGenome` returns `{ seed, carried }` (`src/dna/alleles.ts:732`). This is necessary, because `src/forge/view.ts:214` keys the world rebuild on `genome.seed` and `src/forge/materials.ts` derives the group's colours from it. The code is right and the comment is wrong; worth correcting the comment so nobody later builds a hidden-roll feature on an invariant that does not hold.
