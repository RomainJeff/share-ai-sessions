import { readerLine } from "../../skills/share-session/scripts/transcript";
import type { Identity } from "../auth";
import { canManageSession, MEMBER, roleIn, VISIBLE, visibleSince } from "../db";
import { getProjectSummaries } from "../navigation";
import { markdownHtml } from "../markdown";
import { appName, author, dateLabel, escapeHtml as e, icon, type IconName, page, statusIcon } from "../ui";

type RecordLine = { type?: string; timestamp?: string; isMeta?: boolean; isCompactSummary?: boolean; toolUseResult?: unknown; message?: { id?: string; model?: string; content?: unknown; usage?: Record<string, number> } };

type TranscriptRecord = { raw: string; data: RecordLine };

type Block = Record<string, any>;

const PROMPT_WRAPPERS = /<(command-[\w-]+|local-command-[\w-]+|system-reminder)\b[^>]*>[\s\S]*?<\/\1>/g;

/** Human text of a prompt, without harness wrappers. */
function promptText(value: unknown): string {
  const text = typeof value === "string" ? value : Array.isArray(value) ? value.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "";
  return text.replace(PROMPT_WRAPPERS, "").replace(/^(?:\s*\[Request interrupted[^\]\r\n]*\])+\s*/, "").trim();
}

/** Claude Code also uses user records for tool results and injected context. */
function isHumanPrompt(data: RecordLine): boolean {
  if (data.type !== "user" || data.isMeta || data.isCompactSummary || "toolUseResult" in data) return false;
  const value = data.message?.content;
  if (typeof value !== "string" && (!Array.isArray(value) || !value.every((b) =>
    b?.type === "image" || (b?.type === "text" && typeof b.text === "string")))) return false;
  // Keep human text alongside wrappers; wrapper-only records belong to context.
  return (Array.isArray(value) && value.some((b) => b.type === "image")) || promptText(value).length > 0;
}

const blocks = (value: unknown): Block[] => typeof value === "string" ? [{ type: "text", text: value }]
  : Array.isArray(value) ? value.filter((b) => b && typeof b === "object") : [{ type: "text", text: JSON.stringify(value ?? "") }];
const textOf = (value: unknown): string => typeof value === "string" ? value
  : Array.isArray(value) ? value.map((b) => typeof b === "string" ? b : b?.type === "text" ? String(b.text ?? "") : b?.type === "image" ? "[image]" : JSON.stringify(b)).join("\n")
  : value == null ? "" : JSON.stringify(value, null, 2);
const lines = (text: string) => text ? text.replace(/\n$/, "").split("\n").length : 0;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const raw = (records: string[]) => `<details class="reason raw"><summary>${icon("chev")}JSON brut</summary><pre class="code">${records.map(e).join("\n")}</pre></details>`;

/** Long outputs keep their head and tail; the full text stays in the raw JSON. */
function clip(text: string, keep = 20): string {
  const all = text.replace(/\n$/, "").split("\n");
  if (all.length <= keep * 2 + 4) return e(all.join("\n"));
  return `${e(all.slice(0, keep).join("\n"))}\n<span class="cut">… ${all.length - keep * 2} lignes masquées …</span>\n${e(all.slice(-keep).join("\n"))}`;
}
const code = (text: string) => `<pre class="code">${clip(text)}</pre>`;
const firstString = (input: unknown) => input && typeof input === "object" ? Object.values(input).find((v) => typeof v === "string" && v.length < 300) as string | undefined : typeof input === "string" ? input.split("\n")[0] : undefined;

