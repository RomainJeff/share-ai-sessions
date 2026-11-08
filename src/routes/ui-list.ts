import type { Identity } from "../auth";
import { atLeast, MEMBER, SLUG, VISIBLE, visibleSince, type Role } from "../db";
import { getProjectSummaries, type ProjectSummary } from "../navigation";
import { activityNote, folder, groupedSessions, projectPath, roleLabel, type NavigationSession } from "../navigation-render";
import { dateLabel, escapeHtml as e, icon, page } from "../ui";

type ProjectMember = { email: string; role: Role };

const notFound = () => page("Projet introuvable", "<h1>Projet introuvable</h1>", 404);

/** GET /sessions — all live conversations in accessible projects. */
export async function sessionListPage(request: Request, env: Env, who: Identity): Promise<Response> {
  return renderList(request, env, who);
}

/** GET /projects/:slug — a project remains available even before its first session. */
export async function projectSessionsPage(request: Request, env: Env, who: Identity, { slug }: Record<string, string>): Promise<Response> {
  if (!slug || !SLUG.test(slug)) return notFound();
  return renderList(request, env, who, slug);
}

async function renderList(request: Request, env: Env, who: Identity, slug?: string): Promise<Response> {
  const projects = await getProjectSummaries(env, who.email);
  const project = slug ? projects.find((p) => p.slug === slug) : undefined;
  if (slug && !project) return notFound();
  const members = project ? (await env.DB.prepare(`SELECT email,role FROM project_members WHERE project = ?
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'writer' THEN 1 ELSE 2 END,email`)
    .bind(project.slug).all<ProjectMember>()).results : [];
  const path = project ? projectPath(project.slug) : "/sessions";
  const params = new URL(request.url).searchParams;
  const options = { active: project ? "projects" as const : "sessions" as const, projects, email: who.email, currentProject: project?.slug,
    breadcrumbs: project ? [{ label: "Projets", href: "/projects" }, { label: project.name }] : [{ label: "Toutes les sessions" }] };
  const where = [VISIBLE, MEMBER];
  const binds: (string | number)[] = [visibleSince(), who.email];
  if (project) { where.push("project = ?"); binds.push(project.slug); }
  const q = params.get("q");
  if (q) { where.push("(title LIKE ? OR summary LIKE ?)"); binds.push(`%${q}%`, `%${q}%`); }
  const requested = Number(params.get("page"));
  const current = Number.isSafeInteger(requested) && requested > 0 && requested <= Math.floor(Number.MAX_SAFE_INTEGER / 100) ? requested : 1;
  // In-progress sessions first, then finished ones; each group by latest synchronization.
  const { results } = await env.DB.prepare(`SELECT id,title,summary,project,repo,owner_email,owner_name,msg_count,last_synced_at,continued_from,forked_from,forked_from_owner,external_app,done_at
    FROM sessions WHERE ${where.join(" AND ")} ORDER BY done_at IS NOT NULL,last_synced_at DESC,id LIMIT 101 OFFSET ?`)
    .bind(...binds, (current - 1) * 100).all<NavigationSession>();
  const rows = results.slice(0, 100);
  const query = (page: number) => {
    const next = new URLSearchParams(q ? { q } : {});
    if (page > 1) next.set("page", String(page));
    return path + (next.size ? `?${next}` : "");
  };
  const returnTo = query(current);
  const total = project?.sessions ?? projects.reduce((sum, p) => sum + p.sessions, 0);
  const empty = rows.length ? "" : q || current > 1
    ? `<div class="empty"><h2>Aucune session ne correspond</h2><p>Essayez un autre titre ou effacez la recherche.</p><a class="btn" href="${e(path)}">Effacer la recherche</a></div>`
    : `<div class="empty"><h2>${project ? "Ce projet attend sa première session" : "Aucune session récente"}</h2><p>${project && !atLeast(project.role, "writer") ? "Demandez à un membre disposant du droit d’écriture de partager une conversation dans ce projet." : "Partagez une conversation dans un projet pour la retrouver ici."}</p>
      ${project && atLeast(project.role, "writer") ? '<a class="btn" href="#share-help">Partager une première session</a>' : '<a class="btn" href="/projects">Voir les projets</a>'}</div>`;
  return page(project?.name || "Toutes les sessions", `${project ? projectHeader(project, members) : '<div class="pagehead"><div><h1>Toutes les sessions</h1><p>Les conversations partagées dans vos projets.</p></div></div>'}
    ${total || q ? `<form class="toolbar" method="get" action="${e(path)}" aria-label="Rechercher une session"><label class="searchbox">${icon("search")}<input name="q" type="search" aria-label="Titre ou résumé" placeholder="${project ? "Rechercher dans ce projet…" : "Rechercher une session…"}" value="${e(q)}"></label></form>` : ""}
    <div class="project-sessions${project ? " in-project" : " all-projects"}">${q && rows.length ? `<p class="result-count" role="status">${rows.length}${results.length > 100 ? "+" : ""} résultat${rows.length === 1 ? "" : "s"} sur cette page</p>` : ""}${groupedSessions(rows, projects, who.email, returnTo, !!project)}${empty}</div>
    ${current > 1 || results.length > 100 ? `<nav class="pagination" aria-label="Pagination des sessions">${current > 1 ? `<a class="btn" href="${e(query(current - 1))}">Précédent</a>` : ""}<span>Page ${current}</span>${results.length > 100 ? `<a class="btn" href="${e(query(current + 1))}">Suivant</a>` : ""}</nav>` : ""}${activityNote()}`, 200, false, options);
}

function projectHeader(p: ProjectSummary, members: ProjectMember[]): string {
  return `<div class="projecthead"><div class="pagehead"><div><div class="project-title">${folder()}<h1>${e(p.name)}</h1><span class="role">${roleLabel(p.role)}</span></div>
    <div class="project-info"><span>${p.sessions} session${p.sessions === 1 ? "" : "s"}</span><span>${p.members} membre${p.members === 1 ? "" : "s"}</span><span>${p.last_synced_at === null ? "Pas encore d’activité" : `Dernière synchro ${dateLabel(p.last_synced_at, true)}`}</span></div></div>
    ${p.role === "owner" ? `<a class="btn" href="${e(projectPath(p.slug))}/settings">Paramètres</a>` : ""}</div></div>
    <nav class="project-tabs" aria-label="Projet"><a href="${e(projectPath(p.slug))}" class="active" aria-current="page">Sessions</a>
      <details class="project-members"><summary>Membres (${members.length})</summary><div class="panel members-panel"><ul aria-label="Membres du projet">${members.map((member) => `<li><span>${e(member.email)}</span><span class="role">${roleLabel(member.role)}</span></li>`).join("")}</ul></div></details></nav>`;
}
