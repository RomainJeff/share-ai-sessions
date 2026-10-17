import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { BOB, mintJwt } from "./jwt";

const ORIGIN = "https://sessions.example.com";
let viewer = "";
beforeEach(() => { viewer = `nav-${crypto.randomUUID()}@example.com`; });
const get = async (path: string, email = viewer) => SELF.fetch(ORIGIN + path, {
  headers: { "Cf-Access-Jwt-Assertion": await mintJwt({ email }) },
});
async function project(role = "owner", name = "Navigation project") {
  const slug = `nav-${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.prepare("INSERT INTO projects VALUES (?, ?, ?, ?)").bind(slug, name, viewer, Date.now()).run();
  await env.DB.prepare("INSERT INTO project_members VALUES (?, ?, ?, ?, ?)").bind(slug, viewer, role, viewer, Date.now()).run();
  return slug;
}
async function session(slug: string, title: string, synced: number, email = viewer) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO sessions (id,owner_email,owner_name,project,repo,title,summary,msg_count,created_at,updated_at,last_synced_at)
    VALUES (?, ?, ?, ?, 'nav/repo', ?, 'Navigation summary', 12, ?, ?, ?)`)
    .bind(id, email, email === viewer ? "Alice" : "Bob", slug, title, synced, synced, synced).run();
  return id;
}
async function attributes(response: Response, selector: string, name = "href") {
  const values: string[] = [];
  await new HTMLRewriter().on(selector, { element(e) { const value = e.getAttribute(name); if (value !== null) values.push(value.replaceAll("&amp;", "&")); } }).transform(response).text();
  return values;
}

