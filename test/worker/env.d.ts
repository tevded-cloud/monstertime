// What `env` is inside a worker test.
//
// The pool hands tests the same bindings the Worker gets, and types that as
// `Cloudflare.Env`, which is the namespace wrangler generates and which is
// empty here because this project does not generate it. Without this, a test
// reaching for a Durable Object stub is a compile error while passing perfectly
// well at runtime, which is the worst of both.

import type { MonsterEnv } from '../../worker/monstertime'

declare global {
  namespace Cloudflare {
    interface Env extends MonsterEnv {}
  }
}

export {}
