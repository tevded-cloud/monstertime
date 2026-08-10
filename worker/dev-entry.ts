// dev-entry.ts: LOCAL ONLY. The Worker that `npm run dev:api` runs.
//
// On tevded.com there is no such file. MonsterTime is one branch inside the
// site's own worker/index.ts, which gives handleMonsterTime first refusal and
// falls through to the asset server for everything else (worker/README.md has
// the exact patch). This file is the smallest possible stand-in for that host,
// and its only job is to make the same two calls the real host will make, in
// the same order, so that a bug in the seam shows up here rather than on a
// domain shared with fifteen other apps.
//
// The fallthrough below is where the two differ, and it differs on purpose. The
// real host hands anything that is not ours to env.ASSETS. There are no assets
// here (the UI is served by Vite on 5196 and proxied in), so a request that
// reaches this line is a request that was pointed at the wrong port, and saying
// so plainly beats a 404 that reads like the API refusing a real call.
import { handleMonsterTime, MonsterGroup, type MonsterEnv } from './monstertime'

export { MonsterGroup }

export default {
  fetch(request: Request, env: MonsterEnv): Response | Promise<Response> {
    // Exactly as the site worker will do it: null means not ours, and it
    // arrives without awaiting, so "not mine" is never confused with
    // "mine, answer pending".
    const monster = handleMonsterTime(request, env)
    if (monster !== null) return monster

    return new Response(
      'monstertime dev API. Only /api/monstertime/* lives here; the UI is on 5196.\n',
      { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  },
} satisfies ExportedHandler<MonsterEnv>
