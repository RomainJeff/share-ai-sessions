import { MEMBER, VISIBLE, visibleSince, type Role } from "./db";

export type ProjectSummary = {
  slug: string;
  name: string;
  role: Role;
  members: number;
  sessions: number;
  last_synced_at: number | null;
  last_session_id: string | null;
  last_session_title: string | null;
};

/** Accessible projects, including empty ones; activity always comes from live sessions. */
export async function getProjectSummaries(env: Env, email: string): Promise<ProjectSummary[]> {
  const { results } = await env.DB.prepare(`
    WITH live_sessions AS (
      SELECT project, id, title, last_synced_at,
        COUNT(*) OVER (PARTITION BY project) AS sessions,
        ROW_NUMBER() OVER (PARTITION BY project ORDER BY last_synced_at DESC, id) AS position
      FROM sessions WHERE ${VISIBLE} AND ${MEMBER}
    )
    SELECT p.slug, p.name, p.created_by, p.created_at, m.role,
      (SELECT COUNT(*) FROM project_members WHERE project = p.slug) AS members,
      COALESCE(s.sessions, 0) AS sessions,
      s.last_synced_at, s.id AS last_session_id, s.title AS last_session_title
    FROM projects p
    JOIN project_members m ON m.project = p.slug AND m.email = lower(?)
    LEFT JOIN live_sessions s ON s.project = p.slug AND s.position = 1
    ORDER BY s.last_synced_at DESC, p.slug
  `).bind(visibleSince(), email, email).all<ProjectSummary>();
  return results;
}
