import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { api, ClientError } from "../lib.ts";
import { lastLineHash, readManifest, trackUpload } from "../manifest.ts";
import type { RedactionOptions } from "../redact.ts";
import { sanitize, send } from "./upload.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Recover a cache entry (path + strip policy) from Claude's standard transcript location, never from credentials. */
export async function resolveSession(id: string, transcriptPath?: string): Promise<{ path: string; strip: RedactionOptions } | undefined> {
  if (!UUID.test(id)) throw new ClientError("usage", "Session id must be a UUID");
  const entry = (await readManifest()).sessions[id];
  if (entry) return { path: entry.path, strip: entry.strip ?? {} };
  const root = join(homedir(), ".claude/projects");
  const paths = transcriptPath ? [transcriptPath] : (await readdir(root, { withFileTypes: true }).catch(() => []))
    .filter((dir) => dir.isDirectory()).map((dir) => join(root, dir.name, `${id}.jsonl`));
  for (const path of paths) {
    const text = await readFile(path, "utf8").catch(() => "");
    // Last marker wins: it carries the strip policy of the latest consented upload.
    const flags = [...text.matchAll(new RegExp(`share-session:opt-in ${id}((?: --strip-[a-z-]+)*)`, "g"))].at(-1)?.[1];
    if (flags !== undefined) return { path, strip: { stripThinking: flags.includes("--strip-thinking"), stripToolResults: flags.includes("--strip-tool-results") } };
  }
}

export async function syncSession(id: string, { path, strip }: { path: string; strip: RedactionOptions }): Promise<unknown> {
  const bytes = await readFile(path);
  // A writer may be in the middle of a line. Publish complete lines only.
  const source = bytes.subarray(0, bytes.lastIndexOf(10) + 1).toString("utf8");
  // Redact before any offset/hash: the server only ever holds sanitized bytes.
  const complete = Buffer.from(sanitize(source, strip).jsonl);
  let remote: { bytes: number; last_line_hash: string | null };
  try {
    remote = await api(`/api/sessions/${id}`) as typeof remote;
  } catch (error) {
    // Soft-retained sessions are invisible to GET; a full owner upload revives them.
    if (error instanceof ClientError && error.code === "not_found") return send(path, source, strip);
    throw error;
  }
  const offset = remote.bytes;
  if (offset > complete.length || (offset > 0 && (complete[offset - 1] !== 10 || lastLineHash(complete.subarray(0, offset)) !== remote.last_line_hash))) {
    return send(path, source, strip);
  }
  if (offset === complete.length) {
    await trackUpload(id, path, Buffer.from(source), strip);
    return { id, bytes: offset, synced: false };
  }
  try {
    const response = await api(`/api/sessions/${id}`, {
      method: "PATCH", headers: { "X-Base-Offset": String(offset), "Content-Type": "application/x-ndjson" },
      body: new Blob([complete.subarray(offset)]),
    });
    await trackUpload(id, path, Buffer.from(source), strip);
    return response;
  } catch (error) {
    if (error instanceof ClientError && error.code === "offset_mismatch") return send(path, source, strip);
    throw error;
  }
}

async function syncOne(id: string): Promise<unknown> {
  const session = await resolveSession(id);
  if (!session) throw new ClientError("not_found", "No opted-in transcript found; upload it first");
  return syncSession(id, session);
}

export async function sync(args: string[]): Promise<unknown> {
  if (args.length === 1 && args[0] === "--all") {
    const results = [];
    for (const id of Object.keys((await readManifest()).sessions)) results.push(await syncOne(id));
    return results;
  }
  if (args.length !== 1 || !UUID.test(args[0]!)) throw new ClientError("usage", "Usage: client.ts sync <id>|--all");
  return syncOne(args[0]!);
}
