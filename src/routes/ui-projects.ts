import type { Identity } from "../auth";
import { atLeast, roleIn, ROLES, SLUG, type Role } from "../db";
import { dateLabel, escapeHtml as e, page } from "../ui";
import { getProject } from "./projects";
import { getProjectSummaries } from "../navigation";
import { activityNote, folder, projectPath, roleLabel } from "../navigation-render";

type Project = { slug: string; name: string; role: Role; sessions: number };
type Member = { email: string; role: Role; added_by: string; added_at: number };
const sessionsLink = (slug: string) => e(projectPath(slug));
const roles = (selected: Role) => ROLES.map((role) =>
  `<option value="${e(role)}"${role === selected ? " selected" : ""}>${e(role)}</option>`).join("");

/** GET /projects — all accessible projects, including empty spaces. */
export async function projectsPage(request: Request, env: Env, who: Identity): Promise<Response> {
  const projects = await getProjectSummaries(env, who.email);
  const params = new URL(request.url).searchParams;
  const q = params.get("q") || "";
  const oldest = params.get("sort") === "oldest";
  const filtered = projects.filter((p) => `${p.name} ${p.slug}`.toLowerCase().includes(q.toLowerCase()));
  if (oldest) filtered.sort((a, b) => a.last_synced_at === null ? b.last_synced_at === null ? a.slug.localeCompare(b.slug) : 1 : b.last_synced_at === null ? -1 : a.last_synced_at - b.last_synced_at || a.slug.localeCompare(b.slug));
  return page("Projets", `<div class="pagehead"><div><h1>Projets</h1><p>Vos ${projects.length} espaces partagés, classés par dernière synchronisation.</p></div></div>
    <form class="toolbar" method="get" action="/projects" aria-label="Rechercher un projet"><label class="searchbox"><input type="search" name="q" value="${e(q)}" aria-label="Rechercher un projet" placeholder="Rechercher un projet…"></label>
      <select class="field" name="sort" aria-label="Trier par activité"><option value="recent"${!oldest ? " selected" : ""}>Activité la plus récente</option><option value="oldest"${oldest ? " selected" : ""}>Activité la plus ancienne</option></select><button class="btn" type="submit">Rechercher</button></form>
    ${filtered.length ? `<section class="projects-table" aria-label="Projets"><div class="project-table-head"><span>Projet</span><span>Sessions</span><span>Membres</span><span>Votre accès</span><span>Activité</span></div>
      ${filtered.map((p) => `<article class="project-table-row"><div class="project-cell">${folder()}<div><h3><a href="${sessionsLink(p.slug)}">${e(p.name)}</a></h3><p>${e(p.slug)}</p></div></div>
        <span class="number">${p.sessions}<span class="mobile-count"> session${p.sessions === 1 ? "" : "s"}</span></span><span class="number">${p.members}</span><span><span class="role">${roleLabel(p.role)}</span></span><span class="when">${p.last_synced_at === null ? "Aucune activité" : dateLabel(p.last_synced_at, true)}</span></article>`).join("")}</section>`
      : `<div class="empty"><h2>${q ? "Aucun projet trouvé" : "Aucun projet accessible"}</h2><p>${q ? "Essayez un autre nom de projet." : "Demandez à un propriétaire de vous ajouter à un projet."}</p>${q ? '<a class="btn" href="/projects">Effacer les filtres</a>' : ""}</div>`}
      ${activityNote()}<p class="footnote">Seuls les projets dont vous êtes membre sont affichés.</p>`, 200, false,
      { active: "projects", projects, breadcrumbs: [{ label: "Projets" }], email: who.email });
}

/** GET /projects/:slug/settings — owners only; hide the project from everyone else. */
export async function projectSettingsPage(request: Request, env: Env, who: Identity, params: Record<string, string>): Promise<Response> {
  const slug = params.slug!;
  if (!SLUG.test(slug) || !atLeast(await roleIn(env, slug, who.email), "owner")) {
    return page("Projet introuvable", "<h1>Projet introuvable</h1>", 404);
  }
  const project = await (await getProject(request, env, who, params)).json() as Project & { members: Member[] };
  const projects = await getProjectSummaries(env, who.email);
  return page(`Paramètres · ${project.name}`, `<div class="list-head"><h1>Paramètres · ${e(project.name)}</h1>
    <div class="row"><a class="btn" href="/projects">Mes projets</a><a class="btn" href="${sessionsLink(slug)}">Voir les sessions</a></div></div>
    <div class="project-settings" data-project="${e(slug)}">
      <p role="alert" data-project-error hidden></p>
      <noscript><p class="ro-note">Activez JavaScript pour gérer les membres.</p></noscript>
      <h2>Membres</h2><section class="cards" aria-label="Membres">${project.members.map((m) => `<article class="card project-card">
        <h3 class="ttl">${e(m.email)}</h3><dl class="meta"><dt>Rôle</dt><dd>${e(m.role)}</dd>
          <dt>Ajouté par</dt><dd>${e(m.added_by)}</dd><dt>Ajouté le</dt><dd>${dateLabel(m.added_at)}</dd></dl>
        <form data-project-member data-email="${e(m.email)}">
          <label class="f">Rôle de ${e(m.email)}<select class="field" name="role">${roles(m.role)}</select></label>
          <div class="row"><button class="btn" type="submit" disabled>Enregistrer</button>
            <button class="btn" type="button" data-remove disabled>Retirer</button></div>
        </form></article>`).join("")}</section>
      <section class="panel"><div class="pb"><h2>Ajouter un membre</h2><form data-project-member>
        <label class="f">Email<input class="field" type="email" name="email" required></label>
        <label class="f">Rôle<select class="field" name="role">${roles("reader")}</select></label>
        <button class="btn primary" type="submit" disabled>Ajouter un membre</button>
      </form></div></section>
    </div>`, 200, false, { active: "projects", projects, email: who.email, breadcrumbs: [{ label: "Projets", href: "/projects" }, { label: project.name, href: projectPath(slug) }, { label: "Paramètres" }] });
}
