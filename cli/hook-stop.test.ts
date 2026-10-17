import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, appendFile, rm } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../../../.agents/skills/share-session/scripts/client.ts";
import { upload } from "../../../.agents/skills/share-session/scripts/commands/upload.ts";
import { stop } from "../../../.agents/skills/share-session/scripts/commands/stop.ts";
import { CONFIG_PATH } from "../../../.agents/skills/share-session/scripts/lib.ts";

async function syncFixture() {
  const temp = await mkdtemp(join(os.tmpdir(), "session-share-hook-"));
  const id = randomUUID();
  const path = join(temp, ".claude/projects/test", `${id}.jsonl`);
  const manifest = join(temp, ".claude/session-share/manifest.json");
  await mkdir(join(temp, ".claude/projects/test"), { recursive: true });
  const line = (value: string) => JSON.stringify({ type: "user", sessionId: id, message: { content: value } }) + "\n";
  let remote = "";
  let fetches = 0;
  let authCalls = 0;
  let tokenMissing = false;
  let status = 200;
  let networkError = false;
  const originalToken = process.env.SESSION_TOKEN;
  delete process.env.SESSION_TOKEN;
  const originalReadFile = fs.readFile;
  mock.method(os, "homedir", () => temp);
  mock.method(fs, "readFile", (...args: Parameters<typeof readFile>) => args[0] === CONFIG_PATH ? Promise.resolve('{"baseUrl":"https://sessions.test"}') : originalReadFile(...args));
  mock.method(cp, "execFileSync", (command: string) => {
    if (command !== "cloudflared") throw new Error("no git remote in fixture");
    authCalls++;
    if (tokenMissing) throw new Error("no cached token");
    return "never.persist.this";
  });
  syncBuiltinESMExports();
  mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    fetches++;
    if (networkError) throw new Error("private upstream error");
    if (status !== 200) return new Response(null, { status });
    const method = init.method ?? "GET";
    if (method === "GET") {
      const last = remote.trimEnd().split("\n").at(-1)! + "\n";
      return Response.json({ bytes: Buffer.byteLength(remote), last_line_hash: remote ? createHash("sha256").update(last).digest("hex") : null });
    }
    const body = init.body instanceof FormData ? await (init.body.get("jsonl") as Blob).text() : await new Response(init.body).text();
    if (method === "PATCH") {
      assert.equal(new Headers(init.headers).get("X-Base-Offset"), String(Buffer.byteLength(remote)));
      remote += body;
    } else {
      assert.equal(method, "POST");
      remote = body;
    }
    return Response.json({ id, bytes: Buffer.byteLength(remote) });
  });
  return {
    temp, id, path, manifest, line,
    remote: () => remote,
    /** Manifest entry as left by a consented upload; the only opt-in the hook honours. */
    optIn: async (strip = {}) => {
      await mkdir(join(temp, ".claude/session-share"), { recursive: true });
      await writeFile(manifest, JSON.stringify({ sessions: { [id]: { id, path, offset: 0, last_line_hash: "", url: "", strip } } }));
    },
    fetches: () => fetches,
    authCalls: () => authCalls,
    missingToken: () => { tokenMissing = true; },
    status: (value: number) => { status = value; },
    networkError: () => { networkError = true; },
    invoke: async (stop_hook_active = false, transcript_path = path, raw?: string) => {
      let stdout = "";
      let stderr = "";
      const input = mock.method(process.stdin, Symbol.asyncIterator, async function* () {
        yield Buffer.from(raw ?? JSON.stringify({ session_id: id, transcript_path, stop_hook_active }));
      });
      const out = mock.method(process.stdout, "write", (chunk: string | Uint8Array) => { stdout += chunk.toString(); return true; });
      const err = mock.method(process.stderr, "write", (chunk: string | Uint8Array) => { stderr += chunk.toString(); return true; });
      try {
        await main(["hook-stop"]);
        return { stdout, stderr };
      } finally {
        input.mock.restore();
        out.mock.restore();
        err.mock.restore();
      }
    },
    cleanup: async () => {
      mock.restoreAll();
      syncBuiltinESMExports();
      if (originalToken === undefined) delete process.env.SESSION_TOKEN;
      else process.env.SESSION_TOKEN = originalToken;
      await rm(temp, { recursive: true, force: true });
    },
  };
}

test("non-opted-in Stop does not authenticate, fetch or print", async () => {
  const f = await syncFixture();
  try {
    await writeFile(f.path, f.line(`share-session:opt-in ${randomUUID()}`));
    assert.deepEqual(await f.invoke(), { stdout: "", stderr: "" });
    assert.equal(f.fetches(), 0);
    assert.equal(f.authCalls(), 0);
  } finally { await f.cleanup(); }
});

test("three Stop turns silently sync sanitized bytes for a manifest opt-in", async () => {
  const f = await syncFixture();
  try {
    await writeFile(f.path, f.line("start"));
    const { confirmation } = await upload(f.path) as { confirmation: string };
    await upload(f.path, { confirm: confirmation });
    let expected = f.line("start");
    const secret = "ghp_" + "G".repeat(36);
    for (const value of ["départ 🦓", `token ${secret}`, "third turn"]) {
      await appendFile(f.path, f.line(value));
      expected += f.line(value.replace(secret, "[REDACTED:github]"));
      assert.deepEqual(await f.invoke(), { stdout: "", stderr: "" });
      assert.equal(f.remote(), expected);
    }
    assert.ok(!(await readFile(f.manifest, "utf8")).includes("never.persist.this"));
  } finally { await f.cleanup(); }
});

