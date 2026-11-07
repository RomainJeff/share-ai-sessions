const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Soft retention: every read adds `last_synced_at > ?` bound to this. Nothing is purged from R2. */
export const VISIBLE = "last_synced_at > ?";
export const visibleSince = (now = Date.now()) => now - RETENTION_MS;

export const segmentKey = (id: string, n: number) => `sessions/${id}/seg-${String(n).padStart(4, "0")}.jsonl`;

export type Role = "owner" | "writer" | "reader";
export const ROLES: readonly Role[] = ["owner", "writer", "reader"];
const RANK: Record<Role, number> = { reader: 1, writer: 2, owner: 3 };
export const atLeast = (role: Role | null, min: Role) => role !== null && RANK[role] >= RANK[min];
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Moving a session or changing its status: its author with writer rights on its project, or an owner of that project. */
export const canManageSession = (role: Role | null, author: string, email: string) =>
  role === "owner" || (author === email && atLeast(role, "writer"));

/** `status=active|done` list filter; any other value lists both. */
export const statusFilter = (status: string | null) =>
  status === "active" ? "done_at IS NULL" : status === "done" ? "done_at IS NOT NULL" : null;

/** Reads add `AND ${MEMBER}` bound to the caller's email: a session outside your projects does not exist for you. */
export const MEMBER = "project IN (SELECT project FROM project_members WHERE email = lower(?))";

export async function roleIn(env: Env, project: string, email: string): Promise<Role | null> {
  const row = await env.DB.prepare("SELECT role FROM project_members WHERE project = ? AND email = lower(?)")
    .bind(project, email).first<{ role: Role }>();
  return row?.role ?? null;
}
