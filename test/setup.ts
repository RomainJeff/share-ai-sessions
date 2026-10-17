import { env } from "cloudflare:test";
import { beforeAll } from "vitest";
import migration from "../migrations/0001_sessions.sql?raw";

// ponytail: one migration, applied straight from source. Switch to readD1Migrations +
// applyD1Migrations when a second one needs ordering.
beforeAll(async () => {
  for (const stmt of migration.split(";").map((s) => s.trim()).filter((s) => s && !/^--[^\n]*$/.test(s))) {
    await env.DB.prepare(stmt).run();
  }
});