/** Unified diff from Edit/MultiEdit/apply_patch inputs. */
function diffHtml(rows: string[]): { html: string; add: number; del: number } {
  let add = 0, del = 0;
  const html = rows.map((line) => {
    const kind = line.startsWith("+") && !line.startsWith("+++") ? (add++, "da") : line.startsWith("-") && !line.startsWith("---") ? (del++, "dd") : /^(@@|\*\*\*)/.test(line) ? "dh" : "";
    return `<span class="${kind || "dc"}">${e(line) || " "}</span>`;
  }).join("");
  return { html: `<pre class="diff">${html}</pre>`, add, del };
}
const editRows = (edits: Block[]) => edits.flatMap((edit, i) => [
  ...(i ? ["@@"] : []),
  ...String(edit.old_string ?? "").split("\n").filter((l, j, all) => l || all.length > 1).map((l) => `-${l}`),
  ...String(edit.new_string ?? "").split("\n").filter((l, j, all) => l || all.length > 1).map((l) => `+${l}`),
]);

type ToolView = { icon: IconName; verb: string; arg?: string; meta?: string; body: string; read?: "file" | "search"; edit?: boolean; prose?: boolean };

/** One line per tool: verb, key argument, short outcome; details below. */
function toolView(name: string, input: any, result: Block | undefined): ToolView {
  let out = result ? textOf(result.content) : "";
  const err = result?.is_error === true;
  const outBody = result ? code(out) : "";
  const count = (n: number, word: string) => result && !err ? plural(n, word) : undefined;
  const inp = input && typeof input === "object" ? input : {};
  if (["Bash", "exec_command", "shell", "local_shell", "shell_command"].includes(name)) {
    const cmd = typeof inp.command === "string" ? inp.command : Array.isArray(inp.command) ? String(inp.command.at(-1)) : typeof inp.cmd === "string" ? inp.cmd : Array.isArray(inp.cmd) ? inp.cmd.join(" ") : JSON.stringify(input);
    let exit: string | undefined;
    try { const parsed = JSON.parse(out); if (typeof parsed?.output === "string") { out = parsed.output; exit = parsed.metadata?.exit_code?.toString(); } } catch { /* plain text output */ }
    exit ??= out.match(/(?:exit code|exited with code)[:\s]+(-?\d+)/i)?.[1];
    const failed = err || (exit !== undefined && exit !== "0");
    return { icon: "term", verb: "Bash", arg: cmd.split("\n")[0], meta: exit !== undefined ? `<span class="${failed ? "bad" : ""}">exit ${e(exit)}</span>` : err ? '<span class="bad">erreur</span>' : undefined,
      body: `<pre class="term"><span class="t-dim">$ </span>${e(cmd)}${out ? `\n${clip(out)}` : ""}</pre>` };
  }
  if (name === "Read") return { icon: "file", verb: "Lecture", arg: inp.file_path, meta: count(lines(out), "ligne"), body: outBody, read: "file" };
  if (name === "Edit" || name === "MultiEdit") {
    const d = diffHtml(editRows(name === "Edit" ? [inp] : Array.isArray(inp.edits) ? inp.edits : []));
    return { icon: "pen", verb: "Modification", arg: inp.file_path, meta: `<span class="add">+${d.add}</span> <span class="del">−${d.del}</span>`, body: d.html + (err ? outBody : ""), edit: true };
  }
  if (name === "Write") {
    const text = String(inp.content ?? "");
    return { icon: "pen", verb: "Écriture", arg: inp.file_path, meta: `<span class="add">+${lines(text)}</span>`, body: code(text) + (err ? outBody : ""), edit: true };
  }
  if (name === "apply_patch") {
    const patch = typeof input === "string" ? input : String(inp.input ?? inp.patch ?? "");
    const d = diffHtml(patch.split("\n"));
    return { icon: "pen", verb: "Patch", arg: patch.match(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/m)?.[1], meta: `<span class="add">+${d.add}</span> <span class="del">−${d.del}</span>`, body: d.html + (err ? outBody : ""), edit: true };
  }
  if (name === "Grep") return { icon: "search", verb: "Recherche", arg: `"${inp.pattern ?? ""}"${inp.path ? ` dans ${inp.path}` : ""}`, meta: count(lines(out), "résultat"), body: outBody, read: "search" };
  if (name === "Glob") return { icon: "search", verb: "Fichiers", arg: inp.pattern, meta: count(lines(out), "résultat"), body: outBody, read: "search" };
  if (name === "WebFetch") return { icon: "globe", verb: "Page web", arg: inp.url, body: outBody, read: "file" };
  if (name === "WebSearch" || name === "web_search") return { icon: "globe", verb: "Recherche web", arg: inp.query, body: outBody, read: "search" };
  if (name === "Task" || name === "Agent") return { icon: "bot", verb: "Agent", arg: inp.description || inp.subagent_type,
    body: `<h4>Consigne</h4>${markdownHtml(String(inp.prompt ?? ""))}${result ? `<h4>Résultat</h4>${markdownHtml(out)}` : ""}` };
  if (name === "TodoWrite" || name === "update_plan") {
    const todos: Block[] = Array.isArray(inp.todos) ? inp.todos : Array.isArray(inp.plan) ? inp.plan : [];
    const done = todos.filter((t) => t.status === "completed").length;
    return { icon: "list", verb: "Tâches", arg: `${done}/${todos.length} terminées`,
      body: `<ul class="todo">${todos.map((t) => `<li class="${e(t.status)}"><span class="box" aria-hidden="true"></span>${e(t.content ?? t.step ?? "")}</li>`).join("")}</ul>` };
  }
  const mcp = name.match(/^mcp__(.+?)__(.+)$/);
  return { icon: mcp ? "plug" : "term", verb: mcp ? `${mcp[1]} › ${mcp[2]}` : name || "Outil", arg: firstString(input),
    body: `<h4>Entrée</h4><pre class="code">${e(typeof input === "string" ? input : JSON.stringify(input, null, 2))}</pre>${result ? `<h4>Résultat</h4>${outBody}` : ""}` };
}