describe("navigation pages", () => {
  it("shows the five latest live accessible sessions on the home page, with empty projects still reachable", async () => {
    const p = await project();
    const empty = await project("reader", "Empty navigation project");
    const now = Date.now();
    const ids: string[] = [];
    for (let n = 0; n < 6; n++) ids.push(await session(p, `Recent ${n}`, now + n));
    const stale = await session(p, "Stale conversation", now - 91 * 86400000);
    const hiddenProject = await project();
    const hidden = await session(hiddenProject, "Hidden conversation", now + 100);
    await env.DB.prepare("DELETE FROM project_members WHERE project = ?").bind(hiddenProject).run();
    // Moving metadata must not make the sixth conversation newer than synchronized ones.
    await env.DB.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").bind(now + 10000, ids[0]).run();
    const links = await attributes(await get("/"), ".recent .session-title");
    expect(links.map((link) => new URL(link, ORIGIN).pathname)).toEqual(ids.slice(1).reverse().map((id) => `/s/${id}`));
    expect(links.join(" ")).not.toContain(stale);
    expect(links.join(" ")).not.toContain(hidden);
    const projects = await attributes(await get("/projects"), ".project-table-row h3 a");
    expect(projects).toContain(`/projects/${empty}`);
    expect(projects).not.toContain(`/projects/${hiddenProject}`);
  });

  it("keeps all live project authors available under search, and preserves filters in mine and session links", async () => {
    const p = await project("owner", 'A <script>project</script>');
    const id = await session(p, "Needle Alice", Date.now());
    await session(p, "Different Bob", Date.now() - 1000, BOB);
    const path = `/projects/${p}?q=Needle&repo=nav%2Frepo&sort=oldest&author=${encodeURIComponent(viewer)}`;
    const response = await get(path);
    expect(response.status).toBe(200);
    const html = await response.clone().text();
    expect(html).toContain('A &lt;script&gt;project&lt;/script&gt;');
    expect(html).not.toContain("<script>project</script>");
    const authors = await attributes(response.clone(), 'select[name="author"] option', "value");
    expect(authors).toContain(BOB);
    const links = await attributes(response.clone(), ".session-title");
    expect(links).toHaveLength(1);
    expect(new URL(links[0]!, ORIGIN).pathname).toBe(`/s/${id}`);
    expect(new URL(links[0]!, ORIGIN).searchParams.get("return")).toBe(path);
    const mine = (await attributes(response, ".segmented a")).map((href) => new URL(href, ORIGIN)).find((url) => url.searchParams.get("mine") === "1")!;
    expect(mine.searchParams.get("q")).toBe("Needle");
    expect(mine.searchParams.get("repo")).toBe("nav/repo");
    expect(mine.searchParams.has("author")).toBe(false);
    expect(await attributes(await get(mine.pathname + mine.search), 'select[name="author"]', "disabled")).toEqual([""]);
    expect(await attributes(await get(mine.pathname + mine.search), ".session-title")).toHaveLength(1);
    expect((await get(`/projects/${p}`, BOB)).status).toBe(404);
    expect((await get(`/projects/${p}/settings`, BOB)).status).toBe(404);
  });

  it("distinguishes an empty reader project from an owner project and from a search without results", async () => {
    const reader = await project("reader");
    const owner = await project();
    const ownerEmail = `owner-${crypto.randomUUID()}@example.com`;
    await env.DB.prepare("INSERT INTO project_members VALUES (?, ?, 'owner', ?, ?)").bind(reader, ownerEmail, viewer, Date.now()).run();
    const readerResponse = await get(`/projects/${reader}`);
    expect(await attributes(readerResponse.clone(), ".project-members", "open")).toEqual([]);
    const readerHtml = await (await get(`/projects/${reader}`)).text();
    expect(readerHtml).toContain("Ce projet attend sa première session");
    expect(readerHtml).toContain("Membres (2)");
    const memberText: string[] = [];
    await new HTMLRewriter().on(".members-panel li", { text(chunk) { memberText.push(chunk.text); } }).transform(readerResponse).text();
    const allMembers = memberText.join("");
    expect(allMembers).toContain(viewer);
    expect(allMembers).toContain(ownerEmail);
    expect(allMembers).toContain("Propriétaire");
    expect(allMembers).toContain("Lecture seule");
    expect(readerHtml).not.toContain(`/projects/${reader}/settings`);
    expect(await attributes(new Response(readerHtml), "form[data-project-member]", "data-project-member")).toEqual([]);
    expect((await get(`/projects/${reader}`, BOB)).status).toBe(404);
    expect(readerHtml).toContain("Demandez à un membre disposant du droit d’écriture");
    expect(readerHtml).not.toContain("Partager une première session");
    const ownerHtml = await (await get(`/projects/${owner}`)).text();
    expect(ownerHtml).toContain('href="#share-help">Partager une première session');
    expect(ownerHtml).toContain(`href="/projects/${owner}/settings"`);
    await session(owner, "An existing conversation", Date.now());
    const missing = await (await get(`/projects/${owner}?q=unmatched`)).text();
    expect(missing).toContain("Aucune session ne correspond");
    expect(missing).toContain(`href="/projects/${owner}">Effacer les filtres`);
  });

  it("paginates project sessions by 100 without dropping the author, search, or date filters", async () => {
    const p = await project();
    const now = Date.now();
    await env.DB.batch(Array.from({ length: 101 }, (_, n) => env.DB.prepare(`INSERT INTO sessions
      (id,owner_email,owner_name,project,repo,title,created_at,updated_at,last_synced_at)
      VALUES (?,?,'Alice',?,'nav/repo','Paging needle',?,?,?)`).bind(crypto.randomUUID(), viewer, p, now, now, now + n)));
    const query = `q=needle&author=${encodeURIComponent(viewer)}&from=2020-01-01`;
    const first = await get(`/projects/${p}?${query}`);
    const firstLinks = await attributes(first.clone(), ".session-title");
    expect(firstLinks).toHaveLength(100);
    const next = (await attributes(first, ".pagination a"))[0]!;
    const nextUrl = new URL(next, ORIGIN);
    expect(nextUrl.pathname).toBe(`/projects/${p}`);
    expect(nextUrl.searchParams.get("q")).toBe("needle");
    expect(nextUrl.searchParams.get("author")).toBe(viewer);
    expect(nextUrl.searchParams.get("from")).toBe("2020-01-01");
    expect(nextUrl.searchParams.get("page")).toBe("2");
    const secondLinks = await attributes(await get(nextUrl.pathname + nextUrl.search), ".session-title");
    expect(secondLinks).toHaveLength(1);
    expect(firstLinks.map((link) => new URL(link, ORIGIN).pathname)).not.toContain(new URL(secondLinks[0]!, ORIGIN).pathname);
    expect((await get(`/projects/${p}?from=2026-02-31`)).status).toBe(400);
  });
});
