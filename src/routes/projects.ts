import type { Identity } from "../auth";
import { atLeast, roleIn, ROLES, SLUG, type Role } from "../db";
import { getProjectSummaries } from "../navigation";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (error: string, status: number) => Response.json({ error }, { status });
// Members are listed only to members; a project you are not in answers 404, like a session.
const notFound = () => fail("project not found", 404);

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** GET /api/projects — the caller's projects, with their role and live session count. */
export async function listProjects(_request: Request, env: Env, who: Identity): Promise<Response> {
  return Response.json({ projects: await getProjectSummaries(env, who.email) });
}

/** POST /api/projects {slug, name?} — the creator becomes its first owner. */
export async function createProject(request: Request, env: Env, who: Identity): Promise<Response> {
  const input = await body(request);
  const slug = typeof input?.slug === "string" ? input.slug.trim().toLowerCase() : "";
  if (!SLUG.test(slug)) return fail("slug must be 1-64 chars: a-z, 0-9 and inner dashes", 400);
  const name = typeof input?.name === "string" && input.name.trim() ? input.name.trim().slice(0, 200) : slug;
  const now = Date.now();
  const me = who.email.toLowerCase();
  const [created] = await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO projects (slug, name, created_by, created_at) VALUES (?, ?, ?, ?)").bind(slug, name, me, now),
    // Only joins as owner when this very batch created the project.
    env.DB.prepare(`INSERT INTO project_members (project, email, role, added_by, added_at)
      SELECT ?, ?, 'owner', ?, ? WHERE changes() = 1`).bind(slug, me, me, now),
  ]);
  if (!created!.meta.changes) return fail("project already exists", 409);
  return Response.json({ slug, name, role: "owner" }, { status: 201 });
}

/** GET /api/projects/:slug — project and members, for members only. */
export async function getProject(_request: Request, env: Env, who: Identity, { slug }: Record<string, string>): Promise<Response> {
  const role = await roleIn(env, slug!, who.email);
  if (!role) return notFound();
  const project = await env.DB.prepare("SELECT slug, name, created_by, created_at FROM projects WHERE slug = ?").bind(slug).first();
  const { results } = await env.DB.prepare(
    "SELECT email, role, added_by, added_at FROM project_members WHERE project = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'writer' THEN 1 ELSE 2 END, email",
  ).bind(slug).all();
  return Response.json({ ...project, role, members: results });
}

async function owners(env: Env, slug: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM project_members WHERE project = ? AND role = 'owner'").bind(slug).first<{ n: number }>();
  return row?.n ?? 0;
}

/** PUT /api/projects/:slug/members/:email {role} — owners add a member or change a role. */
export async function putMember(request: Request, env: Env, who: Identity, params: Record<string, string>): Promise<Response> {
  const slug = params.slug!;
  const email = decodeURIComponent(params.email!).trim().toLowerCase();
  const callerRole = await roleIn(env, slug, who.email);
  if (!callerRole) return notFound();
  if (!atLeast(callerRole, "owner")) return fail("owner role required", 403);
  if (!EMAIL.test(email)) return fail("invalid email", 400);
  const input = await body(request);
  const role = input?.role as Role;
  if (!ROLES.includes(role)) return fail(`role must be one of ${ROLES.join(", ")}`, 400);
  const current = await roleIn(env, slug, email);
  if (current === "owner" && role !== "owner" && (await owners(env, slug)) === 1) return fail("a project keeps at least one owner", 409);
  await env.DB.prepare(`INSERT INTO project_members (project, email, role, added_by, added_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (project, email) DO UPDATE SET role = excluded.role`).bind(slug, email, role, who.email.toLowerCase(), Date.now()).run();
  return Response.json({ project: slug, email, role, previous: current }, { status: current ? 200 : 201 });
}

/** DELETE /api/projects/:slug/members/:email — owners remove anyone, members can leave. */
export async function deleteMember(_request: Request, env: Env, who: Identity, params: Record<string, string>): Promise<Response> {
  const slug = params.slug!;
  const email = decodeURIComponent(params.email!).trim().toLowerCase();
  const callerRole = await roleIn(env, slug, who.email);
  if (!callerRole) return notFound();
  if (email !== who.email.toLowerCase() && !atLeast(callerRole, "owner")) return fail("owner role required", 403);
  const current = await roleIn(env, slug, email);
  if (!current) return fail("not a member", 404);
  if (current === "owner" && (await owners(env, slug)) === 1) return fail("a project keeps at least one owner", 409);
  await env.DB.prepare("DELETE FROM project_members WHERE project = ? AND email = ?").bind(slug, email).run();
  return Response.json({ project: slug, email, removed: true });
}
