import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ALICE, BOB, mintJwt } from "./jwt";

const BASE = "https://sessions.example.com/api/sessions";
const JSONL = '{"type":"user","sessionId":"x"}\n{"type":"assistant","sessionId":"x"}\n';

async function upload(jwt: string, meta: Record<string, unknown>, body = JSONL) {
  const form = new FormData();
  form.set("meta", JSON.stringify(meta));
  form.set("jsonl", new File([body], "s.jsonl"));
  return SELF.fetch(BASE, { method: "POST", body: form, headers: { "Cf-Access-Jwt-Assertion": jwt } });
}

async function list(jwt: string, query = "") {
  const res = await SELF.fetch(`${BASE}${query}`, { headers: { Authorization: `Bearer ${jwt}` } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { sessions: Record<string, unknown>[] }).sessions;
}

describe("upload → list", () => {
  it("stores the JSONL and lists it under the token's email, never the body's", async () => {
    const id = crypto.randomUUID();
    const res = await upload(await mintJwt({ email: ALICE, name: "Alice" }), {
      id, project: "team", repo: "Acme/Notes", title: "hello", owner_email: "mallory@evil.test",
    });
    expect(res.status).toBe(201);

    const row = (await list(await mintJwt({ email: BOB }))).find((s) => s.id === id);
    expect(row).toMatchObject({ owner_email: ALICE, owner_name: "Alice", project: "team", repo: "acme/notes", title: "hello" });
    expect(await (await env.SESSIONS.get(`sessions/${id}/seg-0001.jsonl`))!.text()).toBe(JSONL);
  });

  it("filters by repo, author, mine and q", async () => {
    const id = crypto.randomUUID();
    await upload(await mintJwt({ email: BOB }), { id, project: "team", repo: "bob/repo", title: "needle here" });
    const bob = await mintJwt({ email: BOB });
    expect((await list(bob, "?repo=bob/repo")).map((s) => s.id)).toContain(id);
    expect((await list(bob, `?author=${ALICE}`)).map((s) => s.id)).not.toContain(id);
    expect((await list(bob, "?mine=1")).every((s) => s.owner_email === BOB)).toBe(true);
    expect((await list(bob, "?q=needle")).map((s) => s.id)).toEqual([id]);
  });

  it("re-upload is idempotent for the owner, 403 for anyone else", async () => {
    const id = crypto.randomUUID();
    expect((await upload(await mintJwt(), { id, project: "team" })).status).toBe(201);
    expect((await upload(await mintJwt(), { id, project: "team" })).status).toBe(200);
    expect((await upload(await mintJwt({ email: BOB }), { id, project: "team" })).status).toBe(403);
  });

  it("rejects a missing id", async () => {
    expect((await upload(await mintJwt(), { project: "team" })).status).toBe(400);
  });
});

describe("auth", () => {
  const cases: [string, () => Promise<string | undefined>][] = [
    ["missing", async () => undefined],
    ["foreign key", () => mintJwt(undefined, { impostor: true })],
    ["other app", () => mintJwt(undefined, { aud: "another-app" })],
    ["expired", () => mintJwt(undefined, { exp: "-1m" })],
    ["service token (no email)", () => mintJwt({ common_name: "deploy.svc" })],
  ];
  it.each(cases)("401s a %s JWT", async (_, jwt) => {
    const token = await jwt();
    const res = await SELF.fetch(BASE, { headers: token ? { "Cf-Access-Jwt-Assertion": token } : {} });
    expect(res.status).toBe(401);
  });
});

describe("retention", () => {
  it("hides sessions not synced for more than 90 days", async () => {
    const id = crypto.randomUUID();
    await upload(await mintJwt(), { id, project: "team" });
    const old = Date.now() - 91 * 24 * 60 * 60 * 1000;
    await env.DB.prepare("UPDATE sessions SET last_synced_at = ? WHERE id = ?").bind(old, id).run();
    expect((await list(await mintJwt())).map((s) => s.id)).not.toContain(id);
  });
});
