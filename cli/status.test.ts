import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { main } from "../skills/share-session/scripts/client.ts";

const key = new TextEncoder().encode("test-only-broker-key-at-least-32-bytes");
const DONE_AT = Date.parse("2030-01-02T03:04:05Z");

test("status sets done or active and list shows and filters it", async (t) => {
  const id = crypto.randomUUID();
  const original = process.env.SESSION_TOKEN;
  process.env.SESSION_TOKEN = await new SignJWT({ scope: `write:${id}` }).setProtectedHeader({ alg: "HS256" }).setSubject("alice@example.com")
    .setIssuer("https://sessions-mcp.example.com").setAudience("session-share-cli").setIssuedAt().setExpirationTime("10m").sign(key);
  t.after(() => { if (original === undefined) delete process.env.SESSION_TOKEN; else process.env.SESSION_TOKEN = original; });
  const calls: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
    const path = url.replace("https://sessions-mcp.example.com", "");
    calls.push([init.method ?? "GET", path, init.body ? JSON.parse(String(init.body)) : undefined]);
    if (path.startsWith("/api/sessions?")) {
      return Response.json({ sessions: [{ id, title: "t", project: "team", repo: "", owner_email: "alice@example.com", last_synced_at: 0, msg_count: 1, done_at: DONE_AT }] });
    }
    const { status } = JSON.parse(String(init.body));
    return Response.json({ id, status, done_at: status === "done" ? DONE_AT : null });
  });

  assert.deepEqual(await main(["status", id.toUpperCase(), "done"]), { id, status: "done", done_at: "2030-01-02T03:04:05.000Z" });
  assert.deepEqual(await main(["status", id, "active"]), { id, status: "active", done_at: null });
  const [row] = await main(["list", "--status", "done"]) as { done: string }[];
  assert.equal(row!.done, "2030-01-02T03:04:05.000Z");
  for (const args of [["status", id], ["status", id, "closed"], ["status", "not-an-id", "done"], ["list", "--status", "closed"]]) {
    await assert.rejects(main(args), { code: "usage" });
  }
  assert.deepEqual(calls, [
    ["PUT", `/api/sessions/${id}/status`, { status: "done" }],
    ["PUT", `/api/sessions/${id}/status`, { status: "active" }],
    ["GET", "/api/sessions?status=done", undefined],
  ]);
});
