import type { Identity } from "../auth";
import { atLeast, roleIn, ROLES, SLUG, type Role } from "../db";
import { dateLabel, escapeHtml as e, page } from "../ui";
import { getProject } from "./projects";
import { getNavigation } from "../navigation";
import { activityNote, folder, projectPath, roleLabel } from "../navigation-render";

type Project = { slug: string; name: string; role: Role; sessions: number };
type Member = { email: string; role: Role; added_by: string; added_at: number };
const sessionsLink = (slug: string) => e(projectPath(slug));
const roles = (selected: Role) => ROLES.map((role) =>
  `<option value="${e(role)}"${role === selected ? " selected" : ""}>${e(role)}</option>`).join("");

/** GET /projects — all accessible projects, including empty spaces. */
export async function projectsPage(request: Request, env: Env, who: Identity): Promise<Response> {
  const { projects, sidebar } = await getNavigation(env, who.email);
  const params = new URL(request.url).searchParams;
  const q = params.get("q") || "";
  const oldest = params.get("sort") === "oldest";
  const filtered = projects.filter((p) => `${p.name} ${p.slug}`.toLowerCase().includes(q.toLowerCase()));
  if (oldest) filtered.sort((a, b) => a.last_synced_at === null ? b.last_synced_at === null ? a.slug.localeCompare(b.slug) : 1 : b.last_synced_at === null ? -1 : a.last_synced_at - b.last_synced_at || a.slug.localeCompare(b.slug));
  return page("Projects", `<div class="pagehead"><div><h1>Projects</h1><p>Your ${projects.length} shared spaces, sorted by last sync.</p></div></div>
    <form class="toolbar" method="get" action="/projects" aria-label="Search projects"><label class="searchbox"><input type="search" name="q" value="${e(q)}" aria-label="Search projects" placeholder="Search projects…"></label>
      <select class="field" name="sort" aria-label="Sort by activity"><option value="recent"${!oldest ? " selected" : ""}>Most recent activity</option><option value="oldest"${oldest ? " selected" : ""}>Oldest activity</option></select><button class="btn" type="submit">Search</button></form>
    ${filtered.length ? `<section class="projects-table" aria-label="Projects"><div class="project-table-head"><span>Project</span><span>Sessions</span><span>Members</span><span>Your access</span><span>Activity</span></div>
      ${filtered.map((p) => `<article class="project-table-row"><div class="project-cell">${folder()}<div><h3><a href="${sessionsLink(p.slug)}">${e(p.name)}</a></h3><p>${e(p.slug)}</p></div></div>
        <span class="number">${p.sessions}<span class="mobile-count"> session${p.sessions === 1 ? "" : "s"}</span></span><span class="number">${p.members}</span><span><span class="role">${roleLabel(p.role)}</span></span><span class="when">${p.last_synced_at === null ? "No activity" : dateLabel(p.last_synced_at, true)}</span></article>`).join("")}</section>`
      : `<div class="empty"><h2>${q ? "No projects found" : "No accessible projects"}</h2><p>${q ? "Try another project name." : "Ask an owner to add you to a project."}</p>${q ? '<a class="btn" href="/projects">Clear filters</a>' : ""}</div>`}
      ${activityNote()}<p class="footnote">Only projects you are a member of are shown.</p>`, 200, false,
      { active: "projects", projects, sidebar, breadcrumbs: [{ label: "Projects" }], email: who.email });
}

/** GET /projects/:slug/settings — owners only; hide the project from everyone else. */
export async function projectSettingsPage(request: Request, env: Env, who: Identity, params: Record<string, string>): Promise<Response> {
  const slug = params.slug!;
  if (!SLUG.test(slug) || !atLeast(await roleIn(env, slug, who.email), "owner")) {
    return page("Project not found", "<h1>Project not found</h1>", 404);
  }
  const project = await (await getProject(request, env, who, params)).json() as Project & { members: Member[] };
  const { projects, sidebar } = await getNavigation(env, who.email);
  return page(`Settings · ${project.name}`, `<div class="list-head"><h1>Settings · ${e(project.name)}</h1>
    <div class="row"><a class="btn" href="/projects">My projects</a><a class="btn" href="${sessionsLink(slug)}">View sessions</a></div></div>
    <div class="project-settings" data-project="${e(slug)}">
      <p role="alert" data-project-error hidden></p>
      <noscript><p class="ro-note">Enable JavaScript to manage members.</p></noscript>
      <h2>Members</h2><section class="cards" aria-label="Members">${project.members.map((m) => `<article class="card project-card">
        <h3 class="ttl">${e(m.email)}</h3><dl class="meta"><dt>Role</dt><dd>${e(m.role)}</dd>
          <dt>Added by</dt><dd>${e(m.added_by)}</dd><dt>Added on</dt><dd>${dateLabel(m.added_at)}</dd></dl>
        <form data-project-member data-email="${e(m.email)}">
          <label class="f">Role of ${e(m.email)}<select class="field" name="role">${roles(m.role)}</select></label>
          <div class="row"><button class="btn" type="submit" disabled>Save</button>
            <button class="btn" type="button" data-remove disabled>Remove</button></div>
        </form></article>`).join("")}</section>
      <section class="panel"><div class="pb"><h2>Add member</h2><form data-project-member>
        <label class="f">Email<input class="field" type="email" name="email" required></label>
        <label class="f">Role<select class="field" name="role">${roles("reader")}</select></label>
        <button class="btn primary" type="submit" disabled>Add member</button>
      </form></div></section>
    </div>`, 200, false, { active: "projects", projects, sidebar, email: who.email, currentProject: slug, breadcrumbs: [{ label: "Projects", href: "/projects" }, { label: project.name, href: projectPath(slug) }, { label: "Settings" }] });
}
