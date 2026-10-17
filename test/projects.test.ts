import { SELF } from "cloudflare:test";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { ALICE, BOB, mintJwt } from "./jwt";

const BASE = "https://sessions.example.com";
const CAROL = "carol@example.com";
const as = (email: string) => mintJwt({ email });
const call = async (email: string, path: string, init: RequestInit = {}) =>
  SELF.fetch(BASE + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await as(email)}` } });
const json = (method: string, value: unknown): RequestInit =>
  ({ method, body: JSON.stringify(value), headers: { "Content-Type": "application/json" } });
const create = (email: string, slug: string) => call(email, "/api/projects", json("POST", { slug, name: `Project ${slug}` }));
const setRole = (email: string, slug: string, member: string, role: string) =>
  call(email, `/api/projects/${slug}/members/${encodeURIComponent(member)}`, json("PUT", { role }));
async function upload(email: string, meta: Record<string, unknown>) {
  const form = new FormData();
  form.set("meta", JSON.stringify(meta));
  form.set("jsonl", new File(['{"type":"user"}\n'], "s.jsonl"));
  return call(email, "/api/sessions", { method: "POST", body: form });
}
const slug = () => `p-${crypto.randomUUID().slice(0, 8)}`;

describe("projects", () => {
  it("creates a project with its creator as owner, once", async () => {
    const p = slug();
    expect((await create(ALICE, p)).status).toBe(201);
    expect((await create(BOB, p)).status).toBe(409);
    expect((await create(ALICE, "Not A Slug!")).status).toBe(400);
    const mine = (await (await call(ALICE, "/api/projects")).json()) as { projects: { slug: string; role: string }[] };
    expect(mine.projects.find((x) => x.slug === p)).toMatchObject({ role: "owner" });
    const bobs = (await (await call(BOB, "/api/projects")).json()) as { projects: { slug: string }[] };
    expect(bobs.projects.map((x) => x.slug)).not.toContain(p);
    expect((await call(BOB, `/api/projects/${p}`)).status).toBe(404);
  });

  it("hides sessions of projects you are not a member of, everywhere", async () => {
    const p = slug();
    await create(ALICE, p);
    const id = crypto.randomUUID();
    expect((await upload(ALICE, { id, project: p })).status).toBe(201);
    const listed = (await (await call(BOB, "/api/sessions")).json()) as { sessions: { id: string }[] };
    expect(listed.sessions.map((s) => s.id)).not.toContain(id);
    for (const path of [`/api/sessions/${id}`, `/api/sessions/${id}/bundle`, `/s/${id}`]) {
      expect((await call(BOB, path)).status).toBe(404);
    }
    expect(await (await call(BOB, "/")).text()).not.toContain(`/s/${id}`);
    expect((await call(ALICE, `/api/sessions/${id}`)).status).toBe(200);
  });

  it("lets readers read and pull but not upload; writers upload", async () => {
    const p = slug();
    await create(ALICE, p);
    const id = crypto.randomUUID();
    await upload(ALICE, { id, project: p });
    expect((await setRole(ALICE, p, BOB, "reader")).status).toBe(201);
    expect((await call(BOB, `/api/sessions/${id}/bundle`)).status).toBe(200);
    expect((await upload(BOB, { id: crypto.randomUUID(), project: p })).status).toBe(403);
    expect((await setRole(ALICE, p, BOB, "writer")).status).toBe(200);
    expect((await upload(BOB, { id: crypto.randomUUID(), project: p })).status).toBe(201);
  });

  it("requires a project for a new session, and membership in it", async () => {
    expect((await upload(ALICE, { id: crypto.randomUUID() })).status).toBe(400);
    expect((await upload(ALICE, { id: crypto.randomUUID(), project: "does-not-exist" })).status).toBe(403);
  });

  it("locks forks and re-uploads in the project of the origin", async () => {
    const p = slug();
    const elsewhere = slug();
    await create(ALICE, p);
    await create(BOB, elsewhere);
    await setRole(ALICE, p, BOB, "writer");
    const origin = crypto.randomUUID();
    await upload(ALICE, { id: origin, project: p });
    const fork = crypto.randomUUID();
    const moved = await upload(BOB, { id: fork, forked_from: origin, project: elsewhere });
    expect(moved.status).toBe(400);
    expect(await moved.json()).toMatchObject({ error: `project is locked to ${p}, the project of the forked session` });
    const inherited = await upload(BOB, { id: fork, forked_from: origin });
    expect(inherited.status).toBe(201);
    expect(await inherited.json()).toMatchObject({ project: p });
    expect((await upload(ALICE, { id: origin, project: elsewhere })).status).toBe(400);
    expect((await upload(ALICE, { id: origin })).status).toBe(200);
  });

  it("blocks sync once the owner is downgraded to reader", async () => {
    const p = slug();
    await create(ALICE, p);
    await setRole(ALICE, p, BOB, "writer");
    const id = crypto.randomUUID();
    await upload(BOB, { id, project: p });
    await setRole(ALICE, p, BOB, "reader");
    const res = await call(BOB, `/api/sessions/${id}`, { method: "PATCH", headers: { "X-Base-Offset": "16" }, body: '{"more":1}\n' });
    expect(res.status).toBe(403);
  });

  it("lets only owners manage members, and keeps at least one owner", async () => {
    const p = slug();
    await create(ALICE, p);
    await setRole(ALICE, p, BOB, "writer");
    expect((await setRole(BOB, p, CAROL, "reader")).status).toBe(403);
    expect((await setRole(ALICE, p, CAROL, "admin")).status).toBe(400);
    expect((await setRole(ALICE, p, "not-an-email", "reader")).status).toBe(400);
    expect((await setRole(ALICE, p, ALICE, "reader")).status).toBe(409);
    expect((await call(ALICE, `/api/projects/${p}/members/${ALICE}`, { method: "DELETE" })).status).toBe(409);
    await setRole(ALICE, p, CAROL, "reader");
    expect((await call(BOB, `/api/projects/${p}/members/${CAROL}`, { method: "DELETE" })).status).toBe(403);
    expect((await call(CAROL, `/api/projects/${p}/members/${CAROL}`, { method: "DELETE" })).status).toBe(200);
    const detail = (await (await call(ALICE, `/api/projects/${p}`)).json()) as { members: { email: string; role: string }[] };
    expect(detail.members).toEqual([
      expect.objectContaining({ email: ALICE, role: "owner" }),
      expect.objectContaining({ email: BOB, role: "writer" }),
    ]);
  });
});

describe("broker scopes on projects", () => {
  const ISS = "https://sessions-mcp.example.com";
  const forge = (scope: string) => new SignJWT({ scope }).setProtectedHeader({ alg: "HS256" }).setSubject(ALICE)
    .setIssuer(ISS).setAudience("session-share-cli").setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + 600)
    .sign(new TextEncoder().encode("test-only-broker-key-at-least-32-bytes"));
  const brokered = async (scope: string, path: string, init: RequestInit = {}) =>
    SELF.fetch(ISS + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await forge(scope)}` } });

  it("reads projects with read, manages them only with projects", async () => {
    expect((await brokered("read", "/api/projects")).status).toBe(200);
    expect((await brokered("read", "/api/projects", json("POST", { slug: slug() }))).status).toBe(403);
    const p = slug();
    expect((await brokered("projects", "/api/projects", json("POST", { slug: p }))).status).toBe(201);
    expect((await brokered("projects", `/api/projects/${p}/members/${BOB}`, json("PUT", { role: "reader" }))).status).toBe(201);
    expect((await brokered("projects", "/api/sessions")).status).toBe(403);
    const target = slug(), id = crypto.randomUUID();
    await create(ALICE, target);
    await upload(ALICE, { id, project: p });
    for (const scope of ["read", `write:${id}`]) {
      expect((await brokered(scope, `/api/sessions/${id}/project`, json("PUT", { project: target }))).status).toBe(403);
    }
    expect((await brokered("projects", `/api/sessions/${id}/project`, json("PUT", { project: target }))).status).toBe(200);
  });
});

