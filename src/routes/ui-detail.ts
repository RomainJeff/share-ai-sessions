import type { Identity } from "../auth";
import { VISIBLE, visibleSince } from "../db";
import { author, dateLabel, escapeHtml as e, icon, page } from "../ui";

type RecordLine = { type?: string; timestamp?: string; message?: { id?: string; model?: string; content?: unknown; usage?: Record<string, number> } };

function tool(label: string, body: string): string {
  return `<details class="tool"><summary><span class="ticon">${icon("term")}</span><span class="tlabel"><b>${e(label)}</b></span><span class="tchev">${icon("chev")}</span></summary><div class="tbody">${body}</div></details>`;
}

function content(value: unknown, technical = false): string {
  const text = (value: unknown) => `<pre class="${technical ? "code" : "bubble"}">${e(value)}</pre>`;
  if (typeof value === "string") return text(value);
  if (!Array.isArray(value)) return text(JSON.stringify(value ?? ""));
  return value.map((block) => {
    if (block?.type === "text") return text(block.text);
    if (block?.type === "tool_use") return tool(`Outil : ${block.name ?? ""}`, `<h4>Entrée</h4><pre class="code">${e(JSON.stringify(block.input, null, 2))}</pre>`);
    if (block?.type === "tool_result") return tool(`Résultat : ${block.tool_use_id ?? ""}`, content(block.content, true));
    if (block?.type === "thinking") return `<details class="reason"><summary>${icon("chev")}Raisonnement</summary><pre class="rtxt">${e(block.thinking)}</pre></details>`;
    return tool(String(block?.type || "Bloc"), `<pre class="code">${e(JSON.stringify(block, null, 2))}</pre>`);
  }).join("");
}

/** GET /s/:id — metadata is retention-checked before reading any transcript from R2. */
export async function sessionDetailPage(request: Request, env: Env, who: Identity, params: Record<string, string>): Promise<Response> {
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
  const model = session.model || records.find((r) => r.data.message?.model)?.data.message?.model;
  const meta = (label: string, value: unknown, mono = false) => value == null || value === "" ? "" : `<dt>${label}</dt><dd${mono ? ' class="mono"' : ""}>${e(value)}</dd>`;
  return page(String(session.title || id), `<div class="detail">
    <header class="dhead"><h1>${e(session.title || id)}</h1>
      ${session.summary ? `<p class="sum">${e(session.summary)}</p>` : ""}
      <div class="line">${author(session.owner_name, session.owner_email)}
        <span class="badge">synchro ${dateLabel(Number(session.last_synced_at), true)}</span>
        <span class="badge mono">${icon("folder")}${e(session.project)}</span>
        ${session.branch ? `<span class="badge mono">${icon("branch")}${e(session.branch)}</span>` : ""}
        ${model ? `<span class="chip">${icon("chip")}${e(model)}</span>` : ""}
        ${session.forked_from ? `<span class="badge">${icon("branch")}forké depuis <a href="/s/${e(encodeURIComponent(String(session.forked_from)))}">${e(session.forked_from)}</a> · ${e(session.forked_from_owner)}</span>` : ""}
      </div>
      <p class="hint">${tokens} tokens · ${usages.size} réponses API (usage dédupliqué par message.id) · ${records.length} lignes de conversation</p>
      ${session.owner_email !== who.email ? `<p class="ro-note">Lecture seule : session de ${e(session.owner_email)}. Si vous la reprenez, la copie sera à votre nom.</p>` : ""}
      <div class="actionbar gutter"><div class="in"><button class="btn primary" type="button" data-copy="${e(command)}">${icon("branch")}Reprendre</button></div></div>
    </header>
    <aside class="side" aria-label="Informations de la session">
      <details class="panel" data-sidebar-info open><summary>Informations<span class="tchev">${icon("chev")}</span></summary><div class="pb"><dl class="meta">
        ${meta("Auteur", session.owner_email)}${meta("Projet", session.project, true)}${meta("Branche", session.branch, true)}
        ${meta("Dossier d’origine", session.cwd_base, true)}${meta("Modèle", model)}${meta("Claude Code", session.cc_version)}
        <dt>Créée</dt><dd>${dateLabel(Number(session.created_at))}</dd>
        <dt>Mise à jour</dt><dd>${dateLabel(Number(session.updated_at))}</dd>
        <dt>Dernière synchro</dt><dd>${dateLabel(Number(session.last_synced_at))}</dd>
        ${meta("Messages", records.length)}${meta("Tokens", tokens)}${meta("Taille", `${Number(session.bytes)} octets`)}${meta("Identifiant", id, true)}
      </dl></div></details>
      <details class="panel"><summary>Commande de reprise<span class="tchev">${icon("chev")}</span></summary><div class="pb resume-help">
        <p class="hint">Collez cette commande dans Claude Code, ouvert dans votre copie de <span class="mono">${e(session.project)}</span>.</p>
        <div class="cmd"><code id="resume-command">${e(command)}</code></div>
        <p class="hint">La copie sera une nouvelle session à votre nom. Celle-ci reste intacte.</p>
      </div></details>
    </aside>
    <section class="chat" aria-label="Conversation"><h2 class="chat-title">Conversation</h2>
      ${invalid ? `<p class="ro-note">${invalid} ligne(s) JSONL invalide(s) ignorée(s).</p>` : ""}
      ${records.slice((current - 1) * 100, current * 100).map(({ raw, data }) => `<article class="turn ${data.type === "user" ? "me" : "ai"}" data-role="${data.type}">
        <span class="avatar lg${data.type === "assistant" ? " av-ai" : ""}" aria-hidden="true">${data.type === "user" ? "U" : "C"}</span>
        <div class="col"><div class="meta-l"><b>${data.type === "user" ? "Utilisateur" : "Claude"}</b>${data.timestamp ? dateLabel(data.timestamp) : ""}</div>
          ${content(data.message?.content)}<details class="reason raw"><summary>${icon("chev")}JSON brut</summary><pre class="code">${e(raw)}</pre></details>
        </div></article>`).join("") || '<p class="empty">Aucun message.</p>'}
      <nav class="pagination" aria-label="Pagination de la conversation">${current > 1 ? `<a class="btn" href="?page=${current - 1}">Précédent</a>` : ""}<span>Page ${current} / ${lastPage}</span>${current < lastPage ? `<a class="btn" href="?page=${current + 1}">Suivant</a>` : ""}</nav>
    </section></div>`, 200, true);
}
