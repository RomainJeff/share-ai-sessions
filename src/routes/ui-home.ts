import type { Identity } from "../auth";
import { MEMBER, VISIBLE, visibleSince } from "../db";
import { getProjectSummaries } from "../navigation";
import { activityNote, projectCard, sessionRow, type NavigationSession } from "../navigation-render";
import { page } from "../ui";

/** GET / — in-progress, then finished, most recently synchronized accessible conversations, and projects. */
export async function homePage(_request: Request, env: Env, who: Identity): Promise<Response> {
  const projects = await getProjectSummaries(env, who.email);
  const { results } = await env.DB.prepare(`SELECT id,title,summary,project,repo,owner_email,owner_name,msg_count,last_synced_at,continued_from,forked_from,forked_from_owner,external_app,done_at
    FROM sessions WHERE ${VISIBLE} AND ${MEMBER} ORDER BY done_at IS NOT NULL,last_synced_at DESC,id LIMIT 5`)
    .bind(visibleSince(), who.email).all<NavigationSession>();
  const active = projects.filter((p) => p.last_synced_at !== null && p.last_synced_at > Date.now() - 7 * 86400000);
  const cards = (active.length ? active : projects).slice(0, 4);
  return page("Home", `<div class="pagehead"><div><h1>Home</h1><p>Your conversations and the projects moving forward.</p></div></div>
    <section class="recent"><div class="section-head"><h2>Recent sessions <span class="sub">All your projects</span></h2><a class="textlink" href="/sessions">All sessions</a></div>
      <div class="session-list">${results.map((s) => sessionRow(s, projects, who.email, "/sessions")).join("") || '<div class="empty"><h2>No recent sessions</h2><p>Conversations shared in your projects will appear here.</p><a class="btn" href="/projects">View projects</a></div>'}</div></section>
    <section class="home-projects"><div class="section-head"><h2>${active.length ? 'Active projects <span class="sub">Activity in the last 7 days</span>' : "Your projects"}</h2><a class="textlink" href="/projects">All projects (${projects.length})</a></div>
      <div class="project-grid">${cards.map(projectCard).join("") || '<div class="empty"><h2>No accessible projects</h2><p>Ask an owner to add you to a project.</p></div>'}</div></section>${activityNote()}`,
    200, false, { active: "home", projects, breadcrumbs: [{ label: "Home" }], email: who.email });
}
