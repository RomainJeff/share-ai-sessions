import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { upload } from "../../../.agents/skills/share-session/scripts/commands/upload.ts";
import { sync } from "../../../.agents/skills/share-session/scripts/commands/sync.ts";
import { stop } from "../../../.agents/skills/share-session/scripts/commands/stop.ts";
import { CONFIG_PATH } from "../../../.agents/skills/share-session/scripts/lib.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

async function syncFixture() {
  const temp = await mkdtemp(join(os.tmpdir(), "session-share-sync-"));
  const id = randomUUID();
  const path = join(temp, ".claude/projects/test", `${id}.jsonl`);
  const manifest = join(temp, ".claude/session-share/manifest.json");
  await mkdir(join(temp, ".claude/projects/test"), { recursive: true });
  const line = (value: string) => JSON.stringify({ type: "user", sessionId: id, message: { content: value } }) + "\n";
  const requests: { method: string; body: string; offset: string | undefined }[] = [];
  let serverBytes = 0;
  let serverHash: string | null = null;
  let conflict = false;
  const originalReadFile = fs.readFile;
  mock.method(os, "homedir", () => temp);
  mock.method(fs, "readFile", (...args: Parameters<typeof readFile>) => args[0] === CONFIG_PATH ? Promise.resolve('{"baseUrl":"https://sessions.test"}') : originalReadFile(...args));
  mock.method(cp, "execFileSync", (command: string) => {
    if (command === "cloudflared") return "never.persist.this";
    throw new Error("no git remote in fixture");
  });
  syncBuiltinESMExports();
  mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    if (method === "GET") return Response.json({ bytes: serverBytes, last_line_hash: serverHash });
    const body = init.body instanceof FormData ? await (init.body.get("jsonl") as Blob).text() : await new Response(init.body).text();
    const offset = (init.headers as Record<string, string>)["X-Base-Offset"];
    requests.push({ method, body, offset });
    if (method === "PATCH" && conflict) { conflict = false; return Response.json({}, { status: 409 }); }
    serverBytes = method === "POST" ? Buffer.byteLength(body) : serverBytes + Buffer.byteLength(body);
    const lines = body.trimEnd().split("\n");
    serverHash = hash(lines.at(-1)! + "\n");
    return Response.json({ id, bytes: serverBytes });
  });
  return {
    id, path, manifest, line, requests,
    conflictNextPatch: () => { conflict = true; },
    cleanup: async () => {
      mock.restoreAll();
      syncBuiltinESMExports();
      await rm(temp, { recursive: true, force: true });
    },
  };
}

test("manual sync uses server bytes after cache loss, handles 409/rewrite, and stop removes opt-in", async () => {
  const fixture = await syncFixture();
  const { id, path, manifest, line, requests } = fixture;
  try {
    let text = line("départ 🦓");
    await writeFile(path, text);
    const { confirmation } = await upload(path) as { confirmation: string };
    // The live session appends between preview and confirm: only the previewed bytes are sent.
    await writeFile(path, text + line("written after preview"));
    const result = await upload(path, { confirm: confirmation }) as { marker: string };
    assert.equal(requests.at(-1)!.body, text);
    assert.equal(result.marker, `share-session:opt-in ${id}`);
    assert.equal((JSON.parse(await readFile(manifest, "utf8"))).sessions[id].offset, Buffer.byteLength(text));
    assert.ok(!(await readFile(manifest, "utf8")).includes("never.persist.this"));
    // Simulate CLI output captured by Claude in its transcript, then a fresh container.
    text += line(result.marker);
    await writeFile(path, text);
    await rm(manifest);
    await sync([id]);
    assert.equal(requests.at(-1)!.body, line(result.marker));
    assert.equal(requests.at(-1)!.offset, String(Buffer.byteLength(line("départ 🦓"))));
    for (const value of ["two", "three"]) {
      const delta = line(value);
      text += delta;
      await writeFile(path, text);
      await sync(["--all"]);
      assert.equal(requests.at(-1)!.body, delta);
      assert.equal(requests.at(-1)!.method, "PATCH");
    }
    // Deltas are redacted before offsets: the secret never leaves, and later offsets stay on sanitized bytes.
    const secret = "ghp_" + "G".repeat(36);
    text += line(`token ${secret}`);
    await writeFile(path, text);
    await sync([id]);
    assert.equal(requests.at(-1)!.method, "PATCH");
    assert.ok(!requests.at(-1)!.body.includes(secret) && requests.at(-1)!.body.includes("[REDACTED:github]"));
    text += line("after secret");
    await writeFile(path, text);
    await sync([id]);
    assert.equal(requests.at(-1)!.method, "PATCH");
    // A partial writer's line waits until the following sync.
    await writeFile(path, text + '{"partial":');
    const count = requests.length;
    await sync([id]);
    assert.equal(requests.length, count);
    text += line("four");
    await writeFile(path, text);
    await writeFile(path, text + '{"partial":');
    fixture.conflictNextPatch();
    await sync([id]);
    assert.deepEqual(requests.slice(-2).map((r) => r.method), ["PATCH", "POST"]);
    assert.equal(requests.at(-1)!.body, text.replace(secret, "[REDACTED:github]"));
    // Same length rewrite of the acknowledged last line must trigger a replacement.
    text = text.replace('"four"', '"five"');
    await writeFile(path, text);
    await sync([id]);
    assert.equal(requests.at(-1)!.method, "POST");
    assert.equal(requests.at(-1)!.body, text.replace(secret, "[REDACTED:github]"));
    await stop([id]);
    assert.deepEqual(await sync(["--all"]), []);
    assert.equal(JSON.parse(await readFile(manifest, "utf8")).sessions[id], undefined);
  } finally {
    await fixture.cleanup();
  }
});

