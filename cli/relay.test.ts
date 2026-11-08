import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { SignJWT } from "jose";
import { main } from "../skills/share-session/scripts/client.ts";

const LINK = "https://t3.example.com/guest#invite-token";
const key = new TextEncoder().encode("test-only-broker-key-at-least-32-bytes");

/** Broker mode (SESSION_TOKEN), a temp HOME, and a fake API that records every request. */
async function fixture() {
  const temp = await mkdtemp(join(os.tmpdir(), "session-share-relay-"));
  const id = randomUUID();
  const original = process.env.SESSION_TOKEN;
  process.env.SESSION_TOKEN = await new SignJWT({ scope: `write:${id}` }).setProtectedHeader({ alg: "HS256" }).setSubject("alice@example.com")
    .setIssuer("https://sessions-mcp.example.com").setAudience("session-share-cli").setIssuedAt().setExpirationTime("10m").sign(key);
  mock.method(os, "homedir", () => temp);
  mock.method(cp, "execFileSync", () => { throw new Error("no git remote in fixture"); });
  syncBuiltinESMExports();
  const calls: { method: string; path: string; body?: string }[] = [];
  let reply = (_method: string, _path: string, body?: string): Response => {
    const input = JSON.parse(body ?? "{}");
    return Response.json({ id, owner_email: "alice@example.com", project: input.project ?? "team", external_app: input.app, external_url: input.url, external_expires_at: input.expires_at ? Date.parse(input.expires_at) : null });
  };
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = url.replace("https://sessions-mcp.example.com", "");
    const body = typeof init.body === "string" ? init.body : undefined;
    calls.push({ method, path, body });
    return reply(method, path, body);
  });
  const transcript = join(temp, `${id}.jsonl`);
  await writeFile(transcript, [
    { type: "user", sessionId: id, cwd: join(temp, "notes"), gitBranch: "main", version: "2.0.0", message: { content: "Fix login, key sk-ant-abcdefghijklmnopqrstuvwxyz" } },
    { type: "assistant", sessionId: id, message: { id: "m1", model: "claude-test", content: [{ type: "text", text: "PRIVATE TRANSCRIPT BODY" }] } },
  ].map((line) => JSON.stringify(line)).join("\n") + "\n");
  return {
    id, transcript, calls, cwd: join(temp, "notes"),
    manifest: async () => JSON.parse(await readFile(join(temp, ".claude/session-share/manifest.json"), "utf8")),
    reply: (fn: typeof reply) => { reply = fn; },
    cleanup: async () => {
      mock.restoreAll();
      syncBuiltinESMExports();
      if (original === undefined) delete process.env.SESSION_TOKEN;
      else process.env.SESSION_TOKEN = original;
      await rm(temp, { recursive: true, force: true });
    },
  };
}

