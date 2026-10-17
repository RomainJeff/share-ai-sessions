import { execFileSync } from "node:child_process";
import { basename } from "node:path";

/** `owner/repo`, lowercased, from any git remote form (https, ssh://, scp-like, proxy paths). */
export function normalizeRemote(remote: string): string | null {
  const trimmed = remote.trim();
  let path: string;
  try {
    path = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? new URL(trimmed).pathname : trimmed.replace(/^[^/:]*:/, "");
  } catch {
    return null;
  }
  const parts = path.replace(/\/+$/, "").replace(/\.git$/, "").split("/").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join("/").toLowerCase() : null;
}

/** Repo of a working directory: its origin remote, else the directory's basename. Metadata only; the project is chosen by the user. */
export function detectRepo(cwd: string): string {
  try {
    const remote = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const repo = normalizeRemote(remote);
    if (repo) return repo;
  } catch {
    // no git, no repo, no origin, or cwd gone: fall through
  }
  return basename(cwd).toLowerCase();
}
