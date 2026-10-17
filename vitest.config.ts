import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" }, miniflare: { bindings: { BROKER_SIGNING_KEY: "test-only-broker-key-at-least-32-bytes", OIDC_CLIENT_SECRET: "test-only-oidc-secret" } } })],
  test: { include: ["test/**/*.test.ts"], setupFiles: ["./test/setup.ts"] },
});