test("relay sends redacted metadata and the link, never the transcript, and renews from the manifest", async () => {
  const f = await fixture();
  try {
    await assert.rejects(main(["relay", f.id, "--app", "t3code", "--url", LINK]), { code: "project_required" });
    await assert.rejects(main(["relay", f.id, "--app", "t3code", "--url", "http://t3.example.com/guest", "--project", "team"]), { code: "usage" });
    assert.equal(f.calls.length, 0);

    const result = await main(["relay", f.id, "--app", "t3code", "--url", LINK, "--expires", "2030-01-02T03:04:05Z", "--project", "Team", "--transcript", f.transcript]);
    assert.deepEqual(result, {
      id: f.id, owner_email: "alice@example.com", project: "team", external_app: "t3code", external_url: LINK,
      external_expires_at: Date.parse("2030-01-02T03:04:05Z"), url: `https://sessions.example.com/s/${f.id}`,
    });
    const [call] = f.calls;
    assert.equal(call!.method, "PUT");
    assert.equal(call!.path, `/api/sessions/${f.id}/relay`);
    assert.ok(!call!.body!.includes("PRIVATE TRANSCRIPT BODY"));
    assert.ok(!call!.body!.includes("sk-ant-"));
    const body = JSON.parse(call!.body!);
    assert.deepEqual(body, {
      branch: "main", cc_version: "2.0.0", model: "claude-test", title: "Fix login, key [REDACTED:anthropic]", msg_count: 2,
      cwd_base: f.cwd, repo: "notes",
      app: "t3code", url: LINK, expires_at: "2030-01-02T03:04:05.000Z", project: "team",
    });
    assert.deepEqual((await f.manifest()).relays[f.id], { app: "t3code", url: LINK, expires_at: "2030-01-02T03:04:05.000Z", project: "team" });

    await main(["relay", f.id, "--app", "t3code", "--url", LINK, "--transcript", f.transcript, "--title", "Thread name sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"]);
    const renamed = JSON.parse(f.calls.at(-1)!.body!);
    assert.match(renamed.title, /^Thread name \[REDACTED/);

    await main(["relay", f.id, "--app", "t3code", "--url", `${LINK}-renewed`]);
    assert.deepEqual(JSON.parse(f.calls.at(-1)!.body!), { app: "t3code", url: `${LINK}-renewed`, expires_at: null });
    assert.equal((await f.manifest()).relays[f.id].url, `${LINK}-renewed`);
  } finally { await f.cleanup(); }
});

test("sync and hook-stop skip a relay without transcript; stop forgets it; list and pull show the link", async () => {
  const f = await fixture();
  try {
    await main(["relay", f.id, "--app", "t3code", "--url", LINK, "--project", "team"]);
    const before = f.calls.length;
    assert.deepEqual(await main(["sync", f.id]), { id: f.id, relayed: true, synced: false });
    assert.deepEqual(await main(["sync", "--all"]), []);
    const input = mock.method(process.stdin, Symbol.asyncIterator, async function* () {
      yield Buffer.from(JSON.stringify({ session_id: f.id, transcript_path: f.transcript }));
    });
    const out = mock.method(process.stdout, "write", () => true);
    try { await main(["hook-stop"]); } finally { input.mock.restore(); out.mock.restore(); }
    assert.equal(f.calls.length, before);

    f.reply((method, path) => path.endsWith("/bundle")
      ? Response.json({ error: `session is relayed from t3code: no transcript is stored here, open ${LINK}` }, { status: 409 })
      : Response.json({ sessions: [{ id: f.id, title: null, project: "team", repo: "", owner_email: "alice@example.com", last_synced_at: 0, msg_count: 0, external_app: "t3code", external_url: LINK, external_expires_at: null }] }));
    await assert.rejects(main(["pull", f.id]), (error: any) => error.code === "relayed" && error.message.includes(LINK));
    assert.deepEqual(await main(["list"]), [{ id: f.id.slice(0, 8), title: null, project: "team", repo: null, author: "alice@example.com", date: "1970-01-01 00:00", messages: 0, done: null, app: "t3code", url: LINK, expires: null }]);

    assert.deepEqual(await main(["stop", f.id]), { id: f.id, stopped: true, marker: `share-session:opt-out ${f.id}` });
    const manifest = await f.manifest();
    assert.equal(manifest.relays[f.id], undefined);
    assert.ok(manifest.stopped[f.id]);
  } finally { await f.cleanup(); }
});

test("upload --as hosts a transcript under the relay id, then sync keeps that id", async () => {
  const f = await fixture();
  try {
    const relayId = randomUUID();
    await main(["relay", relayId, "--app", "t3code", "--url", LINK, "--project", "team", "--transcript", f.transcript]);
    await assert.rejects(main(["upload", f.transcript, "--as", "not-a-uuid"]), { code: "usage" });
    // The relay picked the project: no --project needed.
    const preview = await main(["upload", f.transcript, "--as", relayId]) as { status: string; preview: { project: string }; confirmation: string };
    assert.equal(preview.status, "confirmation_required");
    assert.equal(preview.preview.project, "team");

    let meta: Record<string, unknown> = {};
    let hosted = 0;
    mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      if (method === "POST") {
        const form = init.body as FormData;
        meta = JSON.parse(form.get("meta") as string);
        hosted = (await (form.get("jsonl") as Blob).arrayBuffer()).byteLength;
        return Response.json({ id: meta.id, project: "team" }, { status: 200 });
      }
      // A server copy that does not match forces sync's full re-upload, which must keep the relay id.
      return Response.json({ id: relayId, bytes: hosted + 1, last_line_hash: null });
    });
    await main(["upload", f.transcript, "--as", relayId, "--confirm", preview.confirmation]);
    assert.equal(meta.id, relayId);
    const manifest = await f.manifest();
    assert.equal(manifest.sessions[relayId].path, f.transcript);
    assert.equal(manifest.sessions[f.id], undefined);
    assert.ok(manifest.relays[relayId]);

    meta = {};
    await main(["sync", relayId]);
    assert.equal(meta.id, relayId);
  } finally { await f.cleanup(); }
});
