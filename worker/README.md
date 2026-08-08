# The MonsterTime server

One Durable Object per friend group. It stores a seed and an ordered list of
what people did, and nothing else: the creature is a pure function of those two
and is computed on every screen, never here.

`worker/monstertime.ts` is a self-contained module for the tevded.com site
Worker to import. It exports:

- `handleMonsterTime(request, env)` returns `null` for any path outside
  `/api/monstertime/`, so the site falls through to static assets. It is not
  async, so the `null` arrives without awaiting.
- `class MonsterGroup`, the Durable Object.
- `interface MonsterEnv { MONSTER_GROUP: DurableObjectNamespace<MonsterGroup> }`

## Endpoints

| Method and path | Answer |
| --- | --- |
| `POST /api/monstertime/groups` | `201 { "groupId": "<22 chars>" }`. Mints the id (128 bits of crypto randomness, base64url) and the seed (32 crypto-random bytes as hex). Neither is ever accepted from a client. |
| `GET /api/monstertime/groups/:id` | `200` with the `GroupSnapshot` as JSON, `404 { "error": ... }` if no such group. For a cold load, so the first paint does not wait on the socket. |
| `GET /api/monstertime/groups/:id/socket` | `101` WebSocket upgrade. `426` without an `Upgrade: websocket` header, `404` if no such group. |
| anything else under the prefix | `404 { "error": ... }` |

HTTP errors are `{ "error": "<plain sentence>" }`. Socket errors are the
contract's `{ type: 'error', message }`.

The link is the access control. There are no accounts: anybody holding the id
is in the group, which is why the id is unguessable rather than merely unique.

## The socket

Server sends `snapshot` on connect without waiting for anything, then `action`,
`named` and `present` as they happen. `action` goes to everybody **including**
the person who did it, because the order of the log is the creature and the
actor has to take the server's ordering rather than guess at it locally.

Client sends `hello`, `act` and `name` (`ClientMessage` in `src/core/types.ts`).
`hello` is what puts somebody in the present list; `act` and `name` are refused
until it arrives.

Two extras that are not in the type contract:

- The literal string `ping` is answered with `pong` by the runtime itself,
  without waking the object. A client that wants a keepalive should use it and
  nothing else, because anything else costs money.
- Close code `1008` means the connection sent far more messages than a person
  can produce and was cut off.

## What it stores

SQLite backend, two tables.

- `meta(k, v)`: `groupId`, `seed`, `createdAt`, and `name` once somebody sets one.
- `actions(n, id, variantId, actorId, actorName, at)` with an index on
  `(actorId, at)`. `n` is the order and the order is the creature.

The id and the timestamp on every action are written by the object; anything the
client sent along is dropped. Unknown `variantId`s are rejected against the real
catalogue in `src/dna`, never stored. The log is capped at 5000.

Rate limits are per actor and are read back out of the log rather than kept
anywhere, so they survive hibernation for nothing: one action per 10 seconds,
4 per minute, 40 per hour. A per connection flood guard (40 messages per 10
seconds) sits in front so a runaway client cannot reach the SQL at all.

The genome is **not** stored. It is re-rolled from the seed with `rollGenome`
from `src/dna` on every read, so there is exactly one copy of the genetics and
no server copy that can drift from the client's.

## What tevded-site has to add

Four changes, all by hand. The site is already deployed with a `migrations`
array for ColorTime's `Room`, so keep using `migrations`: Cloudflare supports
the newer declarative `exports` field instead, but a Worker may use only one of
the two and moving to `exports` is one way.

**1. `wrangler.jsonc`, the binding.** Add to the existing `durable_objects`:

```jsonc
"durable_objects": {
  "bindings": [
    { "name": "ROOMS", "class_name": "Room" },
    { "name": "MONSTER_GROUP", "class_name": "MonsterGroup" }
  ]
}
```

**2. `wrangler.jsonc`, the migration.** Append a new tag. Do not edit `v1`:

```jsonc
"migrations": [
  // SQLite backed, which is what puts rooms on the free plan.
  { "tag": "v1", "new_sqlite_classes": ["Room"] },
  { "tag": "v2", "new_sqlite_classes": ["MonsterGroup"] }
]
```

**3. `wrangler.jsonc`, `run_worker_first`. This one is not optional.** It
currently names the room path alone, so nothing under `/api/` would ever wake
the script and every API call would be answered by the single page fallback
with `index.html`, which a `fetch()` reads as a JSON parse error:

```jsonc
"run_worker_first": ["/colortime/room/*", "/api/monstertime/*"]
```

**4. `worker/index.ts`.** Re-export the class and give the handler first refusal.
It must run before the `ROOM_PREFIX` check, and its `null` is what preserves
today's behaviour for the whole rest of the domain:

```ts
import { MonsterGroup, handleMonsterTime, type MonsterEnv } from '../../monstertime/worker/monstertime'

export { Room, MonsterGroup }

interface Env extends RoomEnv, MonsterEnv {
  ASSETS: Fetcher
}

// inside fetch, first thing:
const monster = handleMonsterTime(request, env)
if (monster !== null) return monster
```

The import path is the one real trap. `monstertime.ts` imports `../src/dna/index`
and `../src/core/types`, so wherever the file ends up, `worker/` and `src/` have
to stay siblings. Either reach across to the monstertime repo as above, or copy
`worker/monstertime.ts`, `src/core/` and `src/dna/` over together. Copying half
of it gives a module that resolves nothing.

## Two more things worth doing

- **Typecheck.** `tsconfig.worker.json` in this repo covers `worker/` against
  `@cloudflare/workers-types`. It needs adding to `tsconfig.json`'s `references`
  or nothing checks it. (tevded-site has the same file and does not reference
  it, so its Worker is currently unchecked by `npm run build`.)
- **Rate limit the create endpoint at the edge.** `POST /api/monstertime/groups`
  writes storage on every call and there is no per caller state available to
  throttle it against inside a Worker. A Cloudflare rate limiting rule on
  `/api/monstertime/*` is the right place, and it is on the free plan.

## Cost

Checked against the current docs, August 2026:

- SQLite backed Durable Objects are available on the Workers **free** plan, and
  are the only backend available there. Free limits are 100k requests/day,
  13,000 GB-s/day, 5M SQL rows read/day, 100k rows written/day and 5 GB stored.
- Billable duration does not accrue while an object is hibernating. Sockets are
  accepted with `ctx.acceptWebSocket()` and the handlers are
  `webSocketMessage` / `webSocketClose` / `webSocketError`, so a group nobody is
  looking at is evicted from memory with everybody still connected and costs
  nothing until somebody does something.
