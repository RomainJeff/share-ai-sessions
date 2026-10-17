// Mirrors wrangler.toml. Regenerate-able with `wrangler types` once bindings grow.
declare namespace Cloudflare {
  interface Env {
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    DB: D1Database;
    SESSIONS: R2Bucket;
  }
}

interface Env extends Cloudflare.Env {}
