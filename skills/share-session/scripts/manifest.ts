import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadBaseUrl } from "./lib.ts";
import type { RedactionOptions } from "./redact.ts";

// offset/last_line_hash describe the local source; the server holds sanitized bytes, compared by sync.
export type Entry = { id: string; path: string; offset: number; last_line_hash: string; url: string; strip?: RedactionOptions; project?: string };
type Manifest = {
  sessions: Record<string, Entry>;
  forks?: Record<string, { forked_from: string }>;
  /** Compaction continuations already proposed for sharing; presence means "asked once", not consent. */
  continuations?: Record<string, { continued_from: string }>;
  stopped?: Record<string, string>;
};
const manifestPath = () => join(homedir(), ".claude/session-share/manifest.json");

export async function readManifest(): Promise<Manifest> {
  try { return JSON.parse(await readFile(manifestPath(), "utf8")) as Manifest; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { sessions: {} };
    throw error;
  }
}
export async function writeManifest(manifest: Manifest): Promise<void> {
  const path = manifestPath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
}
export function lastLineHash(bytes: Uint8Array): string {
  const end = bytes.length;
  let start = end > 0 && bytes[end - 1] === 10 ? end - 2 : end - 1;
  while (start >= 0 && bytes[start] !== 10) start--;
  return createHash("sha256").update(bytes.slice(start + 1)).digest("hex");
}
export async function trackUpload(id: string, path: string, bytes: Uint8Array, { stripThinking, stripToolResults }: RedactionOptions = {}, project?: string): Promise<void> {
  // Keep only the policy: callers may pass upload options (e.g. the confirm hash).
  const strip = { stripThinking, stripToolResults };
  const manifest = await readManifest();
  delete manifest.stopped?.[id];
  project ??= manifest.sessions[id]?.project;
  manifest.sessions[id] = { id, path: resolve(path), offset: bytes.length, last_line_hash: lastLineHash(bytes), url: `${await loadBaseUrl()}/s/${id}`, strip, ...(project ? { project } : {}) };
  await writeManifest(manifest);
}
