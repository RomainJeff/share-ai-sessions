import type { Identity } from "../auth";
import { VISIBLE, visibleSince } from "../db";
import { escapeHtml as e, page } from "../ui";

type RecordLine = { type?: string; message?: { id?: string; model?: string; content?: unknown; usage?: Record<string, number> } };

function content(value: unknown): string {
  if (typeof value === "string") return `<pre>${e(value)}</pre>`;
  if (!Array.isArray(value)) return `<pre>${e(JSON.stringify(value ?? ""))}</pre>`;
  return value.map((block) => {
    if (block?.type === "text") return `<pre>${e(block.text)}</pre>`;
    if (block?.type === "tool_use") return `<details><summary>Outil : ${e(block.name)}</summary><pre>${e(JSON.stringify(block.input, null, 2))}</pre></details>`;
    if (block?.type === "tool_result") return `<details><summary>Résultat : ${e(block.tool_use_id)}</summary>${content(block.content)}</details>`;
    return `<details><summary>${e(block?.type || "Bloc")}</summary><pre>${e(JSON.stringify(block, null, 2))}</pre></details>`;
  }).join("");
}

/** GET /s/:id — metadata is retention-checked before reading any transcript from R2. */
export async function sessionDetailPage(request: Request, env: Env, _who: Identity, params: Record<string, string>): Promise<Response> {
  const id = params.id!;
  const session = await env.DB.prepare(`SELECT * FROM sessions WHERE id = ? AND ${VISIBLE}`)
    .bind(id, visibleSince()).first<Record<string, string | number | null>>();
  if (!session) return page("Session introuvable", "<h1>Session introuvable</h1>", 404);

  // T02 stores plain JSONL; also read the gzip segments used by incremental sync.
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await env.SESSIONS.list({ prefix: `sessions/${id}/seg-`, cursor });
    keys.push(...listed.objects.map((o) => o.key).filter((k) => /\/seg-\d+\.jsonl(?:\.gz)?$/.test(k)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  if (!keys.length) return page("Transcript indisponible", "<h1>Transcript indisponible</h1>", 503);
  let jsonl = "";
  for (const key of keys.sort()) {
    const object = await env.SESSIONS.get(key);
    if (!object) return page("Transcript indisponible", "<h1>Transcript indisponible</h1>", 503);
    jsonl += key.endsWith(".gz") ? await new Response(object.body.pipeThrough(new DecompressionStream("gzip"))).text() : await object.text();
  }
  const records: { raw: string; data: RecordLine }[] = [];
  let invalid = 0;
  const usages = new Map<string, Record<string, number>>();
  for (const raw of jsonl.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const data = JSON.parse(raw) as RecordLine;
      if (!data || typeof data !== "object") { invalid++; continue; }
      if (data.type === "assistant" && data.message?.id && data.message.usage) usages.set(data.message.id, data.message.usage);
      if (data.type === "user" || data.type === "assistant") records.push({ raw, data });
    } catch { invalid++; }
  }
  const tokens = [...usages.values()].reduce((total, usage) => total +
    ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].reduce((sum, k) => sum + (Number(usage[k]) || 0), 0), 0);
  const requested = Number(new URL(request.url).searchParams.get("page")) || 1;
  const lastPage = Math.max(1, Math.ceil(records.length / 100));
  const current = Math.min(lastPage, Math.max(1, Math.floor(requested)));
  const command = `/share-session pull ${id}`;
  return page(String(session.title || id), `<header><h1>${e(session.title || id)}</h1>
    <p>${e(session.owner_name)} · ${e(session.owner_email)}</p><p>${e(session.project)}@${e(session.branch)} · ${e(session.model || records.find((r) => r.data.message?.model)?.data.message?.model)}</p>
    <p>${tokens} tokens · ${usages.size} réponses API (usage dédupliqué par message.id) · ${records.length} lignes de conversation</p>
    <button data-copy="${e(command)}">Reprendre</button><pre>${e(command)}</pre></header>
    ${invalid ? `<p>${invalid} ligne(s) JSONL invalide(s) ignorée(s).</p>` : ""}
    ${records.slice((current - 1) * 100, current * 100).map(({ raw, data }) => `<article data-role="${data.type}"><h2>${data.type === "user" ? "Utilisateur" : "Assistant"}</h2>${content(data.message?.content)}<details><summary>JSON brut</summary><pre>${e(raw)}</pre></details></article>`).join("") || "<p>Aucun message.</p>"}
    <nav>${current > 1 ? `<a href="?page=${current - 1}">Précédent</a>` : ""}<span>Page ${current} / ${lastPage}</span>${current < lastPage ? `<a href="?page=${current + 1}">Suivant</a>` : ""}</nav>`);
}
