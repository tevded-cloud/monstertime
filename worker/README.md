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
| `GET /api/monstertime/groups/:id/socket` | `101` WebSocket upgrade. `426` without an `Upgrade: websocket` header, `404` if no such group, `503` if the group already has 64 sockets open. |
| anything else under the prefix | `404 { "error": ... }` |

HTTP errors are `{ "error": "<plain sentence>" }`. Socket errors are the
contract's `{ type: 'error', message }`.

## Access control, and what it does not cover

The link is the access control. There are no accounts: anybody holding the id
is in the group, which is why the id is unguessable rather than merely unique.
That is the whole of it, and the rest of this section is the part that is easy
to assume and is not true.

**Inside a group, nobody is authenticated.** `actorId` is a string the client
invents and keeps in local storage. The server shape-checks it and nothing
else, because with no accounts there is nothing to check it against. Two things
follow, and both are real:

- **Anybody in a group can act as anybody else in that group.** The ids needed
  to do it are handed out by design: `present` carries every connected member's
  `actorId`, and so does every action in the snapshot, because bonds and trait
  credit are keyed by it. So a member who opens devtools can post actions under
  another member's id. The trait that locks in is then credited to that person
  in the chronicle, and it spends their per hour allowance rather than the
  impersonator's. Since a trait being *somebody's* is the emotional payload of
  the whole app, this is a correctness limit and not only an abuse one.
- **What is bounded is a connection, not a person.** A socket takes an
  `actorId` from its first `hello` and will not change it afterwards: a second
  `hello` with a different id is refused. That is what makes the per person
  limits mean anything at all (they used to be re-keyable immediately before
  each action, which made them decorative), but it binds the id to the wire,
  not to a human. Somebody who wants to be a different actor opens a different
  socket, which is why the limits that have to hold against deliberate misuse
  are the whole group ones below rather than the per person ones.

Nothing here can be fixed by validation. It needs identity, and identity means
accounts, which this app has decided against. If that decision ever changes,
this is the paragraph that changes with it.

## The socket

Server sends `snapshot` on connect without waiting for anything, then `action`,
`named` and `present` as they happen. `action` goes to everybody **including**
the person who did it, because the order of the log is the creature and the
actor has to take the server's ordering rather than guess at it locally.

Client sends `hello`, `act` and `name` (`ClientMessage` in `src/core/types.ts`).
`hello` is what puts somebody in the present list; `act` and `name` are refused
until it arrives.

**`hello` binds the connection to one `actorId`, once.** Sending it again with
the same id is fine and is how somebody changes their display name. Sending it
with a different id gets an `error` and changes nothing, so being somebody else
means opening another socket. Why that matters is under access control above.

Two extras that are not in the type contract:

- The literal string `ping` is answered with `pong` by the runtime itself,
  without waking the object. A client that wants a keepalive should use it and
  nothing else, because anything else costs money.
- Close code `1008` means the connection sent far more messages than a person
  can produce and was cut off.

One `error` is sent to the whole group rather than to whoever caused it: the
warning that the action log is 100 from full. It is not addressed to anybody
because it is not anybody's fault, and there is no separate message type in the
contract for something the group needs to be told.

## What it stores

SQLite backend, two tables.

- `meta(k, v)`: `groupId`, `seed`, `createdAt`, `name` once somebody sets one,
  and two counters described under the limits below (`actors`, `stage`).
- `actions(n, id, variantId, actorId, actorName, at)` with an index on
  `(actorId, at)`. `n` is the order and the order is the creature.

**The tables are made by `create()`, not by the constructor.** This matters more
than it reads. A Durable Object is instantiated by the act of asking about it,
so with the DDL in the constructor every request to a group id that does not
exist spun up a fresh object and wrote three statements to it before deciding
the answer was 404. That is a stranger being able to make this app write storage
in a loop, out of an allowance shared with everything else on the domain. Now a
probe of a group that was never created reads one query, writes nothing, and is
gone. See the edge rule below, which is what covers the request count itself.

The id and the timestamp on every action are written by the object; anything the
client sent along is dropped. Unknown `variantId`s are rejected against the real
catalogue in `src/dna`, never stored.

## Limits

