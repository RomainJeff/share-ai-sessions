import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { main } from "../skills/share-session/scripts/client.ts";
import { CONFIG_PATH } from "../skills/share-session/scripts/lib.ts";

async function fixture(t: TestContext) {
  const home = await mkdtemp(join(os.tmpdir(), "session-share-pull-"));
  const cwd = join(home, 'local.repo_à "quoted$&$$"\\path');
  const originalRead = fs.readFile;
  const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT;
  const token = process.env.SESSION_TOKEN;
  delete process.env.SESSION_TOKEN;
  delete process.env.CLAUDE_CODE_ENTRYPOINT;
  t.mock.method(os, "homedir", () => home);
  t.mock.method(process, "cwd", () => cwd);
  t.mock.method(fs, "readFile", (...args: Parameters<typeof readFile>) => args[0] === CONFIG_PATH ? Promise.resolve('{"baseUrl":"https://sessions.test"}') : originalRead(...args));
  t.mock.method(cp, "execFileSync", (command: string) => {
    if (command === "cloudflared") return "never.persist.this";
    throw new Error("no remote");
  });
  syncBuiltinESMExports();
  t.after(async () => {
    if (entrypoint === undefined) delete process.env.CLAUDE_CODE_ENTRYPOINT;
    else process.env.CLAUDE_CODE_ENTRYPOINT = entrypoint;
    if (token === undefined) delete process.env.SESSION_TOKEN;
    else process.env.SESSION_TOKEN = token;
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await rm(home, { recursive: true, force: true });
  });
  const id = randomUUID();
  const session = { id, owner_email: "alice@example.com", owner_name: "Alice", project: "acme/repo", branch: "feature", cwd_base: "/home/user/repo.old" };
  const row = (type: string, uuid: string, parentUuid: string | null, content: unknown) => ({
    type, uuid, parentUuid, sessionId: id, cwd: session.cwd_base, version: "2.1.302", entrypoint: "remote_mobile", gitBranch: "feature",
    message: { role: type, content },
  });
  const jsonl = [
    row("user", "u1", null, `Read ${session.cwd_base}/file and -home-user-repo-old/${id}/tool-results/output.txt`),
    row("assistant", "a1", "u1", [{ type: "thinking", thinking: "private", signature: "signed" }]),
    row("assistant", "a2", "a1", [{ type: "redacted_thinking", data: "hidden" }]),
    row("assistant", "a3", "a2", [{ type: "thinking", thinking: "remove me" }, { type: "tool_use", id: "tool-1", name: "Read", input: { path: `${session.cwd_base}/file` } }]),
    row("user", "u2", "a2", [{ type: "tool_result", tool_use_id: "tool-1", content: "result" }]),
    row("assistant", "a4", "u2", [{ type: "thinking", thinking: "tail" }]),
    { type: "ai-title", sessionId: id, aiTitle: "Original" },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n";
  const tool_results: Record<string, string> = { "nested/output.txt": Buffer.from("complete output 🦓").toString("base64") };
  const bundle = { session, jsonl, tool_results };
  const requests: { url: string; meta?: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const request: (typeof requests)[number] = { url: String(url) };
    requests.push(request);
    if (init?.method === "POST") {
      request.meta = JSON.parse(String((init.body as FormData).get("meta")));
      return Response.json({ id: request.meta!.id });
    }
    if (String(url).endsWith("/bundle")) return Response.json(bundle);
    throw new Error("unexpected request");
  });
  return { home, cwd, id, bundle, requests };
}

