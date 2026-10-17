import type { Identity } from "../auth";
import { MEMBER, VISIBLE, visibleSince } from "../db";
import { getProjectSummaries } from "../navigation";
import { activityNote, projectCard, sessionRow, type NavigationSession } from "../navigation-render";
import { page } from "../ui";

/** GET / — the most recently synchronized accessible conversations and projects. */
export async function homePage(_request: Request, env: Env, who: Identity): Promise<Response> {
  const projects = await getProjectSummaries(env, who.email);
  const { results } = await env.DB.prepare(`SELECT id,title,summary,project,repo,owner_email,owner_name,msg_count,last_synced_at,continued_from,forked_from,forked_from_owner
    FROM sessions WHERE ${VISIBLE} AND ${MEMBER} ORDER BY last_synced_at DESC,id LIMIT 5`)
    .bind(visibleSince(), who.email).all<NavigationSession>();
  const active = projects.filter((p) => p.last_synced_at !== null && p.last_synced_at > Date.now() - 7 * 86400000);
  const cards = (active.length ? active : projects).slice(0, 4);
  return page("Accueil", `<div class="pagehead"><div><h1>Accueil</h1><p>Retrouvez vos conversations et les projets qui avancent.</p></div></div>
    <section class="recent"><div class="section-head"><h2>Sessions récentes <span class="sub">Tous vos projets</span></h2><a class="textlink" href="/sessions">Toutes les sessions</a></div>
      <div class="session-list">${results.map((s) => sessionRow(s, projects, who.email, "/sessions")).join("") || '<div class="empty"><h2>Aucune session récente</h2><p>Les conversations partagées dans vos projets apparaîtront ici.</p><a class="btn" href="/projects">Voir les projets</a></div>'}</div></section>
    <section class="home-projects"><div class="section-head"><h2>${active.length ? 'Projets actifs <span class="sub">Activité dans les 7 derniers jours</span>' : "Vos projets"}</h2><a class="textlink" href="/projects">Tous les projets (${projects.length})</a></div>
      <div class="project-grid">${cards.map(projectCard).join("") || '<div class="empty"><h2>Aucun projet accessible</h2><p>Demandez à un propriétaire de vous ajouter à un projet.</p></div>'}</div></section>${activityNote()}`,
    200, false, { active: "home", projects, breadcrumbs: [{ label: "Accueil" }], email: who.email });
}
