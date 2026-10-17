import { env } from "cloudflare:test";
import { beforeAll } from "vitest";
import syncMigration from "../migrations/0002_sync.sql?raw";
import migration from "../migrations/0001_sessions.sql?raw";
import continuationMigration from "../migrations/0003_continuations.sql?raw";
import projectsMigration from "../migrations/0004_projects.sql?raw";
import { ALICE, BOB } from "./jwt";

// Apply the schema migrations in order in the isolated local D1 instance.
beforeAll(async () => {
  for (const stmt of [migration, syncMigration, continuationMigration, projectsMigration].join(";\n").split(";").map((s) => s.trim()).filter((s) => s && !/^--[^\n]*$/.test(s))) {
    await env.DB.prepare(stmt).run();
  }
  // Shared project most tests upload into; projects.test.ts covers the rights themselves.
  await env.DB.prepare("INSERT INTO projects (slug, name, created_by, created_at) VALUES ('team', 'Team', ?, 0)").bind(ALICE).run();
  for (const email of [ALICE, BOB]) {
    await env.DB.prepare("INSERT INTO project_members VALUES ('team', ?, 'writer', 'test', 0)").bind(email).run();
  }
});