test("Stop ignores a transcript opt-in marker without a manifest entry", async () => {
  const f = await syncFixture();
  try {
    await writeFile(f.path, f.line(`share-session:opt-in ${f.id} --strip-thinking`));
    assert.deepEqual(await f.invoke(), { stdout: "", stderr: "" });
    assert.equal(f.fetches(), 0);
    assert.equal(f.authCalls(), 0);
  } finally { await f.cleanup(); }
});

test("Stop syncs the manifest strip policy", async () => {
  const f = await syncFixture();
  try {
    const blocks = (content: object[]) => JSON.stringify({ type: "assistant", sessionId: f.id, message: { content } }) + "\n";
    await writeFile(f.path, blocks([{ type: "thinking", thinking: "private reasoning" }, { type: "text", text: "visible answer" }]));
    await f.optIn({ stripThinking: true, stripToolResults: true });
    assert.deepEqual(await f.invoke(), { stdout: "", stderr: "" });
    assert.equal(f.remote(), blocks([{ type: "text", text: "visible answer" }]));
  } finally { await f.cleanup(); }
});

test("upload, stop, then Stop hook does not fetch", async () => {
  const f = await syncFixture();
  try {
    await writeFile(f.path, f.line("start"));
    const { confirmation } = await upload(f.path) as { confirmation: string };
    const { marker } = await upload(f.path, { confirm: confirmation }) as { marker: string };
    const result = await stop([f.id]) as { marker: string };
    assert.equal(result.marker, `share-session:opt-out ${f.id}`);
    await appendFile(f.path, f.line(marker) + f.line(result.marker) + f.line("after stop"));
    const count = f.fetches();
    assert.deepEqual(await f.invoke(), { stdout: "", stderr: "" });
    assert.equal(f.fetches(), count);
  } finally { await f.cleanup(); }
});

test("upload, stop, new consented upload: Stop hook syncs again", async () => {
  const f = await syncFixture();
  try {
    await writeFile(f.path, f.line("start"));
    let { confirmation } = await upload(f.path) as { confirmation: string };
    await upload(f.path, { confirm: confirmation });
    const { marker } = await stop([f.id]) as { marker: string };
    await appendFile(f.path, f.line(marker));
    ({ confirmation } = await upload(f.path) as { confirmation: string });
    await upload(f.path, { confirm: confirmation });
    assert.equal(JSON.parse(await readFile(f.manifest, "utf8")).stopped[f.id], undefined);
    await appendFile(f.path, f.line("resumed"));
    assert.deepEqual(await f.invoke(), { stdout: "", stderr: "" });
    assert.ok(f.remote().endsWith(f.line("resumed")));
  } finally { await f.cleanup(); }
});

test("missing token blocks once with MCP recovery instructions and never on the active Stop", async () => {
  const f = await syncFixture();
  try {
    await writeFile(f.path, f.line("start"));
    await f.optIn();
    f.missingToken();
    const first = await f.invoke();
    const decision = JSON.parse(first.stdout);
    assert.equal(decision.decision, "block");
    assert.match(decision.reason, /get_token/);
    assert.ok(decision.reason.includes(`client.ts" sync ${f.id}`));
    assert.equal(first.stderr, "");
    assert.deepEqual(await f.invoke(true), { stdout: "", stderr: "" });
    assert.equal(f.fetches(), 0);
  } finally { await f.cleanup(); }
});

test("expired or redirected Access credentials request recovery without a Stop loop", async () => {
  const f = await syncFixture();
  try {
    await writeFile(f.path, f.line("start"));
    await f.optIn();
    for (const status of [401, 302]) {
      f.status(status);
      assert.equal(JSON.parse((await f.invoke()).stdout).decision, "block");
      assert.deepEqual(await f.invoke(true), { stdout: "", stderr: "" });
    }
  } finally { await f.cleanup(); }
});

test("unexpected Stop errors stay off stdout and do not leak upstream details", async () => {
  const f = await syncFixture();
  try {
    await writeFile(f.path, f.line("start"));
    await f.optIn();
    f.networkError();
    for (const raw of [undefined, "{invalid", "null"]) {
      const result = await f.invoke(false, f.path, raw);
      assert.equal(result.stdout, "");
      assert.ok(result.stderr.length > 0 && result.stderr.length < 160);
      assert.ok(!result.stderr.includes("private upstream error"));
    }
  } finally { await f.cleanup(); }
});

test("hook-stop executable exits zero without the usual CLI result envelope", async () => {
  const f = await syncFixture();
  try {
    const client = fileURLToPath(new URL("../../../.agents/skills/share-session/scripts/client.ts", import.meta.url));
    const preload = `import os from 'node:os'; import fs from 'node:fs/promises'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
      os.homedir = () => ${JSON.stringify(f.temp)};
      const read = fs.readFile;
      fs.readFile = (...args) => args[0] === ${JSON.stringify(CONFIG_PATH)} ? Promise.resolve('{"baseUrl":"https://sessions.test"}') : read(...args);
      cp.execFileSync = () => { throw new Error('no cached token'); };
      globalThis.fetch = () => { throw new Error('unexpected network'); };
      syncBuiltinESMExports();`;
    const run = (active: boolean) => cp.spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, client, "hook-stop"], {
      input: JSON.stringify({ session_id: f.id, transcript_path: f.path, stop_hook_active: active }),
      encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    await writeFile(f.path, f.line("no consent"));
    let result = run(false);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    await appendFile(f.path, f.line(`share-session:opt-in ${f.id}`));
    result = run(false);
    assert.equal(result.stdout, "", "a transcript marker alone is not consent");
    await f.optIn();
    result = run(false);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).decision, "block");
    result = run(true);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  } finally { await f.cleanup(); }
});
