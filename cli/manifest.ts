import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadBaseUrl } from "./lib.ts";

export type Entry = { id: string; path: string; offset: number; last_line_hash: string; url: string };
type Manifest = { sessions: Record<string, Entry> };
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
export async function trackUpload(id: string, path: string, bytes: Uint8Array): Promise<void> {
  const manifest = await readManifest();
  manifest.sessions[id] = { id, path: resolve(path), offset: bytes.length, last_line_hash: lastLineHash(bytes), url: `${await loadBaseUrl()}/s/${id}` };
  await writeManifest(manifest);
}
