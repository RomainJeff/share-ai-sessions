import { env, SELF } from "cloudflare:test";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { ALICE, BOB, mintJwt } from "./jwt";

const ORIGIN = "https://sessions.example.com";
const BASE = `${ORIGIN}/api/sessions`;
const LINK = "https://t3.example.com/guest#invite-one";
const auth = async (email = ALICE) => ({ "Cf-Access-Jwt-Assertion": await mintJwt({ email, name: email === ALICE ? "Alice" : "Bob" }) });

async function relay(id: string, body: Record<string, unknown>, email = ALICE) {
  return SELF.fetch(`${BASE}/${id}/relay`, {
    method: "PUT", headers: { ...await auth(email), "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
async function upload(id: string) {
  const form = new FormData();
  form.set("meta", JSON.stringify({ id, project: "team" }));
  form.set("jsonl", new File(['{"type":"user"}\n'], "s.jsonl"));
  return SELF.fetch(BASE, { method: "POST", body: form, headers: await auth() });
}
const page = async (path: string) => (await SELF.fetch(ORIGIN + path, { headers: await auth() })).text();

describe("relayed sessions", () => {
  it("creates metadata only, lists it, and renews the link while keeping omitted metadata", async () => {
    const id = crypto.randomUUID();
    const created = await relay(id, { app: "t3code", url: LINK, project: "team", title: "Live thread", repo: "Acme/Notes", branch: "main", msg_count: 4 });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id, owner_email: ALICE, project: "team", external_app: "t3code", external_url: LINK, external_expires_at: null });
    expect((await env.SESSIONS.list({ prefix: `sessions/${id}/` })).objects).toHaveLength(0);
    const listed = ((await (await SELF.fetch(BASE, { headers: await auth(BOB) })).json()) as { sessions: Record<string, unknown>[] }).sessions.find((s) => s.id === id);
    expect(listed).toMatchObject({ title: "Live thread", repo: "acme/notes", bytes: 0, external_app: "t3code", external_url: LINK, external_expires_at: null });

    await env.DB.prepare("UPDATE sessions SET last_synced_at = 1 WHERE id = ?").bind(id).run();
    const expires = "2030-01-02T03:04:05.000Z";
    const renewed = await relay(id, { app: "t3code", url: "https://t3.example.com/guest#invite-two", expires_at: expires });
    expect(renewed.status).toBe(200);
    const row = await (await SELF.fetch(`${BASE}/${id}`, { headers: await auth() })).json();
    expect(row).toMatchObject({ title: "Live thread", branch: "main", msg_count: 4, external_url: "https://t3.example.com/guest#invite-two", external_expires_at: Date.parse(expires) });
    expect((row as { last_synced_at: number }).last_synced_at).toBeGreaterThan(Date.now() - 60_000);
  });

  it("applies project and ownership rules", async () => {
    const id = crypto.randomUUID();
    expect((await relay(id, { app: "t3code", url: LINK })).status).toBe(400);
    expect((await relay(id, { app: "t3code", url: LINK, project: "nowhere" })).status).toBe(403);
    expect((await relay(id, { app: "t3code", url: LINK, project: "team" })).status).toBe(201);
    const moved = await relay(id, { app: "t3code", url: LINK, project: "elsewhere" });
    expect(moved.status).toBe(400);
    expect(await moved.json()).toEqual({ error: "project is locked to team, the project of this session" });
    expect((await relay(id, { app: "t3code", url: LINK }, BOB)).status).toBe(403);
  });

  it.each([
    ["an http link", { app: "t3code", url: "http://t3.example.com/guest#x" }],
    ["a script link", { app: "t3code", url: "javascript:alert(1)" }],
    ["a relative link", { app: "t3code", url: "/guest#x" }],
    ["an oversized link", { app: "t3code", url: `https://t3.example.com/${"a".repeat(2000)}` }],
    ["a bad app", { app: "T3 Code!", url: LINK }],
    ["a bad expiry", { app: "t3code", url: LINK, expires_at: "tomorrow" }],
  ])("refuses %s", async (_, body) => {
    expect((await relay(crypto.randomUUID(), { ...body, project: "team" })).status).toBe(400);
  });

  it("refuses deltas and bundles for a relay without a transcript", async () => {
    const id = crypto.randomUUID();
    await relay(id, { app: "t3code", url: LINK, project: "team" });
    const patch = await SELF.fetch(`${BASE}/${id}`, { method: "PATCH", headers: { ...await auth(), "X-Base-Offset": "0" }, body: "{}\n" });
    expect(patch.status).toBe(409);
    expect(await patch.json()).toEqual({ error: "session is relayed from t3code without a transcript: upload it first" });
    const bundle = await SELF.fetch(`${BASE}/${id}/bundle`, { headers: { ...await auth(BOB), Accept: "application/json" } });
    expect(bundle.status).toBe(409);
    expect(((await bundle.json()) as { error: string }).error).toBe(`session is relayed from t3code: no transcript is stored here, open ${LINK}`);
  });

  it("keeps the link and the transcript together, in either order", async () => {
    const relayedFirst = crypto.randomUUID();
    await relay(relayedFirst, { app: "t3code", url: LINK, project: "team" });
    expect((await upload(relayedFirst)).status).toBe(200);
    const appended = await SELF.fetch(`${BASE}/${relayedFirst}`, { method: "PATCH", headers: { ...await auth(), "X-Base-Offset": "16" }, body: '{"type":"assistant"}\n' });
    expect(appended.status).toBe(200);
    expect((await relay(relayedFirst, { app: "t3code", url: "https://t3.example.com/guest#invite-two" })).status).toBe(200);
    const row = await (await SELF.fetch(`${BASE}/${relayedFirst}`, { headers: await auth() })).json();
    expect(row).toMatchObject({ external_app: "t3code", external_url: "https://t3.example.com/guest#invite-two", bytes: 37 });
    const bundle = await SELF.fetch(`${BASE}/${relayedFirst}/bundle`, { headers: await auth(BOB) });
    expect(bundle.status).toBe(200);
    expect(await bundle.text()).toContain('{"type":"assistant"}');

    const hostedFirst = crypto.randomUUID();
    expect((await upload(hostedFirst)).status).toBe(201);
    expect((await relay(hostedFirst, { app: "t3code", url: LINK, project: "team" })).status).toBe(200);
    expect((await upload(hostedFirst)).status).toBe(200);
    expect(await (await SELF.fetch(`${BASE}/${hostedFirst}`, { headers: await auth() })).json()).toMatchObject({ external_url: LINK, bytes: 16 });
  });

  it("shows a relayed transcript to readers, with the app link and resume", async () => {
    const id = crypto.randomUUID();
    await relay(id, { app: "t3code", url: LINK, project: "team", title: "Relayed with transcript" });
    const form = new FormData();
    form.set("meta", JSON.stringify({ id, project: "team" }));
    form.set("jsonl", new File([JSON.stringify({ type: "user", message: { role: "user", content: "Hello from T3" }, timestamp: "2026-01-01T00:00:00Z" }) + "\n"], "s.jsonl"));
    expect((await SELF.fetch(BASE, { method: "POST", body: form, headers: await auth() })).status).toBe(200);
    const html = await (await SELF.fetch(`${ORIGIN}/s/${id}`, { headers: await auth(BOB) })).text();
    expect(html).toContain('id="conversation"');
    expect(html).toContain("Hello from T3");
    expect(html).toContain("Ouvrir dans T3 Code");
    expect(html).toMatch(/<button class="btn" type="button" data-copy="\/share-session pull [^"]+">.*Reprendre<\/button>/);
    expect(html).toContain("Commande de reprise");
    expect(html).toContain("Hébergée par");
  });

  it("opens the app from the reader and lists a badge, without transcript or resume", async () => {
    const id = crypto.randomUUID();
    const url = 'https://t3.example.com/guest#a"><b>x</b>';
    await relay(id, { app: "t3code", url, project: "team", title: "Relayed reader" });
    await SELF.fetch(`${ORIGIN}/api/projects`, { method: "POST", headers: await auth(), body: JSON.stringify({ slug: "relay-destination" }) });
    const html = await page(`/s/${id}`);
    expect(html).toContain(`<a class="btn primary" href="https://t3.example.com/guest#a&quot;&gt;&lt;b&gt;x&lt;/b&gt;" target="_blank" rel="noopener noreferrer">`);
    expect(html).toContain("Ouvrir dans T3 Code");
    for (const text of ["Reprendre", "Commande de reprise", 'id="conversation"', "Lien expiré", "<b>x</b>"]) expect(html).not.toContain(text);
    expect(html).toContain("Changer de projet");

    await relay(id, { app: "t3code", url, expires_at: Date.now() - 1000 });
    const expired = await page(`/s/${id}`);
    expect(expired).toContain("Lien expiré");
    expect(expired).not.toContain("Ouvrir dans");
    expect(expired).not.toContain("t3.example.com");

    const other = crypto.randomUUID();
    await relay(other, { app: "other-app", url: LINK, project: "team" });
    expect(await page(`/s/${other}`)).toContain("Ouvrir dans other-app");
    expect(await page("/sessions")).toMatch(/Relayed reader<\/a>\s*<p class="session-note"><span class="badge">T3 Code<\/span>/);
  });

  it("lets a broker write token relay only its own session", async () => {
    const id = crypto.randomUUID();
    const token = await new SignJWT({ scope: `write:${id}` }).setProtectedHeader({ alg: "HS256" }).setSubject(ALICE)
      .setIssuer("https://sessions-mcp.example.com").setAudience("session-share-cli").setIssuedAt().setExpirationTime("10m")
      .sign(new TextEncoder().encode("test-only-broker-key-at-least-32-bytes"));
    const put = (target: string) => SELF.fetch(`https://sessions-mcp.example.com/api/sessions/${target}/relay`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ app: "t3code", url: LINK, project: "team" }),
    });
    expect((await put(id)).status).toBe(201);
    expect((await put(crypto.randomUUID())).status).toBe(403);
  });
});
