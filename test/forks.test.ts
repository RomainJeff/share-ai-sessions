import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { ALICE, BOB, mintJwt } from "./jwt";

const BASE = "https://sessions.example.com";
async function upload(jwt: string, meta: Record<string, unknown>, jsonl = "{}\n") {
  const form = new FormData();
  form.set("meta", JSON.stringify({ project: "acme/repo", ...meta }));
  form.set("jsonl", new File([jsonl], "s.jsonl"));
  return SELF.fetch(`${BASE}/api/sessions`, { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form });
}
async function get(jwt: string, path: string, json = false) {
  return SELF.fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${jwt}`, ...(json ? { Accept: "application/json" } : {}) } });
}

it("Alice uploads, Bob pulls and re-uploads a new session with server-derived provenance and a fork link", async () => {
  const alice = await mintJwt({ email: ALICE, name: "Alice" });
  const bob = await mintJwt({ email: BOB, name: "Bob" });
  const origin = crypto.randomUUID();
  const fork = crypto.randomUUID();
  const source = JSON.stringify({ type: "user", sessionId: origin, cwd: "/home/alice/repo", uuid: "u1", parentUuid: null, message: { content: "Original" } }) + "\n";
  expect((await upload(alice, { id: origin, title: "Origin", cwd_base: "/home/alice/repo", branch: "main" }, source)).status).toBe(201);
  const original = await (await get(bob, `/api/sessions/${origin}`)).json();
  await env.SESSIONS.put(`sessions/${origin}/tool-results/result.txt`, "Full result 🦓");
  const response = await get(bob, `/api/sessions/${origin}/bundle`, true);
  expect(response.status).toBe(200);
  const bundle = await response.json() as { session: Record<string, unknown>; jsonl: string; tool_results: Record<string, string> };
  expect(bundle.session).toMatchObject({ id: origin, owner_email: ALICE, owner_name: "Alice", project: "acme/repo", branch: "main", cwd_base: "/home/alice/repo" });
  expect(bundle.jsonl).toBe(source);
  const bytes = Uint8Array.from(atob(bundle.tool_results["result.txt"]!), (c) => c.charCodeAt(0));
  expect(new TextDecoder().decode(bytes)).toBe("Full result 🦓");
  const continued = bundle.jsonl.replaceAll(origin, fork) + JSON.stringify({ type: "user", sessionId: fork, message: { content: "Bob continues" } }) + "\n";
  expect((await upload(bob, { id: fork, forked_from: origin, forked_from_owner: "mallory@evil.test", owner_email: ALICE }, continued)).status).toBe(201);
  // Full replacements (including sync recovery) must retain the original provenance.
  expect((await upload(bob, { id: fork }, continued)).status).toBe(200);
  const sessions = await env.DB.prepare("SELECT id, owner_email, forked_from, forked_from_owner FROM sessions WHERE id IN (?, ?) ORDER BY owner_email").bind(origin, fork).all();
  expect(sessions.results).toEqual([
    { id: origin, owner_email: ALICE, forked_from: null, forked_from_owner: null },
    { id: fork, owner_email: BOB, forked_from: origin, forked_from_owner: ALICE },
  ]);
  expect(await (await get(bob, `/api/sessions/${origin}`)).json()).toEqual(original);
  expect(await (await get(bob, `/api/sessions/${origin}/bundle`)).text()).toBe(source);
  const html = await (await get(bob, `/s/${fork}`)).text();
  expect(html).toContain(`forké depuis <a href="/s/${origin}">`);
  expect(html).toContain(ALICE);
  expect((await upload(bob, { id: origin, forked_from: fork })).status).toBe(403);
});

it("rejects invalid, missing, self or changed origins before writing session data", async () => {
  const alice = await mintJwt({ email: ALICE });
  for (const value of [crypto.randomUUID(), "not-a-uuid", 7, {}, ""]) {
    const id = crypto.randomUUID();
    expect((await upload(alice, { id, forked_from: value })).status).toBe(400);
    expect(await env.DB.prepare("SELECT id FROM sessions WHERE id = ?").bind(id).first()).toBeNull();
    expect(await env.SESSIONS.head(`sessions/${id}/seg-0001.jsonl`)).toBeNull();
  }
  const id = crypto.randomUUID();
  expect((await upload(alice, { id, forked_from: id })).status).toBe(400);
  expect((await upload(alice, { id })).status).toBe(201);
  const other = crypto.randomUUID();
  expect((await upload(alice, { id: other })).status).toBe(201);
  expect((await upload(alice, { id, forked_from: other })).status).toBe(400);
  expect(await (await get(alice, `/api/sessions/${id}/bundle`)).text()).toBe("{}\n");
});
