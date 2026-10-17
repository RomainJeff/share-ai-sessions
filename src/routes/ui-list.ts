import type { Identity } from "../auth";
import { MEMBER, VISIBLE, visibleSince } from "../db";
import { author, dateLabel, escapeHtml as e, icon, page } from "../ui";

/** GET / — filters apply before pagination; dates are inclusive UTC calendar days. */
export async function sessionListPage(request: Request, env: Env, who: Identity): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const where = [VISIBLE, MEMBER];
  const binds: (string | number)[] = [visibleSince(), who.email];
  for (const [param, column] of [["project", "project"], ["repo", "repo"], ["author", "owner_email"]]) {
    const value = params.get(param!);
    if (value) { where.push(`${column} = ?`); binds.push(param === "author" ? value : value.toLowerCase()); }
  }
  const q = params.get("q");
  if (q) { where.push("(title LIKE ? OR summary LIKE ?)"); binds.push(`%${q}%`, `%${q}%`); }
  for (const name of ["from", "to"]) {
    const value = params.get(name);
    if (!value) continue;
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
      return page("Période invalide", "<h1>Période invalide</h1>", 400);
    }
    where.push(`updated_at ${name === "from" ? ">=" : "<"} ?`);
    binds.push(time + (name === "to" ? 86400000 : 0));
  }
  const requested = Number(params.get("page"));
  const current = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const { results } = await env.DB.prepare(`SELECT id, title, summary, project, repo, branch, owner_email, owner_name, updated_at, model, msg_count, forked_from, forked_from_owner, continued_from
    FROM sessions WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id LIMIT 101 OFFSET ?`)
    .bind(...binds, (current - 1) * 100).all<Record<string, string | number | null>>();
  const link = (n: number, label: string) => {
    const query = new URLSearchParams(params); query.set("page", String(n));
    return `<a class="btn" href="/?${e(query)}">${label}</a>`;
  };
  const rows = results.slice(0, 100);
  const active = ["project", "repo", "author", "from", "to"].filter((key) => params.get(key)).length;
  return page("Sessions partagées", `<div class="list-head"><h1>Sessions partagées</h1>
    <span class="count">${rows.length}${results.length > 100 ? "+" : ""} session${rows.length === 1 ? "" : "s"} · les plus récentes d’abord</span></div>
    <form method="get" action="/" aria-label="Rechercher et filtrer les sessions">
      <div class="searchrow"><label class="search"><span class="sr">Titre ou résumé</span>${icon("search")}
        <input class="field" name="q" type="search" placeholder="Titre, résumé…" value="${e(q)}"></label>
        <button class="btn fbtn" type="button" data-filter-toggle aria-controls="filters" aria-expanded="false">${icon("filter")}Filtres${active ? `<span class="n">${active}</span>` : ""}</button>
        <button class="btn primary" type="submit">Rechercher</button></div>
      <dialog class="filters gutter" id="filters" aria-labelledby="filters-title" open>
        <div class="sh"><h2 id="filters-title">Filtres</h2><button class="btn" type="button" data-filter-close aria-label="Fermer les filtres">${icon("close")}</button></div>
        ${[["project", "Projet", "text"], ["repo", "Repo (owner/repo)", "text"], ["author", "Auteur (email)", "email"], ["from", "Depuis (UTC)", "date"], ["to", "Jusqu’au (UTC)", "date"]].map(([name, label, type]) =>
          `<label class="f">${label}<input class="field" name="${name}" type="${type}" value="${e(params.get(name!))}"></label>`).join("")}
        <div class="row"><button class="btn primary" type="submit">Filtrer</button><a class="btn" href="/">Réinitialiser</a></div>
      </dialog>
    </form>
    <p class="retention">${icon("info")}<span>Les sessions inactives depuis plus de 90 jours sont masquées. Elles réapparaissent si leur auteur les synchronise à nouveau.</span></p>
    <details class="panel share-help"><summary>${icon("info")}Partager une session<span class="tchev">${icon("chev")}</span></summary><div class="pb">
      <p>Ajoutez le skill dans Claude (Paramètres → Capacités → Skills) ou dézippez-le dans <span class="mono">~/.claude/skills/</span>.</p>
      <a class="btn" href="/share-session.skill" download>Télécharger le skill <span class="mono">share-session.skill</span></a>
    </div></details>
    <section class="cards" aria-label="Sessions">
      ${rows.map((s) => `<a class="card" href="/s/${e(encodeURIComponent(String(s.id)))}">
        <div class="top"><h2 class="ttl">${e(s.title || s.id)}</h2><span class="when">${dateLabel(Number(s.updated_at), true)}</span></div>
        ${s.summary ? `<p class="sum">${e(s.summary)}</p>` : ""}
        <div class="facts">${author(s.owner_name, s.owner_email)}
          <span>${icon("folder")}<span class="mono">${e(s.project)}</span></span>
          ${s.repo ? `<span>${icon("term")}<span class="mono">${e(s.repo)}</span></span>` : ""}
          ${s.branch ? `<span>${icon("branch")}<span class="mono">${e(s.branch)}</span></span>` : ""}
          ${s.msg_count ? `<span>${icon("chat")}${e(s.msg_count)} messages</span>` : ""}
          ${s.model ? `<span>${icon("chip")}<span>${e(s.model)}</span></span>` : ""}</div>
        ${s.continued_from ? `<div class="foot"><span class="badge">${icon("branch")}suite d’une session compactée</span></div>` : ""}
        ${s.forked_from ? `<div class="foot"><span class="badge">${icon("branch")}fork de la session de ${e(s.forked_from_owner || s.forked_from)}</span></div>` : ""}
      </a>`).join("") || '<p class="empty">Aucune session trouvée.</p>'}
    </section>
    <nav class="pagination" aria-label="Pagination des sessions">${current > 1 ? link(current - 1, "Précédent") : ""}<span>Page ${current}</span>${results.length > 100 ? link(current + 1, "Suivant") : ""}</nav>`);
}