test("pull transplants ids and both cwd forms, removes thinking with re-chaining, and appends context", async (t) => {
  const f = await fixture(t);
  const result = await main(["pull", f.id]) as { id: string; path: string; command: string; target: string };
  assert.match(result.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(result.id, f.id);
  assert.equal(result.path, join(f.home, ".claude/projects", f.cwd.replace(/[^A-Za-z0-9]/g, "-"), `${result.id}.jsonl`));
  assert.equal(result.command, `claude --resume ${result.id}`);
  assert.equal(result.target, "terminal");
  assert.equal(f.requests[0]!.url, `https://sessions.test/api/sessions/${f.id}/bundle`);
  const text = await readFile(result.path, "utf8");
  const rows = text.trimEnd().split("\n").map((r) => JSON.parse(r));
  const context = rows.pop();
  assert.deepEqual(rows.filter((r) => r.uuid).map((r) => [r.uuid, r.parentUuid]), [["u1", null], ["a3", "u1"], ["u2", "u1"]]);
  assert.ok(rows.every((r) => r.sessionId === result.id));
  assert.equal(rows[0].cwd, f.cwd);
  assert.equal(rows[0].message.content, `Read ${f.cwd}/file and ${f.cwd.replace(/[^A-Za-z0-9]/g, "-")}/${result.id}/tool-results/output.txt`);
  assert.equal(rows[1].message.content[0].input.path, `${f.cwd}/file`);
  assert.deepEqual(rows[1].message.content.map((b: { type: string }) => b.type), ["tool_use"]);
  assert.ok(!text.includes('"thinking"') && !text.includes('"redacted_thinking"'));
  assert.equal(context.parentUuid, "u2");
  assert.equal(context.isMeta, true);
  assert.equal(context.isSidechain, false);
  assert.equal(context.type, "user");
  assert.equal(context.message.role, "user");
  assert.equal(context.sessionId, result.id);
  assert.equal(context.cwd, f.cwd);
  assert.equal(context.entrypoint, "remote_mobile");
  assert.equal(context.version, "2.1.302");
  assert.equal(context.gitBranch, "feature");
  assert.ok(!Number.isNaN(Date.parse(context.timestamp)));
  assert.notEqual(context.uuid, result.id);
  const note = context.message.content[0].text;
  for (const value of ["<session-share-context>", "</session-share-context>", f.id, "Alice", "alice@example.com", "acme/repo", "feature", f.bundle.session.cwd_base, f.cwd, "paths", "access", "environment"]) assert.ok(note.includes(value), value);
  assert.equal(await readFile(join(result.path.slice(0, -6), "tool-results/nested/output.txt"), "utf8"), "complete output 🦓");
  const manifest = JSON.parse(await readFile(join(f.home, ".claude/session-share/manifest.json"), "utf8"));
  assert.equal(manifest.forks[result.id].forked_from, f.id);
  assert.equal(manifest.sessions[result.id], undefined, "pull alone must not opt in to sync");
  await writeFile(result.path, text + JSON.stringify({ type: "user", sessionId: result.id, cwd: f.cwd, message: { content: "Continue locally" } }) + "\n");
  const preview = await main(["upload", result.path]) as { confirmation: string };
  await main(["upload", result.path, "--confirm", preview.confirmation]);
  assert.equal(f.requests.at(-1)!.meta!.forked_from, f.id);
  const again = await main(["upload", result.path]) as { confirmation: string };
  await main(["upload", result.path, "--confirm", again.confirmation]);
  assert.equal(f.requests.at(-1)!.meta!.forked_from, f.id, "tracking an upload must retain provenance");
});

test("pull detects the surface, rejects unverified Desktop, and allows terminal override/fallback", async (t) => {
  const f = await fixture(t);
  for (const entrypoint of ["desktop", "claude-desktop"]) {
    process.env.CLAUDE_CODE_ENTRYPOINT = entrypoint;
    await assert.rejects(main(["pull", f.id]), { code: "unsupported_target", message: /Desktop.*verification/i });
  }
  assert.equal(f.requests.length, 0);
  const forced = await main(["pull", f.id, "--target", "terminal"]) as { target: string };
  assert.equal(forced.target, "terminal");
  for (const entrypoint of ["cli", "remote_mobile", "unknown"]) {
    process.env.CLAUDE_CODE_ENTRYPOINT = entrypoint;
    assert.equal((await main(["pull", f.id]) as { target: string }).target, "terminal");
  }
  await assert.rejects(main(["pull", f.id, "--target", "desktop"]), { code: "unsupported_target" });
  await assert.rejects(main(["pull", f.id, "--target", "other"]), { code: "usage" });
  await assert.rejects(main(["pull", "../escape"]), { code: "usage" });
});

test("pull refuses malformed transcripts and tool-result paths before writing a fork", async (t) => {
  const f = await fixture(t);
  f.bundle.tool_results = { "../escape.txt": Buffer.from("bad").toString("base64") };
  await assert.rejects(main(["pull", f.id]), { code: "invalid_bundle" });
  f.bundle.tool_results = {};
  f.bundle.jsonl = '{"unfinished":';
  await assert.rejects(main(["pull", f.id]), { code: "invalid_jsonl" });
  await assert.rejects(readFile(join(f.home, ".claude/session-share/manifest.json")), { code: "ENOENT" });
});
