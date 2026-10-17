import type { Identity } from "../auth";
import { atLeast, MEMBER, roleIn, VISIBLE, visibleSince } from "../db";
import { getProjectSummaries } from "../navigation";
import { author, dateLabel, escapeHtml as e, icon, page } from "../ui";

type RecordLine = { type?: string; timestamp?: string; isMeta?: boolean; isCompactSummary?: boolean; toolUseResult?: unknown; message?: { id?: string; model?: string; content?: unknown; usage?: Record<string, number> } };

type TranscriptRecord = { raw: string; data: RecordLine };

/** Claude Code also uses user records for tool results and injected context. */
function isHumanPrompt(data: RecordLine): boolean {
  if (data.type !== "user" || data.isMeta || data.isCompactSummary || "toolUseResult" in data) return false;
  const value = data.message?.content;
  if (typeof value !== "string" && (!Array.isArray(value) || !value.every((b) =>
    b?.type === "image" || (b?.type === "text" && typeof b.text === "string")))) return false;
  const text = typeof value === "string" ? value : value.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  // Keep human text alongside wrappers; wrapper-only records belong to context.
  const prompt = text.replace(/<(command-[\w-]+|local-command-[\w-]+|system-reminder)\b[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/^(?:\s*\[Request interrupted[^\]\r\n]*\])+\s*/, "").trim();
  return (Array.isArray(value) && value.some((b) => b.type === "image")) ||
    prompt.length > 0;
}

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

function renderRow({ raw, data }: TranscriptRecord): string {
  const value = data.message?.content;
  const hasToolResult = Array.isArray(value) && value.some((b) => b?.type === "tool_result");
  const role = isHumanPrompt(data) ? "user" : data.type === "assistant" ? "assistant" :
    hasToolResult || "toolUseResult" in data ? "tool" : "system";
  const rawHtml = `<details class="reason raw"><summary>${icon("chev")}JSON brut</summary><pre class="code">${e(raw)}</pre></details>`;
  const time = data.timestamp ? dateLabel(data.timestamp) : "";
  if (role === "system") return `<article class="turn system" data-role="system"><div class="col">
    <details class="reason context"><summary>${icon("chev")}Contexte ${time}</summary>
      ${content(value)}${rawHtml}</details></div></article>`;
  return `<article class="turn ${role === "user" ? "me" : "ai"}" data-role="${role}">
    <span class="avatar lg${role === "user" ? "" : " av-ai"}" aria-hidden="true">${role === "user" ? "U" : "C"}</span>
    <div class="col"><div class="meta-l"><b>${role === "user" ? "Utilisateur" : "Claude"}</b>${time}</div>
      ${role === "tool" && !hasToolResult ? tool("Résultat", content(value, true)) : content(value)}${rawHtml}
    </div></article>`;
}

