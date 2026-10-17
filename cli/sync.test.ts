import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import fs from "node:fs/promises";
import os from "node:os";
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { upload } from "./commands/upload.ts";
import { sync } from "./commands/sync.ts";
import { stop } from "./commands/stop.ts";
import { CONFIG_PATH } from "./lib.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

test("manual sync uses server bytes after cache loss, handles 409/rewrite, and stop removes opt-in", async () => {
  const temp = await mkdtemp(join(os.tmpdir(), "session-share-sync-"));
  const id = randomUUID();
  const path = join(temp, ".claude/projects/test", `${id}.jsonl`);
  const manifest = join(temp, ".claude/session-share/manifest.json");
  await mkdir(join(temp, ".claude/projects/test"), { recursive: true });
  const line = (value: string) => JSON.stringify({ type: "user", sessionId: id, message: { content: value } }) + "\n";
  let text = line("départ 🦓");
  await writeFile(path, text);
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
  try {
    const result = await upload(path) as { marker: string };
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
    // A partial writer's line waits until the following sync.
    await writeFile(path, text + '{"partial":');
    const count = requests.length;
    await sync([id]);
    assert.equal(requests.length, count);
    text += line("four");
    await writeFile(path, text);
    await writeFile(path, text + '{"partial":');
    conflict = true;
    await sync([id]);
    assert.deepEqual(requests.slice(-2).map((r) => r.method), ["PATCH", "POST"]);
    assert.equal(requests.at(-1)!.body, text);
    // Same length rewrite of the acknowledged last line must trigger a replacement.
    text = text.replace('"four"', '"five"');
    await writeFile(path, text);
    await sync([id]);
    assert.equal(requests.at(-1)!.method, "POST");
    assert.equal(requests.at(-1)!.body, text);
    await stop([id]);
    assert.deepEqual(await sync(["--all"]), []);
    assert.equal(JSON.parse(await readFile(manifest, "utf8")).sessions[id], undefined);
  } finally {
    mock.restoreAll();
    syncBuiltinESMExports();
    await rm(temp, { recursive: true, force: true });
  }
});
