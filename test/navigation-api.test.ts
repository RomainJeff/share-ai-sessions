import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Role } from "../src/db";
import { mintJwt } from "./jwt";

const DAY = 24 * 60 * 60 * 1000;

function fixture(email: string) {
  async function project(slug: string, role: Role | null = "owner") {
    await env.DB.prepare("INSERT INTO projects (slug, name, created_by, created_at) VALUES (?, ?, ?, 10)")
      .bind(slug, `Project ${slug}`, email).run();
    await env.DB.prepare("INSERT INTO project_members VALUES (?, ?, ?, ?, 10)")
      .bind(slug, role ? email : "outsider@example.com", role ?? "owner", email).run();
  }

  async function session(id: string, slug: string, synced: number, updated: number, title = id) {
    await env.DB.prepare(`INSERT INTO sessions
      (id, owner_email, owner_name, repo, project, title, created_at, updated_at, last_synced_at)
      VALUES (?, ?, 'Navigation', 'nav/test', ?, ?, 10, ?, ?)`)
      .bind(id, email, slug, title, updated, synced).run();
  }

  async function get(path: string) {
    const response = await SELF.fetch(`https://sessions.example.com${path}`, {
      headers: { Authorization: `Bearer ${await mintJwt({ email: email.toUpperCase() })}` },
    });
    expect(response.status).toBe(200);
    return response;
  }
  return { project, session, get };
}

describe("navigation API recency", () => {
  it("summarizes only accessible live sessions, retains empty projects and orders tied projects by slug", async () => {
    const email = "navigation-summary@example.com";
    const { project, session, get } = fixture(email);
    const now = Date.now();
    await project("nav-a-old", "reader");
    await project("nav-b-new", "writer");
    await project("nav-c-tied");
    await project("nav-d-empty");
    await project("nav-e-expired");
    await project("nav-z-hidden", null);
    await env.DB.prepare("INSERT INTO project_members VALUES ('nav-b-new', 'colleague@example.com', 'reader', ?, 10)")
      .bind(email).run();
    await session("old-live", "nav-a-old", now - 89 * DAY, now);
    await session("new-z", "nav-b-new", now - 1000, 20);
    await session("new-a", "nav-b-new", now - 1000, 10, "Latest chosen deterministically");
    await session("new-expired", "nav-b-new", now - 91 * DAY, now + DAY, "Expired title");
    await session("tied-live", "nav-c-tied", now - 1000, 30);
    await session("expired-only", "nav-e-expired", now - 91 * DAY, now);
    await session("hidden-live", "nav-z-hidden", now, now, "Secret title");

    const result = await (await get("/api/projects")).json() as {
      projects: { slug: string; name: string; role: Role; members: number; sessions: number;
        created_by: string; created_at: number; last_synced_at: number | null;
        last_session_id: string | null; last_session_title: string | null }[];
    };
    expect(result.projects.map(p => p.slug)).toEqual([
      "nav-b-new", "nav-c-tied", "nav-a-old", "nav-d-empty", "nav-e-expired",
    ]);
    expect(result.projects[0]).toMatchObject({
      name: "Project nav-b-new", role: "writer", members: 2, sessions: 2,
      created_by: email, created_at: 10, last_synced_at: now - 1000,
      last_session_id: "new-a", last_session_title: "Latest chosen deterministically",
    });
    expect(result.projects[2]).toMatchObject({ role: "reader", sessions: 1 });
    for (const empty of result.projects.slice(3)) {
      expect(empty).toMatchObject({ sessions: 0, last_synced_at: null, last_session_id: null, last_session_title: null });
    }
  });

  it("lists by last sync across projects with deterministic session ties, excluding expired and hidden rows", async () => {
    const { project, session, get } = fixture("navigation-list@example.com");
    const now = Date.now();
    await project("list-a", "reader");
    await project("list-b", "writer");
    await project("list-hidden", null);
    await session("z-recent", "list-a", now - 1000, 10);
    await session("a-recent", "list-b", now - 1000, 20);
    await session("old-updated", "list-b", now - 2000, now);
    await session("expired", "list-a", now - 91 * DAY, now + DAY);
    await session("hidden", "list-hidden", now, now);

    const result = await (await get("/api/sessions")).json() as { sessions: { id: string; last_synced_at: number }[] };
    expect(result.sessions.map(s => s.id)).toEqual(["a-recent", "z-recent", "old-updated"]);
    expect(result.sessions[0]?.last_synced_at).toBe(now - 1000);
  });
});
