import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { api, ClientError } from "../lib.ts";
import { lastLineHash, readManifest, trackUpload } from "../manifest.ts";
import { upload } from "./upload.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Recover a cache entry from Claude's standard transcript location, never from credentials. */
async function locate(id: string): Promise<string> {
  if (!UUID.test(id)) throw new ClientError("usage", "Session id must be a UUID");
  const root = join(homedir(), ".claude/projects");
  for (const dir of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!dir.isDirectory()) continue;
    const path = join(root, dir.name, `${id}.jsonl`);
    const text = await readFile(path, "utf8").catch(() => "");
    if (text.includes(`share-session:opt-in ${id}`)) return path;
  }
  throw new ClientError("not_found", "No opted-in transcript found; upload it first");
}

async function syncOne(id: string): Promise<unknown> {
  const entry = (await readManifest()).sessions[id];
  const path = entry?.path ?? await locate(id);
  const bytes = await readFile(path);
  // A writer may be in the middle of a line. Publish complete lines only.
  const complete = bytes.subarray(0, bytes.lastIndexOf(10) + 1);
  let remote: { bytes: number; last_line_hash: string | null };
  try {
    remote = await api(`/api/sessions/${id}`) as typeof remote;
  } catch (error) {
    // Soft-retained sessions are invisible to GET; a full owner upload revives them.
    if (error instanceof ClientError && error.code === "not_found") return upload(path, complete.toString("utf8"));
    throw error;
  }
  const offset = remote.bytes;
  if (offset > complete.length || (offset > 0 && (complete[offset - 1] !== 10 || lastLineHash(complete.subarray(0, offset)) !== remote.last_line_hash))) {
    return upload(path, complete.toString("utf8"));
  }
  if (offset === complete.length) {
    await trackUpload(id, path, complete);
    return { id, bytes: offset, synced: false };
  }
  try {
    const response = await api(`/api/sessions/${id}`, {
      method: "PATCH", headers: { "X-Base-Offset": String(offset), "Content-Type": "application/x-ndjson" },
      body: new Blob([complete.subarray(offset)]),
    });
    await trackUpload(id, path, complete);
    return response;
  } catch (error) {
    if (error instanceof ClientError && error.code === "offset_mismatch") return upload(path, complete.toString("utf8"));
    throw error;
  }
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
