import type { Identity } from "../auth";
import { atLeast, roleIn, ROLES, SLUG, type Role } from "../db";
import { dateLabel, escapeHtml as e, page } from "../ui";
import { getProject, listProjects } from "./projects";

type Project = { slug: string; name: string; role: Role; sessions: number };
type Member = { email: string; role: Role; added_by: string; added_at: number };
const sessionsLink = (slug: string) => `/?project=${e(encodeURIComponent(slug))}`;
const roles = (selected: Role) => ROLES.map((role) =>
  `<option value="${e(role)}"${role === selected ? " selected" : ""}>${e(role)}</option>`).join("");

/** GET /projects — reuse the API's membership and live-count query. */
export async function projectsPage(request: Request, env: Env, who: Identity): Promise<Response> {
  const { projects } = await (await listProjects(request, env, who)).json() as { projects: Project[] };
  return page("Mes projets", `<div class="list-head"><h1>Mes projets</h1><a class="barback" href="/">Retour aux sessions</a></div>
    <section class="cards" aria-label="Projets">${projects.map((p) => `<article class="card project-card">
      <h2 class="ttl"><a href="${sessionsLink(p.slug)}">${e(p.name)}</a></h2>
      <div class="facts"><span class="mono">${e(p.slug)}</span><span>Rôle : ${e(p.role)}</span><span>${e(p.sessions)} session${p.sessions === 1 ? "" : "s"}</span></div>
      <div class="row"><a class="btn" href="${sessionsLink(p.slug)}">Voir les sessions</a>
        ${atLeast(p.role, "owner") ? `<a class="btn" href="/projects/${e(encodeURIComponent(p.slug))}/settings">Paramètres</a>` : ""}</div>
    </article>`).join("") || '<p class="empty">Vous ne faites partie d’aucun projet.</p>'}</section>`);
}

/** GET /projects/:slug/settings — owners only; hide the project from everyone else. */
export async function projectSettingsPage(request: Request, env: Env, who: Identity, params: Record<string, string>): Promise<Response> {
  const slug = params.slug!;
  if (!SLUG.test(slug) || !atLeast(await roleIn(env, slug, who.email), "owner")) {
    return page("Projet introuvable", "<h1>Projet introuvable</h1>", 404);
  }
  const project = await (await getProject(request, env, who, params)).json() as Project & { members: Member[] };
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
    </div>`);
}
