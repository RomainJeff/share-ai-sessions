import { harnessOf, readerLine } from "../transcript.ts";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { api, ClientError } from "../lib.ts";
import { readManifest, trackUpload } from "../manifest.ts";
import { detectRepo } from "../repo.ts";
import { stopHookInstalled } from "./doctor.ts";
import { redactJsonl, type RedactionOptions } from "../redact.ts";

type Line = Record<string, any>;

/** Metadata read from the JSONL itself. Declarative: the server only trusts the token for the owner. */
export function readMeta(jsonl: string, fileName: string) {
  const lines: Line[] = [];
  for (const raw of jsonl.split("\n")) {
    try {
      if (raw.trim()) lines.push(JSON.parse(raw));
    } catch {
      // tolerate a truncated last line (session still being written)
    }
  }
  if (harnessOf(lines) === "codex") {
    const meta = lines.find(l => l.type === "session_meta")!.payload;
    const context = lines.filter(l => l.type === "turn_context").at(-1)?.payload;
    const messages = lines.map(readerLine).filter(l => l && !l.isMeta && l.message?.content?.some((b: Line) => b.type === "text"));
    const prompt = messages.find(l => l!.type === "user")?.message?.content?.find((b: Line) => b.type === "text")?.text;
    return { id: meta.id, cwd: meta.cwd, branch: meta.git?.branch, cc_version: meta.cli_version,
      model: context?.model, title: prompt?.slice(0, 80), msg_count: messages.length };
  }
  const last = (pick: (l: Line) => unknown) => lines.map(pick).filter((v) => typeof v === "string" && v).at(-1) as string | undefined;
  const firstPrompt = lines.find((l) => l.type === "user" && !l.isMeta && typeof l.message?.content === "string")?.message.content as string | undefined;
  const assistantIds = new Set(lines.filter((l) => l.type === "assistant").map((l) => l.message?.id));
  const prompts = lines.filter((l) => l.type === "user" && !l.isMeta && typeof l.message?.content === "string").length;

  return {
    id: lines.find((l) => typeof l.sessionId === "string")?.sessionId ?? basename(fileName, ".jsonl"),
    cwd: lines.find((l) => typeof l.cwd === "string")?.cwd as string | undefined,
    branch: last((l) => l.gitBranch),
    cc_version: last((l) => l.version),
    model: last((l) => (l.type === "assistant" && l.message?.model !== "<synthetic>" ? l.message?.model : undefined)),
    title: last((l) => l.aiTitle) ?? last((l) => l.customTitle) ?? last((l) => (l.type === "summary" ? l.summary : undefined)) ?? firstPrompt?.slice(0, 80),
    msg_count: prompts + assistantIds.size,
  };
}

export type UploadOptions = RedactionOptions & { confirm?: string; project?: string };

/** Opt-in marker echoed on stdout; Claude's transcript keeps it, so sync can recover id and strip policy after a lost manifest. */
export const optInMarker = (id: string, options: RedactionOptions = {}) =>
  `share-session:opt-in ${id}${options.stripThinking ? " --strip-thinking" : ""}${options.stripToolResults ? " --strip-tool-results" : ""}`;

/** Redaction of complete lines only; per-line and deterministic, so sanitized(prefix) is a prefix of sanitized(all). */
export function sanitize(jsonl: string, options: RedactionOptions = {}) {
  return redactJsonl(jsonl, options);
}

/**
 * The user picks the project of a new session. Once shared, a session, its forks and its compaction
 * continuations stay in that project: the server keeps it when `project` is omitted and refuses a change.
 */
async function prepare(path: string, jsonl: string, options: UploadOptions) {
  const { cwd, ...meta } = readMeta(jsonl, path);
  const { sessions, forks, continuations } = await readManifest();
  const inherited = !!(sessions[meta.id] || forks?.[meta.id] || continuations?.[meta.id]);
  const body = {
    ...meta, cwd_base: cwd, repo: detectRepo(cwd ?? process.cwd()),
    ...(options.project ? { project: options.project.toLowerCase() } : {}),
    ...forks?.[meta.id], ...continuations?.[meta.id],
  };
  const project = options.project?.toLowerCase() ?? sessions[meta.id]?.project ??
    (forks?.[meta.id] ? "same as the forked session" : continuations?.[meta.id] ? "same as the compacted session" : "unchanged");
  return { id: meta.id, project, inherited, redacted: sanitize(jsonl, options), metadata: redactJsonl(JSON.stringify(body)) };
}

