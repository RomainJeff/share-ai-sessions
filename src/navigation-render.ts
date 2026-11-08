import type { ProjectSummary } from "./navigation";
import type { Role } from "./db";
import { appName, dateLabel, escapeHtml as e, icon, initials, statusIcon } from "./ui";

export type NavigationSession = {
  id: string; title: string | null; summary: string | null; project: string;
  continued_from?: string | null; forked_from?: string | null; forked_from_owner?: string | null; external_app?: string | null; done_at?: number | null;
  repo: string | null; owner_email: string; owner_name: string; msg_count: number; last_synced_at: number;
};
export const projectPath = (slug: string) => `/projects/${encodeURIComponent(slug)}`;
export const roleLabel = (role: Role) => ({ owner: "Owner", writer: "Writer", reader: "Read-only" })[role];
export const sessionHref = (id: string, returnTo: string) => `/s/${encodeURIComponent(id)}?return=${encodeURIComponent(returnTo)}`;
export const activityNote = () => `<p class="footnote">${icon("info")}Activity reflects the last sync. Sessions inactive for more than 90 days are hidden.</p>`;
export const folder = () => `<span class="folder-icon">${icon("folder")}</span>`;

export function sessionRow(s: NavigationSession, projects: ProjectSummary[], email: string, returnTo: string, inProject = false): string {
  const p = projects.find((project) => project.slug === s.project);
  const name = s.owner_name || s.owner_email;
  return `<article class="session-row${s.done_at ? " is-done" : ""}"><div class="session-main">${statusIcon(Boolean(s.done_at))}<div><a class="session-title" href="${e(sessionHref(s.id, returnTo))}">${e(s.title || s.id)}</a>
    ${s.external_app ? `<p class="session-note"><span class="badge">${e(appName(s.external_app))}</span></p>` : ""}
    ${(inProject ? s.summary : s.repo) ? `<p class="session-note">${e(inProject ? s.summary : s.repo)}</p>` : ""}
    ${s.continued_from || s.forked_from ? `<p class="session-note provenance">${s.continued_from ? "continues a compacted session" : ""}${s.continued_from && s.forked_from ? " · " : ""}${s.forked_from ? `forked from ${e(s.forked_from_owner || s.forked_from)}’s session` : ""}</p>` : ""}</div></div>
    ${inProject ? "" : `<a class="project-chip" href="${e(projectPath(s.project))}">${e(p?.name || s.project)}</a>`}
    <div class="list-author" title="${e(s.owner_email)}"><span class="avatar" aria-hidden="true">${e(initials(name))}</span><span>${e(s.owner_email.toLowerCase() === email.toLowerCase() ? "You" : name)}</span></div>
    ${inProject ? `<span class="msg-count">${e(s.msg_count)} msg</span>` : ""}
    <span class="when" aria-label="Last sync">${dateLabel(s.last_synced_at, true)}</span></article>`;
}

export function projectCard(p: ProjectSummary): string {
  return `<article class="project-card"><div class="project-top">${folder()}<h3><a href="${e(projectPath(p.slug))}">${e(p.name)}</a></h3><span class="role">${roleLabel(p.role)}</span></div>
    <div class="project-card-bottom"><span><b>${p.sessions}</b> session${p.sessions === 1 ? "" : "s"}</span><span>${p.members} member${p.members === 1 ? "" : "s"}</span>
    <span class="activity">${p.last_synced_at === null ? "No activity" : dateLabel(p.last_synced_at, true)}</span></div>
    ${p.last_session_id ? `<div class="last-session">${icon("chat")}<span>${e(p.last_session_title || p.last_session_id)}</span></div>` : ""}</article>`;
}

/** Rows arrive in-progress first, then finished: one titled list per status. */
export function groupedSessions(rows: NavigationSession[], projects: ProjectSummary[], email: string, returnTo: string, inProject: boolean): string {
  return [false, true].map((done) => {
    const group = rows.filter((s) => Boolean(s.done_at) === done);
    return group.length ? `<h2 class="group-title">${statusIcon(done, false)}${done ? "Done" : "In progress"}</h2><div class="session-list">${group.map((s) => sessionRow(s, projects, email, returnTo, inProject)).join("")}</div>` : "";
  }).join("");
}
