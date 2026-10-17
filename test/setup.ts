import { env } from "cloudflare:test";
import { beforeAll } from "vitest";
import syncMigration from "../migrations/0002_sync.sql?raw";
import migration from "../migrations/0001_sessions.sql?raw";
import continuationMigration from "../migrations/0003_continuations.sql?raw";

// Apply the schema migrations in order in the isolated local D1 instance.
beforeAll(async () => {
  for (const stmt of [migration, syncMigration, continuationMigration].join(";\n").split(";").map((s) => s.trim()).filter((s) => s && !/^--[^\n]*$/.test(s))) {
    await env.DB.prepare(stmt).run();
  }
});
