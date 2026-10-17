// Mirrors wrangler.toml. Regenerate-able with `wrangler types` once bindings grow.
declare namespace Cloudflare {
  interface Env {
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    OAUTH_KV: KVNamespace;
    OAUTH_PROVIDER: import("@cloudflare/workers-oauth-provider").OAuthHelpers;
    OIDC_CLIENT_ID: string;
    BROKER_SIGNING_KEY: string;
    OIDC_CLIENT_SECRET: string;
    DB: D1Database;
    SESSIONS: R2Bucket;
    ASSETS: Fetcher;
  }
}

interface Env extends Cloudflare.Env {}
