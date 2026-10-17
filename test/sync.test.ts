import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { ALICE, BOB, mintJwt } from "./jwt";

const BASE = "https://sessions.example.com/api/sessions";
const auth = async (email?: string) => ({ Authorization: `Bearer ${await mintJwt({ email: email ?? ALICE })}` });
async function create(id: string, text: string) {
  const form = new FormData();
  form.set("meta", JSON.stringify({ id, project: "team" }));
  form.set("jsonl", new File([text], "s.jsonl"));
  return SELF.fetch(BASE, { method: "POST", body: form, headers: await auth() });
}
async function patch(id: string, offset: number, text: string, email?: string) {
  return SELF.fetch(`${BASE}/${id}`, { method: "PATCH", headers: { ...await auth(email), "X-Base-Offset": String(offset) }, body: text });
}

it("concatenates three gzip deltas byte for byte, using UTF-8 byte offsets", async () => {
  const id = crypto.randomUUID();
  let text = '{"text":"départ 🦓"}\n';
  expect((await create(id, text)).status).toBe(201);
  for (const value of ["un", "deux", "trois"]) {
    const delta = JSON.stringify({ text: value }) + "\n";
    const response = await patch(id, new TextEncoder().encode(text).length, delta);
    expect(response.status).toBe(200);
    text += delta;
  }
  const bundle = await SELF.fetch(`${BASE}/${id}/bundle`, { headers: await auth(BOB) });
  expect(bundle.status).toBe(200);
  expect(new Uint8Array(await bundle.arrayBuffer())).toEqual(new TextEncoder().encode(text));
  const meta = await SELF.fetch(`${BASE}/${id}`, { headers: await auth() });
  expect(await meta.json()).toMatchObject({ bytes: new TextEncoder().encode(text).length, last_line_hash: expect.any(String) });
  expect(await env.SESSIONS.head(`sessions/${id}/seg-0004.jsonl.gz`)).not.toBeNull();
});

it("refuses non-owners and stale offsets without changing the bundle; full upload resets segments", async () => {
  const id = crypto.randomUUID();
  await create(id, '{}\n');
  expect((await patch(id, 3, '{}\n', BOB)).status).toBe(403);
  expect((await patch(id, 0, '{}\n')).status).toBe(409);
  expect((await patch(id, 3, '{"new":true}\n')).status).toBe(200);
  await create(id, '{"reset":true}\n');
  expect((await patch(id, 15, '{}\n')).status).toBe(200);
  const bundle = await SELF.fetch(`${BASE}/${id}/bundle`, { headers: await auth() });
  expect(await bundle.text()).toBe('{"reset":true}\n{}\n');
});

it("hides expired sessions on metadata/bundle reads but lets their owner reactivate by sync", async () => {
  const id = crypto.randomUUID();
  await create(id, '{}\n');
  await env.DB.prepare("UPDATE sessions SET last_synced_at = 0 WHERE id = ?").bind(id).run();
  for (const suffix of ["", "/bundle"]) {
    expect((await SELF.fetch(`${BASE}/${id}${suffix}`, { headers: await auth() })).status).toBe(404);
  }
  expect((await patch(id, 3, '{}\n', BOB)).status).toBe(403);
  expect((await patch(id, 3, '{}\n')).status).toBe(200);
  expect((await SELF.fetch(`${BASE}/${id}`, { headers: await auth() })).status).toBe(200);
});

it("rejects malformed offsets and incomplete JSONL deltas", async () => {
  const id = crypto.randomUUID();
  await create(id, '{}\n');
  expect((await patch(id, -1, '{}\n')).status).toBe(400);
  expect((await patch(id, 3, '{"partial":')).status).toBe(400);
});
