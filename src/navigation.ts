import { MEMBER, VISIBLE, visibleSince, type Role } from "./db";

export type ProjectSummary = {
  slug: string;
  name: string;
  role: Role;
  members: number;
  sessions: number;
  done: number;
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
        SUM(done_at IS NOT NULL) OVER (PARTITION BY project) AS done,
        ROW_NUMBER() OVER (PARTITION BY project ORDER BY last_synced_at DESC, id) AS position
      FROM sessions WHERE ${VISIBLE} AND ${MEMBER}
    )
    SELECT p.slug, p.name, p.created_by, p.created_at, m.role,
      (SELECT COUNT(*) FROM project_members WHERE project = p.slug) AS members,
      COALESCE(s.sessions, 0) AS sessions, COALESCE(s.done, 0) AS done,
      s.last_synced_at, s.id AS last_session_id, s.title AS last_session_title
    FROM projects p
    JOIN project_members m ON m.project = p.slug AND m.email = lower(?)
    LEFT JOIN live_sessions s ON s.project = p.slug AND s.position = 1
    ORDER BY s.last_synced_at DESC, p.slug
  `).bind(visibleSince(), email, email).all<ProjectSummary>();
  return results;
}

export type SidebarSession = {
  id: string; title: string | null; project: string; branch: string | null; repo: string | null;
  owner_email: string; owner_name: string; last_synced_at: number; external_app: string | null; forked_from: string | null;
};

/** In-progress sessions for the sidebar, most recent sync first. */
export async function getSidebarSessions(env: Env, email: string): Promise<SidebarSession[]> {
  // ponytail: fixed cap, paginate if a member ever has more than 200 sessions in progress.
  const { results } = await env.DB.prepare(`SELECT id,title,project,branch,repo,owner_email,owner_name,last_synced_at,external_app,forked_from
    FROM sessions WHERE ${VISIBLE} AND ${MEMBER} AND done_at IS NULL ORDER BY last_synced_at DESC,id LIMIT 200`)
    .bind(visibleSince(), email).all<SidebarSession>();
  return results;
}

/** Everything the navigation shell needs, in one round of parallel queries. */
export async function getNavigation(env: Env, email: string) {
  const [projects, sidebar] = await Promise.all([getProjectSummaries(env, email), getSidebarSessions(env, email)]);
  return { projects, sidebar };
}