/** GET /s/:id — metadata is retention-checked before reading any transcript from R2. */
export async function sessionDetailPage(request: Request, env: Env, who: Identity, params: Record<string, string>): Promise<Response> {
  const id = params.id!;
  const session = await env.DB.prepare(`SELECT * FROM sessions WHERE id = ? AND ${VISIBLE} AND ${MEMBER}`)
    .bind(id, visibleSince(), who.email).first<Record<string, string | number | null>>();
  if (!session) return page("Session introuvable", "<h1>Session introuvable</h1>", 404);
  const projects = await getProjectSummaries(env, who.email);
  const project = projects.find(p => p.slug === session.project)!;
  const projectHref = `/projects/${encodeURIComponent(String(session.project))}`;
  let backHref = projectHref;
  const returnTo = new URL(request.url).searchParams.get("return");
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    const origin = new URL(request.url).origin;
    try {
      const target = new URL(returnTo, origin);
      // Return only to a membership-filtered list or this session's own project.
      if (target.origin === origin && (target.pathname === "/sessions" || target.pathname === projectHref)) {
        backHref = target.pathname + target.search;
      }
    } catch { /* Fall back to the session's current project for malformed links. */ }
  }

  const continuation = await env.DB.prepare(`SELECT id FROM sessions WHERE continued_from = ? AND ${VISIBLE} AND ${MEMBER} ORDER BY created_at DESC LIMIT 1`)
    .bind(id, visibleSince(), who.email).first<{ id: string }>();

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
  const records: TranscriptRecord[] = [];
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
  let conversation = "";
  for (let start = 0, end = 0; start < records.length; start = end) {
    end = start + 1;
    while (end < records.length && !isHumanPrompt(records[end]!.data)) end++;
    const prompt = isHumanPrompt(records[start]!.data) ? records[start] : undefined;
    let final = -1;
    if (prompt) for (let i = start + 1; i < end; i++) {
      const { data } = records[i]!;
      const value = data.message?.content;
      if (data.type === "assistant" && (typeof value === "string" ? value.trim() :
        Array.isArray(value) && value.some((b) => b?.type === "text" && typeof b.text === "string" && b.text.trim()))) final = i;
    }
    if (prompt) conversation += renderRow(prompt);
    const steps = records.slice(start, end).filter((_, i) => start + i !== final && !(prompt && i === 0));
    if (steps.length) {
      const elapsed = Date.parse(records[end - 1]!.data.timestamp || "") - Date.parse(prompt?.data.timestamp || "");
      const minutes = Math.floor(elapsed / 60000);
      const duration = minutes < 1 ? "moins d'une minute" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
      const label = Number.isFinite(elapsed) && elapsed >= 0 ? `A travaillé pendant ${duration}` : "Étapes intermédiaires";
      conversation += `<details class="worked"><summary>${icon("chev")}<span>${e(label)} · ${steps.length} étape${steps.length === 1 ? "" : "s"}</span></summary><div>${steps.map(renderRow).join("")}</div></details>`;
    }
    if (final >= 0) conversation += renderRow(records[final]!);
  }
  const sourceRole = await roleIn(env, String(session.project), who.email);
  const canMove = sourceRole === "owner" || (session.owner_email === who.email && atLeast(sourceRole, "writer"));
  const destinations = canMove ? (await env.DB.prepare(`SELECT p.slug, p.name FROM projects p
    JOIN project_members m ON m.project = p.slug WHERE m.email = lower(?) AND m.role IN ('owner', 'writer') AND p.slug != ? ORDER BY p.name`)
    .bind(who.email, session.project).all<{ slug: string; name: string }>()).results : [];
  const movePanel = destinations.length ? `<details class="panel"><summary>Changer de projet<span class="tchev">${icon("chev")}</span></summary>
    <div class="pb project-settings"><form data-session-move="${e(id)}">
      <label class="f">Projet de destination<select name="project" required aria-label="Projet de destination">
        ${destinations.map(p => `<option value="${e(p.slug)}">${e(p.name)} (${e(p.slug)})</option>`).join("")}
      </select></label>
      <p class="hint">Les membres du projet de destination auront accès à cette session. L’auteur devra y avoir le droit d’écriture pour continuer la synchronisation. Les forks et suites existants restent dans leur projet.</p>
      <p role="alert" data-move-error hidden></p><button class="btn" type="submit" disabled>Déplacer la session</button>
    </form></div></details>` : "";
  const command = `/share-session pull ${id}`;
  const model = session.model || records.find((r) => r.data.message?.model)?.data.message?.model;
  const meta = (label: string, value: unknown, mono = false) => value == null || value === "" ? "" : `<dt>${label}</dt><dd${mono ? ' class="mono"' : ""}>${e(value)}</dd>`;
  return page(String(session.title || id), `<div class="detail">
    <header class="dhead"><h1>${e(session.title || id)}</h1>
      <details class="hmeta" data-meta open><summary>${icon("chev")}Détails · ${tokens} tokens · ${records.length} messages</summary>
      ${session.summary ? `<p class="sum">${e(session.summary)}</p>` : ""}
      <div class="line">${author(session.owner_name, session.owner_email)}
        <span class="badge">synchro ${dateLabel(Number(session.last_synced_at), true)}</span>
        <span class="badge mono">${icon("folder")}${e(session.project)}</span>
        ${session.repo ? `<span class="badge mono">${icon("term")}${e(session.repo)}</span>` : ""}
        ${session.branch ? `<span class="badge mono">${icon("branch")}${e(session.branch)}</span>` : ""}
        ${model ? `<span class="chip">${icon("chip")}${e(model)}</span>` : ""}
        ${session.continued_from ? `<span class="badge">${icon("branch")}suite de <a href="/s/${e(encodeURIComponent(String(session.continued_from)))}">${e(session.continued_from)}</a></span>` : ""}
        ${continuation ? `<span class="badge">${icon("branch")}suite dans <a href="/s/${e(encodeURIComponent(String(continuation.id)))}">${e(continuation.id)}</a></span>` : ""}
        ${session.forked_from ? `<span class="badge">${icon("branch")}forké depuis <a href="/s/${e(encodeURIComponent(String(session.forked_from)))}">${e(session.forked_from)}</a> · ${e(session.forked_from_owner)}</span>` : ""}
      </div>
      <p class="hint">${tokens} tokens · ${records.length} messages</p></details>
      ${session.owner_email !== who.email ? `<p class="ro-note">Lecture seule : session de ${e(session.owner_email)}. Si vous la reprenez, la copie sera à votre nom.</p>` : ""}
      <div class="actionbar gutter"><div class="in"><button class="btn primary" type="button" data-copy="${e(command)}">${icon("branch")}Reprendre</button></div></div>
    </header>
    <aside class="side" aria-label="Informations de la session">
      <details class="panel" data-meta open><summary>Informations<span class="tchev">${icon("chev")}</span></summary><div class="pb"><dl class="meta">
        ${meta("Auteur", session.owner_email)}${meta("Projet", session.project, true)}${meta("Repo", session.repo, true)}${meta("Branche", session.branch, true)}
        ${meta("Dossier d’origine", session.cwd_base, true)}${meta("Modèle", model)}${meta("Claude Code", session.cc_version)}
        <dt>Créée</dt><dd>${dateLabel(Number(session.created_at))}</dd>
        <dt>Mise à jour</dt><dd>${dateLabel(Number(session.updated_at))}</dd>
        <dt>Dernière synchro</dt><dd>${dateLabel(Number(session.last_synced_at))}</dd>
        ${meta("Messages", records.length)}${meta("Tokens", tokens)}${meta("Réponses API", usages.size)}${meta("Taille", `${Number(session.bytes)} octets`)}${meta("Identifiant", id, true)}
      </dl></div></details>
      <details class="panel"><summary>Commande de reprise<span class="tchev">${icon("chev")}</span></summary><div class="pb resume-help">
        <p class="hint">Collez cette commande dans Claude Code, ouvert dans votre copie de <span class="mono">${e(session.repo || session.project)}</span>.</p>
        <div class="cmd"><code id="resume-command">${e(command)}</code></div>
        <p class="hint">La copie sera une nouvelle session à votre nom. Celle-ci reste intacte.</p>
      </div></details>
      ${movePanel}
    </aside>
    <section class="chat transcript" id="conversation" tabindex="0" aria-label="Conversation"><h2 class="chat-title">Conversation</h2>
      ${invalid ? `<p class="ro-note">${invalid} ligne(s) JSONL invalide(s) ignorée(s).</p>` : ""}
      ${conversation || '<p class="empty">Aucun message.</p>'}
    </section></div>`, 200, true, {
      active: "projects", projects, email: who.email, backHref,
      backLabel: backHref.startsWith("/sessions") ? "Toutes les sessions" : project?.name || String(session.project),
      breadcrumbs: [
        { label: "Accueil", href: "/" }, { label: "Projets", href: "/projects" },
        { label: project?.name || String(session.project), href: backHref.startsWith(projectHref) ? backHref : projectHref },
        { label: String(session.title || id) },
      ],
    });
}
