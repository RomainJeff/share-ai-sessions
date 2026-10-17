import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { api, ClientError } from "../lib.ts";
import { readManifest, trackUpload } from "../manifest.ts";
import { detectProject } from "../project.ts";
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

export type UploadOptions = RedactionOptions & { confirm?: string };

/** Opt-in marker echoed on stdout; Claude's transcript keeps it, so sync can recover id and strip policy after a lost manifest. */
export const optInMarker = (id: string, options: RedactionOptions = {}) =>
  `share-session:opt-in ${id}${options.stripThinking ? " --strip-thinking" : ""}${options.stripToolResults ? " --strip-tool-results" : ""}`;

/** Redaction of complete lines only; per-line and deterministic, so sanitized(prefix) is a prefix of sanitized(all). */
export function sanitize(jsonl: string, options: RedactionOptions = {}) {
  return redactJsonl(jsonl, options);
}

async function prepare(path: string, jsonl: string, options: RedactionOptions) {
  const { cwd, ...meta } = readMeta(jsonl, path);
  const fork = (await readManifest()).forks?.[meta.id];
  const body = { ...meta, cwd_base: cwd, project: detectProject(cwd ?? process.cwd()), ...fork };
  return { id: meta.id, redacted: sanitize(jsonl, options), metadata: redactJsonl(JSON.stringify(body)) };
}

/** POST a full sanitized replacement and record the local source snapshot. Callers own consent. */
export async function send(path: string, jsonl: string, options: RedactionOptions = {}): Promise<unknown> {
  const { id, redacted, metadata } = await prepare(path, jsonl, options);
  const form = new FormData();
  form.set("meta", metadata.jsonl);
  form.set("jsonl", new Blob([redacted.jsonl], { type: "application/x-ndjson" }), "session.jsonl");
  const result = await api("/api/sessions", { method: "POST", body: form });
  await trackUpload(id, path, Buffer.from(jsonl), options);
  return { ...(result as object), marker: optInMarker(id, options) };
}

export async function upload(path: string, options: UploadOptions = {}): Promise<unknown> {
  let jsonl: string;
  try {
    jsonl = await readFile(path, "utf8");
  } catch {
    throw new ClientError("not_found", `Cannot read ${path}`);
  }
  const { redacted, metadata } = await prepare(path, jsonl, options);
  const replacements = { ...redacted.replacements };
  for (const [kind, count] of Object.entries(metadata.replacements)) replacements[kind] = (replacements[kind] ?? 0) + count;
  const preview = {
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
  })).digest('hex');
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
    } });
  } catch {
    throw new ClientError('usage', 'Usage: client.ts upload <path.jsonl> [--strip-thinking] [--strip-tool-results] [--confirm <preview hash>]');
  }
  const [path] = parsed.positionals;
  if (!path || parsed.positionals.length !== 1) throw new ClientError('usage', 'Provide one transcript path');
  return upload(path, {
    stripThinking: parsed.values['strip-thinking'] === true,
    stripToolResults: parsed.values['strip-tool-results'] === true,
    confirm: typeof parsed.values.confirm === 'string' ? parsed.values.confirm : undefined,
  });
}
