import type { Identity } from "../auth";
import { atLeast, MEMBER, SLUG, VISIBLE, visibleSince, type Role } from "../db";
import { getProjectSummaries, type ProjectSummary } from "../navigation";
import { activityNote, folder, groupedSessions, projectPath, roleLabel, type NavigationSession } from "../navigation-render";
import { dateLabel, escapeHtml as e, icon, page } from "../ui";

type ProjectMember = { email: string; role: Role };

const FILTERS = ["project", "repo", "author", "mine", "q", "from", "to"];
const notFound = () => page("Projet introuvable", "<h1>Projet introuvable</h1>", 404);
const selected = (value: string | null, option: string) => value === option ? " selected" : "";

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
  if (project) params.delete("project");
  if (params.get("mine") === "1") params.delete("author");
  const options = { active: project ? "projects" as const : "sessions" as const, projects, email: who.email, currentProject: project?.slug,
    breadcrumbs: project ? [{ label: "Projets", href: "/projects" }, { label: project.name }] : [{ label: "Toutes les sessions" }] };
  const where = [VISIBLE, MEMBER];
  const binds: (string | number)[] = [visibleSince(), who.email];
  const scope = project?.slug || params.get("project");
  if (scope) { where.push("project = ?"); binds.push(scope.toLowerCase()); }
  const repo = params.get("repo");
  if (repo) { where.push("repo = ?"); binds.push(repo.toLowerCase()); }
  const owner = params.get("mine") === "1" ? who.email : params.get("author");
  if (owner) { where.push("owner_email = ?"); binds.push(owner); }
  const q = params.get("q");
  if (q) { where.push("(title LIKE ? OR summary LIKE ?)"); binds.push(`%${q}%`, `%${q}%`); }
  for (const name of ["from", "to"]) {
    const value = params.get(name);
    if (!value) continue;
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
      return page("Période invalide", '<div class="empty"><h1>Période invalide</h1><p>Utilisez une date du calendrier au format AAAA-MM-JJ.</p></div>', 400, false, options);
    }
    // Inclusive UTC days use the same synchronization clock as activity ordering.
    where.push(`last_synced_at ${name === "from" ? ">=" : "<"} ?`);
    binds.push(time + (name === "to" ? 86400000 : 0));
  }
  const requested = Number(params.get("page"));
  const current = Number.isSafeInteger(requested) && requested > 0 && requested <= Math.floor(Number.MAX_SAFE_INTEGER / 100) ? requested : 1;
  const oldest = params.get("sort") === "oldest";
  const { results } = await env.DB.prepare(`SELECT id,title,summary,project,repo,owner_email,owner_name,msg_count,last_synced_at,continued_from,forked_from,forked_from_owner
    FROM sessions WHERE ${where.join(" AND ")} ORDER BY last_synced_at ${oldest ? "ASC" : "DESC"},id LIMIT 101 OFFSET ?`)
    .bind(...binds, (current - 1) * 100).all<NavigationSession>();
  // Author choices come from the whole live scope, never the current search or page.
  const { results: authors } = await env.DB.prepare(`SELECT owner_email,MAX(owner_name) AS owner_name FROM sessions
    WHERE ${VISIBLE} AND ${MEMBER}${scope ? " AND project = ?" : ""} GROUP BY owner_email ORDER BY owner_name,owner_email`)
    .bind(visibleSince(), who.email, ...(scope ? [scope.toLowerCase()] : [])).all<{ owner_email: string; owner_name: string }>();
  const rows = results.slice(0, 100);
  const returnTo = path + (params.size ? `?${params}` : "");
  const href = (changes: Record<string, string | null>) => {
    const query = new URLSearchParams(params);
    query.delete("page");
    for (const [key, value] of Object.entries(changes)) value === null ? query.delete(key) : query.set(key, value);
    return path + (query.size ? `?${query}` : "");
  };
  const filtered = FILTERS.some((key) => !!params.get(key));
  const total = project?.sessions ?? projects.reduce((sum, p) => sum + p.sessions, 0);
  const empty = rows.length ? "" : filtered || current > 1
    ? `<div class="empty"><h2>Aucune session ne correspond</h2><p>Essayez un autre titre, un autre auteur ou effacez les filtres.</p><a class="btn" href="${e(path)}">Effacer les filtres</a></div>`
    : `<div class="empty"><h2>${project ? "Ce projet attend sa première session" : "Aucune session récente"}</h2><p>${project && !atLeast(project.role, "writer") ? "Demandez à un membre disposant du droit d’écriture de partager une conversation dans ce projet." : "Partagez une conversation dans un projet pour la retrouver ici."}</p>
      ${project && atLeast(project.role, "writer") ? '<a class="btn" href="#share-help">Partager une première session</a>' : '<a class="btn" href="/projects">Voir les projets</a>'}</div>`;
  const mine = params.get("mine") === "1";
  return page(project?.name || "Toutes les sessions", `${project ? projectHeader(project, members) : '<div class="pagehead"><div><h1>Toutes les sessions</h1><p>Les conversations partagées dans vos projets.</p></div></div>'}
    ${total || filtered ? `<form method="get" action="${e(path)}" aria-label="Rechercher et filtrer les sessions">
      <div class="toolbar"><label class="searchbox">${icon("search")}<input name="q" type="search" aria-label="Titre ou résumé" placeholder="${project ? "Rechercher dans ce projet…" : "Rechercher une session…"}" value="${e(q)}"></label>
      <select class="field" name="author" aria-label="Filtrer par auteur"${mine ? " disabled" : ""}><option value="">Tous les auteurs</option>${authors.map((a) => `<option value="${e(a.owner_email)}"${selected(params.get("author"), a.owner_email)}>${e(a.owner_name || a.owner_email)}</option>`).join("")}${params.get("author") && !authors.some((a) => a.owner_email === params.get("author")) ? `<option value="${e(params.get("author"))}" selected>${e(params.get("author"))}</option>` : ""}</select>
      <select class="field" name="sort" aria-label="Trier par activité"><option value="recent"${!oldest ? " selected" : ""}>Activité la plus récente</option><option value="oldest"${oldest ? " selected" : ""}>Activité la plus ancienne</option></select>
      ${mine ? '<input type="hidden" name="mine" value="1">' : ""}<button class="btn" type="submit">Rechercher</button>
      <div class="segmented" aria-label="Sessions affichées"><a href="${e(href({ mine: null }))}"${!mine ? ' class="active" aria-current="true"' : ""}>Toutes</a><a href="${e(href({ mine: "1", author: null }))}"${mine ? ' class="active" aria-current="true"' : ""}>À moi</a></div></div>
      <details class="legacy-filters"${["repo", "from", "to", "project"].some((key) => params.get(key)) ? " open" : ""}><summary>Filtres complémentaires</summary><div class="toolbar">
      ${project ? "" : `<label class="f">Projet<select class="field" name="project"><option value="">Tous les projets</option>${projects.map((p) => `<option value="${e(p.slug)}"${selected(params.get("project"), p.slug)}>${e(p.name)}</option>`).join("")}</select></label>`}
      <label class="f">Repo (owner/repo)<input class="field" name="repo" value="${e(repo)}"></label>
      <label class="f">Depuis (UTC)<input class="field" type="date" name="from" value="${e(params.get("from"))}"></label>
      <label class="f">Jusqu’au (UTC)<input class="field" type="date" name="to" value="${e(params.get("to"))}"></label>
      <button class="btn" type="submit">Filtrer</button><a class="textlink" href="${e(path)}">Réinitialiser</a></div></details></form>` : ""}
    <div class="project-sessions${project ? " in-project" : " all-projects"}">${filtered && rows.length ? `<p class="result-count" role="status">${rows.length}${results.length > 100 ? "+" : ""} résultat${rows.length === 1 ? "" : "s"} sur cette page</p>` : ""}${groupedSessions(rows, projects, who.email, returnTo, !!project)}${empty}</div>
    ${current > 1 || results.length > 100 ? `<nav class="pagination" aria-label="Pagination des sessions">${current > 1 ? `<a class="btn" href="${e(href({ page: String(current - 1) }))}">Précédent</a>` : ""}<span>Page ${current}</span>${results.length > 100 ? `<a class="btn" href="${e(href({ page: String(current + 1) }))}">Suivant</a>` : ""}</nav>` : ""}${activityNote()}`, 200, false, options);
}

function projectHeader(p: ProjectSummary, members: ProjectMember[]): string {
  return `<div class="projecthead"><div class="pagehead"><div><div class="project-title">${folder()}<h1>${e(p.name)}</h1><span class="role">${roleLabel(p.role)}</span></div>
    <div class="project-info"><span>${p.sessions} session${p.sessions === 1 ? "" : "s"}</span><span>${p.members} membre${p.members === 1 ? "" : "s"}</span><span>${p.last_synced_at === null ? "Pas encore d’activité" : `Dernière synchro ${dateLabel(p.last_synced_at, true)}`}</span></div></div>
    ${p.role === "owner" ? `<a class="btn" href="${e(projectPath(p.slug))}/settings">Paramètres</a>` : ""}</div></div>
    <nav class="project-tabs" aria-label="Projet"><a href="${e(projectPath(p.slug))}" class="active" aria-current="page">Sessions</a>
      <details class="project-members"><summary>Membres (${members.length})</summary><div class="panel members-panel"><ul aria-label="Membres du projet">${members.map((member) => `<li><span>${e(member.email)}</span><span class="role">${roleLabel(member.role)}</span></li>`).join("")}</ul></div></details></nav>`;
}
