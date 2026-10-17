import type { ProjectSummary } from "./navigation";
import type { Role } from "./db";
import { dateLabel, escapeHtml as e, icon, initials } from "./ui";

export type NavigationSession = {
  id: string; title: string | null; summary: string | null; project: string;
  continued_from?: string | null; forked_from?: string | null; forked_from_owner?: string | null;
  repo: string | null; owner_email: string; owner_name: string; msg_count: number; last_synced_at: number;
};
export const projectPath = (slug: string) => `/projects/${encodeURIComponent(slug)}`;
export const roleLabel = (role: Role) => ({ owner: "Propriétaire", writer: "Écriture", reader: "Lecture seule" })[role];
export const sessionHref = (id: string, returnTo: string) => `/s/${encodeURIComponent(id)}?return=${encodeURIComponent(returnTo)}`;
export const activityNote = () => `<p class="footnote">${icon("info")}L’activité correspond à la dernière synchronisation. Les sessions inactives depuis plus de 90 jours sont masquées.</p>`;
export const folder = () => `<span class="folder-icon">${icon("folder")}</span>`;

export function sessionRow(s: NavigationSession, projects: ProjectSummary[], email: string, returnTo: string, inProject = false): string {
  const p = projects.find((project) => project.slug === s.project);
  const name = s.owner_name || s.owner_email;
  return `<article class="session-row"><div><a class="session-title" href="${e(sessionHref(s.id, returnTo))}">${e(s.title || s.id)}</a>
    ${(inProject ? s.summary : s.repo) ? `<p class="session-note">${e(inProject ? s.summary : s.repo)}</p>` : ""}
    ${s.continued_from || s.forked_from ? `<p class="session-note provenance">${s.continued_from ? "suite d’une session compactée" : ""}${s.continued_from && s.forked_from ? " · " : ""}${s.forked_from ? `fork de la session de ${e(s.forked_from_owner || s.forked_from)}` : ""}</p>` : ""}</div>
    ${inProject ? "" : `<a class="project-chip" href="${e(projectPath(s.project))}">${e(p?.name || s.project)}</a>`}
    <div class="list-author" title="${e(s.owner_email)}"><span class="avatar" aria-hidden="true">${e(initials(name))}</span><span>${e(s.owner_email.toLowerCase() === email.toLowerCase() ? "Vous" : name)}</span></div>
    ${inProject ? `<span class="msg-count">${e(s.msg_count)} msg</span>` : ""}
    <span class="when" aria-label="Dernière synchronisation">${dateLabel(s.last_synced_at, true)}</span></article>`;
}

export function projectCard(p: ProjectSummary): string {
  return `<article class="project-card"><div class="project-top">${folder()}<h3><a href="${e(projectPath(p.slug))}">${e(p.name)}</a></h3><span class="role">${roleLabel(p.role)}</span></div>
    <div class="project-card-bottom"><span><b>${p.sessions}</b> session${p.sessions === 1 ? "" : "s"}</span><span>${p.members} membre${p.members === 1 ? "" : "s"}</span>
    <span class="activity">${p.last_synced_at === null ? "Aucune activité" : dateLabel(p.last_synced_at, true)}</span></div>
    ${p.last_session_id ? `<div class="last-session">${icon("chat")}<span>${e(p.last_session_title || p.last_session_id)}</span></div>` : ""}</article>`;
}

export function groupedSessions(rows: NavigationSession[], projects: ProjectSummary[], email: string, returnTo: string, inProject: boolean): string {
  const today = Math.floor(Date.now() / 86400000);
  let group = "";
  let html = "";
  for (const s of rows) {
    const day = Math.floor(s.last_synced_at / 86400000);
    const label = day >= today ? "Aujourd’hui (UTC)" : day === today - 1 ? "Hier (UTC)" : "Plus tôt";
    if (label !== group) {
      if (group) html += "</div>";
      html += `<h2 class="group-title">${label}</h2><div class="session-list">`;
      group = label;
    }
    html += sessionRow(s, projects, email, returnTo, inProject);
  }
  return html + (group ? "</div>" : "");
}
