import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { api, ClientError, loadBaseUrl } from "../lib.ts";
import { readManifest, writeManifest } from "../manifest.ts";
import { redactJsonl } from "../redact.ts";
import { detectRepo } from "../repo.ts";
import { readMeta } from "./upload.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USAGE = "Usage: client.ts relay <id> --app <slug> --url <https url> [--expires <ISO date>] [--project <slug>] [--transcript <path.jsonl>] [--title <text>]";

/** Metadata only, redacted like an upload's. The transcript itself never leaves the machine. */
async function transcriptMeta(path: string): Promise<Record<string, unknown>> {
  let jsonl: string;
  try {
    jsonl = await readFile(path, "utf8");
  } catch {
    throw new ClientError("not_found", `Cannot read ${path}`);
  }
  const { id: _id, cwd, ...meta } = readMeta(jsonl, path);
  return JSON.parse(redactJsonl(JSON.stringify({ ...meta, cwd_base: cwd, repo: detectRepo(cwd ?? process.cwd()) })).jsonl);
}

/**
 * Relay a session hosted by another app (e.g. a T3 Code guest link): Session Share lists it with its
 * metadata and opens the link, never stores a transcript. Rerun with a fresh link to renew it.
 */
export async function relay(args: string[]): Promise<unknown> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: {
      app: { type: "string" }, url: { type: "string" }, expires: { type: "string" },
      project: { type: "string" }, transcript: { type: "string" }, title: { type: "string" },
    } });
  } catch {
    throw new ClientError("usage", USAGE);
  }
  const { positionals, values } = parsed;
  const id = positionals[0]?.toLowerCase();
  const app = typeof values.app === "string" ? values.app.trim().toLowerCase() : "";
  const url = typeof values.url === "string" ? values.url : "";
  if (positionals.length !== 1 || !id || !UUID.test(id) || !app || !URL.canParse(url) || new URL(url).protocol !== "https:") {
    throw new ClientError("usage", USAGE);
  }
  let expiresAt: string | null = null;
  if (typeof values.expires === "string") {
    const time = Date.parse(values.expires);
    if (!Number.isFinite(time)) throw new ClientError("usage", "--expires must be an ISO date");
    expiresAt = new Date(time).toISOString();
  }
  const project = typeof values.project === "string" ? values.project.trim().toLowerCase() : undefined;
  if (!project && !(await readManifest()).relays?.[id]) {
    throw new ClientError("project_required", "Pick a project: --project <slug> (client.ts project list, or project create <slug>)");
  }

  const meta: Record<string, unknown> = typeof values.transcript === "string" ? await transcriptMeta(values.transcript) : {};
  // The hosting app usually names the session better than its first prompt.
  if (typeof values.title === "string" && values.title.trim()) meta.title = JSON.parse(redactJsonl(JSON.stringify({ title: values.title.trim() })).jsonl).title;
  const result = await api(`/api/sessions/${id}/relay`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...meta, app, url, expires_at: expiresAt, ...(project ? { project } : {}) }),
  }) as { project: string };

  const manifest = await readManifest();
  delete manifest.stopped?.[id];
  (manifest.relays ??= {})[id] = { app, url, expires_at: expiresAt, project: result.project };
  await writeManifest(manifest);
  return { ...result, url: `${await loadBaseUrl()}/s/${id}` };
}