/** POST a full sanitized replacement and record the local source snapshot. Callers own consent. */
export async function send(path: string, jsonl: string, options: UploadOptions = {}): Promise<unknown> {
  const { id, redacted, metadata } = await prepare(path, jsonl, options);
  const form = new FormData();
  form.set("meta", metadata.jsonl);
  form.set("jsonl", new Blob([redacted.jsonl], { type: "application/x-ndjson" }), "session.jsonl");
  const result = await api("/api/sessions", { method: "POST", body: form }) as { project?: string };
  await trackUpload(id, path, Buffer.from(jsonl), options, result.project);
  return { ...(result as object), marker: optInMarker(id, options), stop_hook: stopHookInstalled() };
}

export async function upload(path: string, options: UploadOptions = {}): Promise<unknown> {
  let source: Buffer;
  try {
    source = await readFile(path);
  } catch {
    throw new ClientError("not_found", `Cannot read ${path}`);
  }
  // A live session keeps appending after its preview: confirm uploads exactly the previewed bytes, the next sync carries the rest.
  const previewed = options.confirm === undefined ? source.length : Number(options.confirm.split(".")[1]);
  if (!Number.isSafeInteger(previewed) || previewed > source.length) {
    throw new ClientError('confirmation_mismatch', 'Transcript or options changed, or confirmation is invalid; request a fresh preview and confirm its hash');
  }
  const jsonl = source.subarray(0, previewed).toString("utf8");
  const { project, inherited, redacted, metadata } = await prepare(path, jsonl, options);
  // Sync (send) relies on the server keeping the project; only a first upload has to pick one.
  if (!options.project && !inherited) {
    throw new ClientError("project_required", "Pick a project: --project <slug> (client.ts project list, or project create <slug>)");
  }
  const replacements = { ...redacted.replacements };
  for (const [kind, count] of Object.entries(metadata.replacements)) replacements[kind] = (replacements[kind] ?? 0) + count;
  const preview = {
    project,
    lines: redacted.lines,
    replacements,
    bytes: Buffer.byteLength(redacted.jsonl),
    thinking_removed: redacted.thinking_removed,
    tool_results_stripped: redacted.tool_results_stripped,
  };
  // Bind consent to the source snapshot, sanitized metadata and strip policy. No unsafe text is printed.
  const confirmation = createHash('sha256').update(JSON.stringify({
    source: createHash('sha256').update(jsonl).digest('hex'),
    metadata: metadata.jsonl,
    stripThinking: !!options.stripThinking,
    stripToolResults: !!options.stripToolResults,
  })).digest('hex') + `.${previewed}`;
  if (!options.confirm) return { status: 'confirmation_required', preview, confirmation };
  if (options.confirm !== confirmation) {
    throw new ClientError('confirmation_mismatch', 'Transcript or options changed, or confirmation is invalid; request a fresh preview and confirm its hash');
  }
  return send(path, jsonl, options);
}

/** Two-step consent also works in a noninteractive agent session; no blanket --yes bypass. */
export async function uploadCommand(args: string[]): Promise<unknown> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: {
      'strip-thinking': { type: 'boolean' },
      'strip-tool-results': { type: 'boolean' },
      confirm: { type: 'string' },
      project: { type: 'string' },
    } });
  } catch {
    throw new ClientError('usage', 'Usage: client.ts upload <path.jsonl> [--project <slug>] [--strip-thinking] [--strip-tool-results] [--confirm <preview hash>]');
  }
  const [path] = parsed.positionals;
  if (!path || parsed.positionals.length !== 1) throw new ClientError('usage', 'Provide one transcript path');
  return upload(path, {
    stripThinking: parsed.values['strip-thinking'] === true,
    stripToolResults: parsed.values['strip-tool-results'] === true,
    confirm: typeof parsed.values.confirm === 'string' ? parsed.values.confirm : undefined,
    project: typeof parsed.values.project === 'string' ? parsed.values.project : undefined,
  });
}
