import { SELF } from "cloudflare:test";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { ALICE, BOB, mintJwt } from "./jwt";

const BASE = "https://sessions.example.com";
const CAROL = "carol@example.com";
const call = async (email: string, path: string, init: RequestInit = {}) =>
  SELF.fetch(BASE + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await mintJwt({ email })}` } });
const put = (email: string, path: string, value: unknown) =>
  call(email, path, { method: "PUT", body: JSON.stringify(value), headers: { "Content-Type": "application/json" } });
const setStatus = (email: string, id: string, status: unknown) => put(email, `/api/sessions/${id}/status`, { status });
const session = async (id: string) => (await call(ALICE, `/api/sessions/${id}`)).json() as Promise<{ done_at: number | null; last_synced_at: number }>;
const ids = async (query: string) =>
  ((await (await call(ALICE, `/api/sessions?${query}`)).json()) as { sessions: { id: string }[] }).sessions.map((s) => s.id);

/** A project owned by Alice where Bob (writer) authored one session. */
async function fixture() {
  const project = `p-${crypto.randomUUID().slice(0, 8)}`, id = crypto.randomUUID();
  await call(ALICE, "/api/projects", { method: "POST", body: JSON.stringify({ slug: project }) });
  await put(ALICE, `/api/projects/${project}/members/${BOB}`, { role: "writer" });
  const form = new FormData();
  form.set("meta", JSON.stringify({ id, project, title: "Finished work" }));
  form.set("jsonl", new File(['{"type":"user"}\n'], "s.jsonl"));
  await call(BOB, "/api/sessions", { method: "POST", body: form });
  return { project, id };
}

describe("session status", () => {
  it("marks done once, filters lists by status, and reopens without touching activity", async () => {
    const { project, id } = await fixture();
    const { last_synced_at } = await session(id);
    const done = await setStatus(BOB, id, "done");
    expect(done.status).toBe(200);
    const { done_at } = (await done.json()) as { done_at: number };
    expect(await (await setStatus(BOB, id, "done")).json()).toEqual({ id, status: "done", done_at });
    expect(await session(id)).toMatchObject({ done_at, last_synced_at });
    expect(await ids(`project=${project}&status=done`)).toEqual([id]);
    expect(await ids(`project=${project}&status=active`)).toEqual([]);

    expect(await (await setStatus(BOB, id, "active")).json()).toEqual({ id, status: "active", done_at: null });
    expect(await ids(`project=${project}&status=active`)).toEqual([id]);
    expect((await setStatus(BOB, id, "closed")).status).toBe(400);
  });

  it("lets the author with writer rights or a project owner change it, hides it from non-members", async () => {
    const { project, id } = await fixture();
    expect((await setStatus(CAROL, id, "done")).status).toBe(404);
    await put(ALICE, `/api/projects/${project}/members/${CAROL}`, { role: "writer" });
    expect((await setStatus(CAROL, id, "done")).status).toBe(403);
    await put(ALICE, `/api/projects/${project}/members/${BOB}`, { role: "reader" });
    expect((await setStatus(BOB, id, "done")).status).toBe(403);
    expect((await setStatus(ALICE, id, "done")).status).toBe(200);
  });

  it("works on a relayed session with a broker write token for that session only", async () => {
    const id = crypto.randomUUID();
    const token = await new SignJWT({ scope: `write:${id}` }).setProtectedHeader({ alg: "HS256" }).setSubject(ALICE)
      .setIssuer("https://sessions-mcp.example.com").setAudience("session-share-cli").setIssuedAt().setExpirationTime("10m")
      .sign(new TextEncoder().encode("test-only-broker-key-at-least-32-bytes"));
    const broker = (target: string, path: string, body: unknown) => SELF.fetch(`https://sessions-mcp.example.com/api/sessions/${target}/${path}`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    expect((await broker(id, "relay", { app: "t3code", url: "https://t3.example.com/guest#x", project: "team" })).status).toBe(201);
    expect((await broker(id, "status", { status: "done" })).status).toBe(200);
    expect((await session(id)).done_at).toBeTypeOf("number");
    expect((await broker(crypto.randomUUID(), "status", { status: "done" })).status).toBe(403);
  });

  it("shows the status mark in lists and the pill in the reader, as a toggle only for those who can use it", async () => {
    const { project, id } = await fixture();
    const html = async (email: string, path: string) => (await call(email, path)).text();
    await put(ALICE, `/api/projects/${project}/members/${CAROL}`, { role: "writer" });
    expect(await html(BOB, `/s/${id}`)).toMatch(/<button class="status-pill" type="button" data-session-status="[^"]+" data-status="done" disabled>.*In progress.*Mark as done<\/span><\/button>/);
    const carolActive = await html(CAROL, `/s/${id}`);
    expect(carolActive).not.toContain("data-session-status=");
    expect(carolActive).not.toContain(`class="status-pill`);

    await setStatus(BOB, id, "done");
    const reader = await html(ALICE, `/s/${id}`);
    expect(reader).not.toContain('<span class="badge">Done</span>');
    expect(reader).toContain('<header class="dhead is-done">');
    expect(reader).toMatch(/class="status-pill is-done"[^>]*data-status="active" disabled>.*Done .*Reopen<\/span><\/button>/);
    expect(await html(CAROL, `/s/${id}`)).toMatch(/<span class="status-pill is-done">.*Done /);
    const list = await html(ALICE, `/projects/${project}`);
    expect(list).toContain('<article class="session-row is-done"><div class="session-main"><svg class="st is-done"');
    expect(list).toContain('aria-label="Done"');
    expect(list).not.toContain('<span class="badge">Done</span>');
    expect(list).toContain("Done</h2>");
    expect(list).not.toContain("En cours</h2>");
  });
});
