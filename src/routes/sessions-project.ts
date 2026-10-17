import type { Identity } from "../auth";
import { atLeast, MEMBER, roleIn, SLUG, VISIBLE, visibleSince } from "../db";

/** PUT /api/sessions/:id/project — explicit move; uploads never change a project's assignment. */
export async function moveSession(request: Request, env: Env, who: Identity, { id }: Record<string, string>): Promise<Response> {
  const session = await env.DB.prepare(`SELECT project, owner_email FROM sessions WHERE id = ? AND ${VISIBLE} AND ${MEMBER}`)
    .bind(id, visibleSince(), who.email).first<{ project: string; owner_email: string }>();
  if (!session) return Response.json({ error: "session not found" }, { status: 404 });
  const sourceRole = await roleIn(env, session.project, who.email);
  if (sourceRole !== "owner" && !(session.owner_email === who.email && atLeast(sourceRole, "writer"))) {
    return Response.json({ error: "session author with writer role or source project owner required" }, { status: 403 });
  }
  let project: string;
  try {
    const input = await request.json() as { project?: unknown } | null;
    project = typeof input?.project === "string" ? input.project.trim().toLowerCase() : "";
    if (!SLUG.test(project)) throw new Error();
  } catch {
    return Response.json({ error: "project slug required" }, { status: 400 });
  }
  const targetRole = await roleIn(env, project, who.email);
  if (!targetRole) return Response.json({ error: "project not found" }, { status: 404 });
  if (!atLeast(targetRole, "writer")) return Response.json({ error: "writer role required on destination project" }, { status: 403 });
  // Compare-and-set prevents concurrent moves from silently overwriting one another.
  const result = await env.DB.prepare("UPDATE sessions SET project = ?, updated_at = ? WHERE id = ? AND project = ?")
    .bind(project, Date.now(), id, session.project).run();
  if (!result.meta.changes) return Response.json({ error: "session project changed; refresh and retry" }, { status: 409 });
  return Response.json({ id, project, previous_project: session.project });
}