function toolRow(view: ToolView, err: boolean, raws: string[]): string {
  return `<details class="tool${view.prose ? " prose" : ""}${err ? " err" : ""}"${err ? " open" : ""}><summary><span class="ticon">${icon(view.icon)}</span><span class="tverb">${e(view.verb)}</span>${view.arg ? `<span class="targ">${e(view.arg)}</span>` : '<span class="targ"></span>'}${view.meta ? `<span class="tmeta">${view.meta}</span>` : ""}<span class="tchev">${icon("chev")}</span></summary><div class="tbody">${view.body}${raws.length ? raw(raws) : ""}</div></details>`;
}

type Item = { html: string; read?: "file" | "search" };
type Results = Map<string, { block: Block; raw: string }>;
type Stats = { tools: number; edits: number; errors: number };

/** Blocks of one record. Tool results render under their call; orphan results stay visible. */
function recordItems({ raw: line, data }: TranscriptRecord, results: Results, calls: Set<string>, stats: Stats, answer = false): Item[] {
  const items: Item[] = [];
  const time = data.timestamp ? dateLabel(data.timestamp) : "";
  let rawPending = true;
  const takeRaw = () => rawPending ? (rawPending = false, [line]) : [];
  for (const block of blocks(data.message?.content)) {
    if (block.type === "tool_use") {
      const paired = results.get(String(block.id));
      const err = paired?.block.is_error === true;
      const view = toolView(String(block.name ?? ""), block.input, paired?.block);
      stats.tools++; if (view.edit) stats.edits++; if (err) stats.errors++;
      items.push({ html: toolRow(view, err, [...takeRaw(), ...(paired ? [paired.raw] : [])]), read: err ? undefined : view.read });
    } else if (block.type === "tool_result") {
      if (calls.has(String(block.tool_use_id))) continue;
      items.push({ html: toolRow({ icon: "term", verb: "Résultat", arg: String(block.tool_use_id ?? ""), body: code(textOf(block.content)) }, block.is_error === true, takeRaw()) });
    } else if (block.type === "thinking") {
      const thought = String(block.thinking ?? "").trim();
      if (thought) items.push({ html: toolRow({ icon: "think", verb: "Réflexion", prose: true, arg: thought.split("\n")[0]!.replace(/[#*_`>]/g, "").trim(), body: `<div class="rtxt">${markdownHtml(thought)}</div>` }, false, takeRaw()) });
    } else if (block.type === "redacted_thinking") {
      continue;
    } else if (block.type === "image") {
      items.push({ html: '<span class="md-img">Image jointe</span>' });
    } else if (block.type === "text" && data.type === "assistant") {
      items.push({ html: answer ? markdownHtml(String(block.text ?? "")) : `<div class="say">${markdownHtml(String(block.text ?? ""))}</div>` });
    } else if (block.type === "text") {
      items.push({ html: `<details class="reason context"><summary>${icon("chev")}Contexte ${time}</summary><pre class="code">${clip(String(block.text ?? ""))}</pre>${raw(takeRaw())}</details>` });
    } else {
      items.push({ html: toolRow({ icon: "term", verb: String(block.type || "Bloc"), body: `<pre class="code">${e(JSON.stringify(block, null, 2))}</pre>` }, false, takeRaw()) });
    }
  }
  if (rawPending && !answer) items.push({ html: raw([line]) });
  return items;
}

/** Consecutive read-only tools fold into one "Exploré" line; errors, edits and commands never do. */
function grouped(items: Item[]): string {
  let html = "";
  for (let i = 0; i < items.length;) {
    let j = i;
    while (j < items.length && items[j]!.read) j++;
    if (j - i >= 2) {
      const run = items.slice(i, j);
      const files = run.filter((x) => x.read === "file").length, searches = run.length - files;
      const label = [files && plural(files, "fichier"), searches && plural(searches, "recherche")].filter(Boolean).join(", ");
      html += `<details class="tool tgroup"><summary><span class="ticon">${icon("layers")}</span><span class="tverb">Exploré</span><span class="targ">${label}</span><span class="tchev">${icon("chev")}</span></summary><div class="tlist">${run.map((x) => x.html).join("")}</div></details>`;
      i = j;
    } else html += items[i++]!.html;
  }
  return html;
}

/** Reader rendering of a hosted transcript, or null when a segment is missing. */
async function readConversation(env: Env, id: string) {
  // T02 stores plain JSONL; also read the gzip segments used by incremental sync.
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await env.SESSIONS.list({ prefix: `sessions/${id}/seg-`, cursor });
    keys.push(...listed.objects.map((o) => o.key).filter((k) => /\/seg-\d+\.jsonl(?:\.gz)?$/.test(k)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  if (!keys.length) return null;
  let jsonl = "";
  for (const key of keys.sort()) {
    const object = await env.SESSIONS.get(key);
    if (!object) return null;
    jsonl += key.endsWith(".gz") ? await new Response(object.body.pipeThrough(new DecompressionStream("gzip"))).text() : await object.text();
  }
  const harness = jsonl.split("\n").some(raw => { try { return JSON.parse(raw).type === "session_meta"; } catch { return false; } }) ? "Codex" : "Claude";
  const records: TranscriptRecord[] = [];
  let invalid = 0;
  const usages = new Map<string, Record<string, number>>();
  for (const raw of jsonl.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.type === "event_msg" && parsed.payload?.type === "token_count") {
        const total = parsed.payload.info?.total_token_usage;
        if (total) usages.set("codex-total", { input_tokens: Number(total.input_tokens) || 0, output_tokens: Number(total.output_tokens) || 0 });
      }
      const data = readerLine(parsed) as RecordLine | undefined;
      if (!data) continue;
      if (!data || typeof data !== "object") { invalid++; continue; }
      if (data.type === "assistant" && data.message?.id && data.message.usage) usages.set(data.message.id, data.message.usage);
      if (data.type === "user" || data.type === "assistant") records.push({ raw, data });
    } catch { invalid++; }
  }
  const tokens = [...usages.values()].reduce((total, usage) => total +
    ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"].reduce((sum, k) => sum + (Number(usage[k]) || 0), 0), 0);
  // Pair every tool_result with its call, wherever the result record lands.
  const calls = new Set<string>(), results: Results = new Map();
  for (const { raw, data } of records) for (const block of blocks(data.message?.content)) {
    if (block.type === "tool_use") calls.add(String(block.id));
    if (block.type === "tool_result") results.set(String(block.tool_use_id), { block, raw });
  }
  const total: Stats = { tools: 0, edits: 0, errors: 0 };
  let conversation = "", turns = 0;
  const titles: string[] = [];
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
    let html = "";
    if (prompt) {
      turns++;
      const value = prompt.data.message?.content;
      const images = Array.isArray(value) ? value.filter((b) => b?.type === "image").length : 0;
      titles.push(promptText(value).replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 90) || (images ? plural(images, "image jointe") : "Sans texte"));
      html += `<article class="turn me" data-role="user"><span class="avatar lg" aria-hidden="true">U</span><div class="col">
        <div class="meta-l"><b>Utilisateur</b><a href="#t${turns}">Tour ${turns}</a>${prompt.data.timestamp ? dateLabel(prompt.data.timestamp) : ""}</div>
        <div class="bubble">${markdownHtml(promptText(value))}${images ? `<span class="md-img">${plural(images, "image jointe")}</span>` : ""}</div>${raw([prompt.raw])}</div></article>`;
    }
    const steps = records.slice(start, end).filter((_, i) => start + i !== final && !(prompt && i === 0));
    if (steps.length) {
      const stats: Stats = { tools: 0, edits: 0, errors: 0 };
      const body = grouped(steps.flatMap((r) => recordItems(r, results, calls, stats)));
      total.tools += stats.tools; total.edits += stats.edits; total.errors += stats.errors;
      const elapsed = Date.parse(records[end - 1]!.data.timestamp || "") - Date.parse(prompt?.data.timestamp || "");
      const minutes = Math.floor(elapsed / 60000);
      const duration = minutes < 1 ? "moins d'une minute" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
      const label = Number.isFinite(elapsed) && elapsed >= 0 ? `A travaillé pendant ${duration}` : "Étapes intermédiaires";
      const pills = [stats.tools ? plural(stats.tools, "outil") : plural(steps.length, "étape"), stats.edits && plural(stats.edits, "modif")]
        .filter(Boolean).map((p) => `<span class="pill">${p}</span>`).join("") + (stats.errors ? `<span class="pill bad">${plural(stats.errors, "erreur")}</span>` : "");
      html += `<details class="worked"><summary>${icon("chev")}<span>${e(label)}</span>${pills}</summary><div>${body}</div></details>`;
    }
    if (final >= 0) {
      const answer = records[final]!;
      html += `<article class="turn ai" data-role="assistant"><span class="avatar lg av-ai" aria-hidden="true">C</span><div class="col">
        <div class="meta-l"><b>${harness}</b>${answer.data.timestamp ? dateLabel(answer.data.timestamp) : ""}</div>
        <div class="answer">${grouped(recordItems(answer, results, calls, total, true))}</div>${raw([answer.raw])}</div></article>`;
    }
    conversation += prompt ? `<section class="tturn" id="t${turns}" aria-label="Tour ${turns}">${html}</section>` : html;
  }
  return { harness, records, invalid, usages, tokens, conversation, turns, titles, ...total };
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

  // A relay without a transcript has nothing in R2; one with a transcript reads like a hosted session.
  const hosted = Number(session.segment_count) > 0;
  const transcript = !hosted ? { harness: "Claude", records: [] as TranscriptRecord[], invalid: 0, usages: new Map<string, Record<string, number>>(), tokens: 0, conversation: "", turns: 0, titles: [] as string[], tools: 0, edits: 0, errors: 0 }
    : await readConversation(env, id);
  if (!transcript) return page("Transcript indisponible", "<h1>Transcript indisponible</h1>", 503);
  const { harness, records, invalid, usages, tokens, conversation, turns, titles, tools } = transcript;
  const canManage = canManageSession(await roleIn(env, String(session.project), who.email), String(session.owner_email), who.email);
  const destinations = canManage ? (await env.DB.prepare(`SELECT p.slug, p.name FROM projects p
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
  const app = session.external_app ? appName(session.external_app) : null;
  const expires = session.external_expires_at === null ? null : Number(session.external_expires_at);
  const expired = expires !== null && expires <= Date.now();
  const resume = (primary: boolean) => `<button class="btn${primary ? " primary" : ""}" type="button" data-copy="${e(command)}">${icon("branch")}Reprendre</button>`;
  // A relay opens the hosting app (the only place to interact); its transcript, when uploaded, can also be resumed.
  const action = !app ? resume(true)
    : (expired ? '<button class="btn primary" type="button" disabled data-expired>Lien expiré</button>'
      : `<a class="btn primary" href="${e(session.external_url)}" target="_blank" rel="noopener noreferrer">${icon("chat")}Ouvrir dans ${e(app)}</a>`)
      + (hosted ? resume(false) : "");
  const done = session.done_at !== null;
  const doneLabel = done ? `<span>Terminée ${dateLabel(Number(session.done_at), true)}</span>` : "<span>En cours</span>";
  // The pill is both the state and its toggle; readers without rights only see a closed session's state.
  const statusPill = canManage ? `<button class="status-pill${done ? " is-done" : ""}" type="button" data-session-status="${e(id)}" data-status="${done ? "active" : "done"}" disabled>${statusIcon(done, false)}${doneLabel}<span class="act">${done ? "Rouvrir" : "Marquer terminée"}</span></button>`
    : done ? `<span class="status-pill is-done">${statusIcon(true, false)}${doneLabel}</span>` : "";
  const model = session.model || records.find((r) => r.data.message?.model)?.data.message?.model;
  const meta = (label: string, value: unknown, mono = false) => value == null || value === "" ? "" : `<dt>${label}</dt><dd${mono ? ' class="mono"' : ""}>${e(value)}</dd>`;
  return page(String(session.title || id), `<div class="detail">
    <header class="dhead${done ? " is-done" : ""}">${statusPill}<h1>${e(session.title || id)}</h1>
      <details class="hmeta"><summary>${icon("chev")}Détails${hosted ? ` · ${tokens} tokens · ${records.length} messages · ${plural(turns, "tour")} · ${plural(tools, "outil")}` : ""}</summary>
      ${session.summary ? `<p class="sum">${e(session.summary)}</p>` : ""}
      <div class="line">${author(session.owner_name, session.owner_email)}
        ${app ? `<span class="badge">${e(app)}</span>` : ""}
        <span class="badge">synchro ${dateLabel(Number(session.last_synced_at), true)}</span>
        <span class="badge mono">${icon("folder")}${e(session.project)}</span>
        ${session.repo ? `<span class="badge mono">${icon("term")}${e(session.repo)}</span>` : ""}
        ${session.branch ? `<span class="badge mono">${icon("branch")}${e(session.branch)}</span>` : ""}
        ${model ? `<span class="chip">${icon("chip")}${e(model)}</span>` : ""}
        ${session.continued_from ? `<span class="badge">${icon("branch")}suite de <a href="/s/${e(encodeURIComponent(String(session.continued_from)))}">${e(session.continued_from)}</a></span>` : ""}
        ${continuation ? `<span class="badge">${icon("branch")}suite dans <a href="/s/${e(encodeURIComponent(String(continuation.id)))}">${e(continuation.id)}</a></span>` : ""}
        ${session.forked_from ? `<span class="badge">${icon("branch")}forké depuis <a href="/s/${e(encodeURIComponent(String(session.forked_from)))}">${e(session.forked_from)}</a> · ${e(session.forked_from_owner)}</span>` : ""}
      </div>
      </details>
      ${session.owner_email !== who.email && hosted ? `<p class="ro-note">Lecture seule : session de ${e(session.owner_email)}. Si vous la reprenez, la copie sera à votre nom.</p>` : ""}
      ${canManage ? '<p class="ro-note" role="alert" data-status-error hidden></p>' : ""}
      <div class="actionbar gutter"><div class="in">${action}</div></div>
    </header>
    <aside class="side" aria-label="Informations de la session">
      <details class="panel" data-meta open><summary>Informations<span class="tchev">${icon("chev")}</span></summary><div class="pb"><dl class="meta">
        ${meta("Auteur", session.owner_email)}${meta("Projet", session.project, true)}${meta("Repo", session.repo, true)}${meta("Branche", session.branch, true)}
        ${meta("Dossier d’origine", session.cwd_base, true)}${meta("Modèle", model)}${meta(harness === "Codex" ? "Codex" : "Claude Code", session.cc_version)}
        <dt>Créée</dt><dd>${dateLabel(Number(session.created_at))}</dd>
        <dt>Mise à jour</dt><dd>${dateLabel(Number(session.updated_at))}</dd>
        <dt>Dernière synchro</dt><dd>${dateLabel(Number(session.last_synced_at))}</dd>
        ${app ? `${meta("Hébergée par", app)}${expires === null ? "" : `<dt>Lien valable jusqu’au</dt><dd>${dateLabel(expires)}</dd>`}` : ""}
        ${!hosted ? meta("Messages", session.msg_count || null)
          : `${meta("Messages", records.length)}${meta("Tokens", tokens)}${meta("Réponses API", usages.size)}${meta("Taille", `${Number(session.bytes)} octets`)}`}${meta("Identifiant", id, true)}
      </dl></div></details>
      ${!hosted ? "" : `<details class="panel"><summary>Commande de reprise<span class="tchev">${icon("chev")}</span></summary><div class="pb resume-help">
        <p class="hint">Collez cette commande dans Claude Code ou Codex, ouvert dans votre copie de <span class="mono">${e(session.repo || session.project)}</span>.</p>
        <div class="cmd"><code id="resume-command">${e(command)}</code></div>
        <p class="hint">La copie sera une nouvelle session à votre nom. Celle-ci reste intacte.</p>
      </div></details>`}
      ${movePanel}
    </aside>
    ${!hosted ? "" : `<section class="chat transcript" id="conversation" tabindex="0" aria-label="Conversation"><div class="chat-head"><h2 class="chat-title">Conversation</h2>
      <div class="levels" role="group" aria-label="Niveau de détail" data-levels hidden><button type="button" data-level="conv">Conversation</button><button type="button" data-level="normal">Normal</button><button type="button" data-level="full">Détaillé</button></div></div>
      ${turns > 1 ? `<nav class="turnrail" aria-label="Tours de la conversation" tabindex="0" data-rail><div class="ticks" aria-hidden="true">${titles.map(() => "<i></i>").join("")}</div>
        <ol class="rail-list">${titles.map((t, i) => `<li><a href="#t${i + 1}" data-turn-link><span class="n">${i + 1}</span><span class="tt">${e(t)}</span></a></li>`).join("")}</ol></nav>` : ""}
      ${invalid ? `<p class="ro-note">${invalid} ligne(s) JSONL invalide(s) ignorée(s).</p>` : ""}
      ${conversation || '<p class="empty">Aucun message.</p>'}
    </section>`}</div>`, 200, true, {
      active: "projects", projects, email: who.email, currentProject: String(session.project), backHref,
      backLabel: backHref.startsWith("/sessions") ? "Toutes les sessions" : project?.name || String(session.project),
      breadcrumbs: [
        { label: "Accueil", href: "/" }, { label: "Projets", href: "/projects" },
        { label: project?.name || String(session.project), href: backHref.startsWith(projectHref) ? backHref : projectHref },
        { label: String(session.title || id) },
      ],
    });
}
