import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { SignJWT } from "jose";
import { main } from "../skills/share-session/scripts/client.ts";

const key = new TextEncoder().encode("test-only-broker-key-at-least-32-bytes");
const token = () => new SignJWT({ scope: "projects" }).setProtectedHeader({ alg: "HS256" }).setSubject("alice@example.com")
  .setIssuer("https://sessions-mcp.example.com").setAudience("session-share-cli").setIssuedAt().setExpirationTime("10m").sign(key);

test("project subcommands map to the projects API and surface server reasons", async (t) => {
  const original = process.env.SESSION_TOKEN;
  process.env.SESSION_TOKEN = await token();
  t.after(() => { if (original === undefined) delete process.env.SESSION_TOKEN; else process.env.SESSION_TOKEN = original; });
  const calls: [string, string, unknown][] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
    calls.push([init.method ?? "GET", url.replace("https://sessions-mcp.example.com", ""), init.body ? JSON.parse(String(init.body)) : undefined]);
    if (url.endsWith("/members/carol%40example.com") && init.method === "DELETE") return Response.json({ error: "a project keeps at least one owner" }, { status: 409 });
    return Response.json({ ok: true });
  });
  await main(["project", "list"]);
  await main(["project", "create", "notes", "--name", "Notes"]);
  await main(["project", "show", "notes"]);
  const added = await main(["project", "add", "notes", "bob@example.com", "--role", "writer"]) as { reminder: string };
  await main(["project", "add", "notes", "dan@example.com"]);
  assert.match(added.reminder, /Cloudflare Access policy/);
  await assert.rejects(main(["project", "remove", "notes", "carol@example.com"]), { code: "conflict", message: "a project keeps at least one owner" });
  await assert.rejects(main(["project", "add", "notes", "bob@example.com", "--role", "admin"]), { code: "usage" });
  await assert.rejects(main(["project", "create"]), { code: "usage" });
  assert.deepEqual(calls, [
    ["GET", "/api/projects", undefined],
    ["POST", "/api/projects", { slug: "notes", name: "Notes" }],
    ["GET", "/api/projects/notes", undefined],
    ["PUT", "/api/projects/notes/members/bob%40example.com", { role: "writer" }],
    ["PUT", "/api/projects/notes/members/dan%40example.com", { role: "reader" }],
    ["DELETE", "/api/projects/notes/members/carol%40example.com", undefined],
  ]);
});

test("a first upload must name its project, and the preview shows it", async (t) => {
  const dir = await mkdtemp(join(os.tmpdir(), "session-share-project-"));
  t.mock.method(os, "homedir", () => dir);
  syncBuiltinESMExports();
  t.after(async () => { t.mock.restoreAll(); syncBuiltinESMExports(); await rm(dir, { recursive: true, force: true }); });
  t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected network"); });
  const path = join(dir, "s.jsonl");
  await writeFile(path, JSON.stringify({ type: "user", sessionId: crypto.randomUUID(), message: { content: "hi" } }) + "\n");
  await assert.rejects(main(["upload", path]), { code: "project_required" });
  const preview = await main(["upload", path, "--project", "Notes"]) as { preview: { project: string } };
  assert.equal(preview.preview.project, "notes");
});