Everything except the flood guard is read back out of the log, out of `meta` or
out of `ctx.getWebSockets()` rather than kept in a variable, so none of it is
lost when the object is evicted. The flood guard is the one exception and is in
memory on purpose: eviction only follows idleness, and an idle connection has no
flood to remember.

| Limit | Value | Counted against |
| --- | --- | --- |
| Cooldown | 1 action per 10s | one `actorId` |
| Per person burst | 4 per minute | one `actorId` |
| Per person hour | 40 per hour | one `actorId` |
| Whole group burst | 12 per minute | every row, whoever wrote it |
| Whole group hour | 120 per hour | every row, whoever wrote it |
| People in a group | 48 distinct `actorId`s ever | the log |
| Open sockets | 64 at once | the object |
| Messages | 40 per 10s | one connection |
| Lifetime | 5000 actions | the log |

The per person rows are the design ones: a creature grown by one person doing
everything is not what this app is for. The whole group rows are the security
ones, and they exist because an `actorId` is a name the client chose. A socket
is bound to the first id it says and refuses to change it, but a second socket
can say a different one, so any limit that has to hold against somebody
deliberately trying has to be counted without reference to who anybody is.

Numbers, because they are the point: before the group limits, a script holding
the link could send `hello` and `act` in a loop and reach 5000 in about 40
minutes on one socket, or a few minutes across ten, after which every real
member is refused forever. With them, 5000 takes over 41 hours of unbroken
effort and no amount of parallelism helps, because the ceiling is on the log and
not on the caller.

**The 5000 is terminal and cannot be undone.** There is no delete and no reset,
and there should not be one, because the log IS the creature: nothing could be
removed to make room without making it a different animal. What is there instead
is a warning broadcast to everybody once, 100 actions out, so that a group finds
out their creature's life is nearly complete before the day it is, rather than
by pressing a button and being refused. Past the cap the refusal says so and
says that starting a new group is the only thing left.

The `actors` counter in `meta` is the number of distinct people who have ever
acted. It is incremented at the one place that inserts rather than counted,
because a `COUNT(DISTINCT)` on the way in is a scan of the index; it cannot
drift, since rows are never deleted.

## Stage gating

Four of the 36 variants carry a `minStage` and the server enforces it. The client
only offers what the creature is old enough for, but a hand-rolled client can
send anything, and an action stored out of its stage is a pressure the design
says the animal cannot feel yet, sitting in the log permanently.

The server therefore has to know the stage, and it gets it by deriving the
creature from its own log with `deriveCreature` from `src/dna`, the same call
every screen makes. There is no second copy of the genetics here and there must
never be one: this file must not learn what a stage threshold is.

Deriving costs a read of the whole log, so the answer is written to `meta` as
`stage`. That is a high water mark, not a cache, and it cannot go stale: stage
is a function of how many actions there are, that number only goes up, so a
stage once reached is reached forever. The derivation is also the last check in
`act`, after every cheap reason to refuse, so a rate limited client cannot make
the server do it.

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
- **Rate limit `/api/monstertime/*` at the edge. Not just the create
  endpoint.** A Cloudflare rate limiting rule on the whole prefix is the right
  place and it is on the free plan. The prefix, rather than
  `POST /api/monstertime/groups`, because the read paths are the worse ones: no
  POST is needed, the ids can be random, and every one of them still costs a
  Worker request and a Durable Object request out of an allowance shared with
  the rest of the domain. There is no per caller state inside a Worker to
  throttle any of it against, which is why this has to happen in front.

  Since `run_worker_first` claims the prefix, every request under it wakes the
  script whether or not the group exists, so this rule is the only thing that
  bounds the request count. What the code can do about it, it does: an id that
  was never minted now writes nothing at all (see What it stores).

### Why ids are not signed

The obvious way to make an unknown id rejectable without touching the Durable
Object is to mint ids carrying an HMAC tag and verify it in the Worker. It was
considered and deliberately not done, because the tag would make every group's
link valid only for as long as one secret survives. Rotate or lose that secret
and every creature every group has raised becomes unreachable in one step, with
no recovery, which is a far worse version of exactly the failure this file
spends its limits guarding against. The edge rule above covers the same ground
without holding all the links hostage to a binding.

If that trade is ever revisited, it needs a real secret binding and a stated
never-rotate policy, and both belong here in writing before any code changes.

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
