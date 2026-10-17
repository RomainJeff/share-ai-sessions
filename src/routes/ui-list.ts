import { VISIBLE, visibleSince } from "../db";
import { escapeHtml as e, page } from "../ui";

/** GET / — filters apply before pagination; dates are inclusive UTC calendar days. */
export async function sessionListPage(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const where = [VISIBLE];
  const binds: (string | number)[] = [visibleSince()];
  for (const [param, column] of [["project", "project"], ["author", "owner_email"]]) {
    const value = params.get(param!);
    if (value) { where.push(`${column} = ?`); binds.push(param === "project" ? value.toLowerCase() : value); }
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
  const { results } = await env.DB.prepare(`SELECT id, title, summary, project, branch, owner_email, owner_name, updated_at
    FROM sessions WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id LIMIT 101 OFFSET ?`)
    .bind(...binds, (current - 1) * 100).all<Record<string, string | number | null>>();
  const link = (n: number, label: string) => {
    const query = new URLSearchParams(params); query.set("page", String(n));
    return `<a href="/?${e(query)}">${label}</a>`;
  };
  return page("Sessions partagées", `<h1>Sessions partagées</h1><form method="get">
    ${[["project", "Projet", "text"], ["author", "Auteur (email)", "email"], ["q", "Titre ou résumé", "search"], ["from", "Depuis (UTC)", "date"], ["to", "Jusqu’au (UTC)", "date"]].map(([name, label, type]) =>
      `<label>${label}<input name="${name}" type="${type}" value="${e(params.get(name!))}"></label>`).join("")}
    <button>Filtrer</button><a href="/">Réinitialiser</a></form>
    ${results.slice(0, 100).map((s) => `<article><h2><a href="/s/${e(encodeURIComponent(String(s.id)))}">${e(s.title || s.id)}</a></h2>
    <p class="meta">${e(s.owner_name)} · ${e(s.owner_email)} · ${e(s.project)}${s.branch ? `@${e(s.branch)}` : ""} · ${e(new Date(Number(s.updated_at)).toISOString())}</p><p>${e(s.summary)}</p></article>`).join("") || "<p>Aucune session trouvée.</p>"}
    <nav>${current > 1 ? link(current - 1, "Précédent") : ""}${results.length > 100 ? link(current + 1, "Suivant") : ""}</nav>`);
}