test("sync recovers both strip flags from the last opt-in marker after manifest loss", async () => {
  const fixture = await syncFixture();
  const { id, path, manifest, line, requests } = fixture;
  const strip = { stripThinking: true, stripToolResults: true };
  const blocks = (type: string, content: object[]) => JSON.stringify({ type, sessionId: id, message: { content } }) + "\n";
  try {
    // An older, flagless marker must not override the latest upload's policy.
    let text = line(`share-session:opt-in ${id}`)
      + blocks("assistant", [{ type: "thinking", thinking: "original private reasoning" }, { type: "text", text: "départ 🦓" }])
      + blocks("user", [{ type: "tool_result", tool_use_id: "original-tool", content: "original private result" }]);
    await writeFile(path, text);
    const { confirmation } = await upload(path, strip) as { confirmation: string };
    assert.equal(typeof confirmation, "string");
    assert.equal(requests.length, 0, "preview must not upload");
    const { marker } = await upload(path, { ...strip, confirm: confirmation }) as { marker: string };
    assert.equal(marker, `share-session:opt-in ${id} --strip-thinking --strip-tool-results`);
    assert.deepEqual(JSON.parse(await readFile(manifest, "utf8")).sessions[id].strip, strip, "manifest stores only the policy, never the confirm hash");
    const uploaded = requests[0]!;
    assert.equal(uploaded.method, "POST");
    assert.ok(Buffer.byteLength(uploaded.body) < Buffer.byteLength(text), "server bytes must differ from source bytes");
    assert.ok(!uploaded.body.includes("original private reasoning"));
    assert.ok(!uploaded.body.includes("original private result"));
    // Claude records the returned marker before the ephemeral manifest disappears.
    text += line(marker);
    await writeFile(path, text);
    await rm(manifest);
    text += blocks("assistant", [{ type: "thinking", thinking: "new private reasoning" }, { type: "text", text: "visible answer" }])
      + blocks("user", [{ type: "tool_result", tool_use_id: "new-tool", content: "new private result" }]);
    await writeFile(path, text);

    await sync([id]);

    assert.deepEqual(requests.map((request) => request.method), ["POST", "PATCH"], "recovery must append without a replacement upload");
    const patch = requests[1]!;
    assert.equal(patch.offset, String(Buffer.byteLength(uploaded.body)));
    assert.equal(patch.body, line(marker)
      + blocks("assistant", [{ type: "text", text: "visible answer" }])
      + blocks("user", [{ type: "tool_result", tool_use_id: "new-tool", content: "[REDACTED:tool-result]" }]));
    assert.ok(!patch.body.includes("new private reasoning"));
    assert.ok(!patch.body.includes("new private result"));
    assert.deepEqual(JSON.parse(await readFile(manifest, "utf8")).sessions[id].strip, strip);
  } finally {
    await fixture.cleanup();
  }
});