describe("moving sessions between projects", () => {
  const move = (email: string, id: string, project: string) =>
    call(email, `/api/sessions/${id}/project`, json("PUT", { project }));

  async function fixture() {
    const source = slug(), target = slug(), id = crypto.randomUUID();
    await create(ALICE, source);
    await create(ALICE, target);
    await setRole(ALICE, source, BOB, "writer");
    await upload(BOB, { id, project: source, title: "Keep my transcript" });
    return { source, target, id };
  }

  it("lets a source owner move another author's session without changing its content or owner", async () => {
    const { source, target, id } = await fixture();
    const before = await (await call(ALICE, `/api/sessions/${id}/bundle`)).arrayBuffer();
    const moved = await move(ALICE, id, target);
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({ id, project: target, previous_project: source });
    expect(await (await call(ALICE, `/api/sessions/${id}`)).json()).toMatchObject({ owner_email: BOB, project: target });
    expect(await (await call(ALICE, `/api/sessions/${id}/bundle`)).arrayBuffer()).toEqual(before);
    expect((await call(BOB, `/api/sessions/${id}`)).status).toBe(404);
    expect((await call(BOB, `/api/sessions/${id}`, { method: "PATCH", headers: { "X-Base-Offset": "16" }, body: '{"more":1}\n' })).status).toBe(403);
    await setRole(ALICE, target, BOB, "writer");
    expect((await upload(BOB, { id })).status).toBe(200);
    expect(await (await call(BOB, `/api/sessions/${id}`)).json()).toMatchObject({ project: target });
    const projects = await (await call(ALICE, "/api/projects")).json() as { projects: {slug: string; sessions: number}[] };
    expect(projects.projects.find(p => p.slug === source)?.sessions).toBe(0);
    expect(projects.projects.find(p => p.slug === target)?.sessions).toBe(1);
  });

  it("offers writable destinations only to the session author or source owner", async () => {
    const { source, target, id } = await fixture();
    const readOnly = slug();
    await create(CAROL, readOnly);
    await setRole(CAROL, readOnly, ALICE, "reader");
    const options: string[] = [];
    let forms = 0;
    await new HTMLRewriter().on("form[data-session-move]", { element() { forms++; } })
      .on("form[data-session-move] option", { element(e) { options.push(e.getAttribute("value")!); } })
      .transform(await call(ALICE, `/s/${id}`)).text();
    expect(forms).toBe(1);
    expect(options).toContain(target);
    expect(options).not.toContain(source);
    expect(options).not.toContain(readOnly);
    await setRole(ALICE, source, CAROL, "writer");
    expect(await (await call(CAROL, `/s/${id}`)).text()).not.toContain("data-session-move=");
  });

  it("lets a session author move it with writer rights in both projects", async () => {
    const { source, target, id } = await fixture();
    await setRole(ALICE, target, BOB, "writer");
    expect((await move(BOB, id, target)).status).toBe(200);
    expect((await move(BOB, id, target)).status).toBe(200);
    expect(await (await call(BOB, `/api/sessions/${id}`)).json()).toMatchObject({ project: target });
    expect((await move(BOB, id, source)).status).toBe(200);
  });

  it("rejects readers, unrelated writers, hidden destinations and invalid input without moving", async () => {
    const { source, target, id } = await fixture();
    expect((await move(BOB, id, target)).status).toBe(404);
    await setRole(ALICE, target, BOB, "reader");
    expect((await move(BOB, id, target)).status).toBe(403);
    await setRole(ALICE, target, BOB, "writer");
    await setRole(ALICE, source, BOB, "reader");
    expect((await move(BOB, id, target)).status).toBe(403);
    await setRole(ALICE, source, CAROL, "writer");
    await setRole(ALICE, target, CAROL, "writer");
    expect((await move(CAROL, id, target)).status).toBe(403);
    expect((await move(ALICE, crypto.randomUUID(), target)).status).toBe(404);
    expect((await move(ALICE, id, "../invalid")).status).toBe(400);
    expect((await call(ALICE, `/api/sessions/${id}/project`, { method: "PUT", body: "{" })).status).toBe(400);
    expect(await (await call(ALICE, `/api/sessions/${id}`)).json()).toMatchObject({ project: source });
  });
});
