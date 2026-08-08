# MonsterTime

A friend group raises one creature together. Nobody chooses what it looks
like directly: a hidden genome fixed at hatch decides what it could grow, and
the group's own behaviour (feeding it, training it, exploring, singing to it,
giving it objects, tending it) decides which of those possibilities actually
express. Two groups that behave identically still end up with different
animals, because what they could grow was never the same to begin with.

## Running it

This repo is the client only.

    npm install
    npm run dev

That serves the UI at the port in `vite.config.ts` (5196 by default), but the
group's creature lives behind `/api/monstertime/*`, which this dev server
does not answer. Run the site's Worker alongside it, in `tevded-site`:

    npm run dev

(`wrangler dev` under the hood, via that repo's own script). Point this
project at it with `API_ORIGIN` if it is not on the default local port, or
just rely on the proxy already wired up in `vite.config.ts`.

## How the creature is derived

Nothing about a creature's shape is ever stored. The server keeps exactly two
things per group, in a Cloudflare Durable Object: a secret seed, and the
ordered list of actions the group has taken. The creature itself is computed
fresh from those, every time, by every client, so there is nowhere for two
screens to disagree.

The seed rolls a genome at hatch: a handful of alleles carried at each body
locus (horn, ear, wing, tail, and so on), out of a much larger pool. That is
the creature's potential, and it is fixed forever the moment the group is
created. Whether a carried allele ever shows up is a separate question,
answered by pressure. Every action pushes on a small set of pressure axes
(nourish, vigor, roam, resonance, craft, bond, ferocity, stillness), and as
the group's accumulated pressure gets close enough to what a carried allele
responds to, that allele locks in and the trait is credited to whichever
actors pushed hardest for it. Morphs (bulk, limb length, stance, and the
rest) drift continuously with pressure the whole time, so the creature is
visibly changing in between the discrete moments a trait actually locks in.

The result: what a creature could become comes from the seed, what it does
become comes from the specific, ordered thing a specific group of people
did. Neither half repeats across groups, so neither does the creature.

## Status: the body is placeholder

Every trait and morph above resolves correctly today, but nothing has been
drawn yet. The forge renders a creature by looking up each expressed trait
and morph against a registry of parts and asking it for geometry, and right
now that registry answers with placeholder primitives. Authored assets can
replace those placeholder entries one part at a time without touching the
derivation logic at all, because the registry is the entire seam between the
two.

## Deploying

    npm run stage

builds nothing itself; run `npm run build` first. Staging copies `dist` into
`tevded-site/public/monstertime`, replacing whatever was there. That alone is
not a working deploy: MonsterTime also needs `worker/monstertime.ts` wired
into the site's own Worker, with a Durable Object binding for it, or the live
page will load with no creature behind it. `npm run stage` prints a reminder
of that every time. Once both sides are in place, publish from `tevded-site`
with `npm run deploy`.
