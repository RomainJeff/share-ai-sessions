import type { Identity } from "../auth";
import { canManageSession, MEMBER, roleIn, VISIBLE, visibleSince } from "../db";

/**
 * PUT /api/sessions/:id/status — mark a session done or active again, whatever produced it.
 * Same rights as a move; not activity, so last_synced_at stays as it was.
 */
export async function setSessionStatus(request: Request, env: Env, who: Identity, { id }: Record<string, string>): Promise<Response> {
  const session = await env.DB.prepare(`SELECT project, owner_email FROM sessions WHERE id = ? AND ${VISIBLE} AND ${MEMBER}`)
    .bind(id, visibleSince(), who.email).first<{ project: string; owner_email: string }>();
  if (!session) return Response.json({ error: "session not found" }, { status: 404 });
  if (!canManageSession(await roleIn(env, session.project, who.email), session.owner_email, who.email)) {
    return Response.json({ error: "session author with writer role or project owner required" }, { status: 403 });
  }
  let status: unknown;
  try {
    status = ((await request.json()) as { status?: unknown } | null)?.status;
  } catch { /* Reported below. */ }
  if (status !== "done" && status !== "active") return Response.json({ error: 'status must be "done" or "active"' }, { status: 400 });
  // Marking done twice keeps the first time.
  const row = await env.DB.prepare("UPDATE sessions SET done_at = CASE WHEN ? THEN COALESCE(done_at, ?) END WHERE id = ? RETURNING done_at")
    .bind(status === "done" ? 1 : 0, Date.now(), id).first<{ done_at: number | null }>();
  return Response.json({ id, status, done_at: row?.done_at ?? null });
}
