import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { api, ClientError } from "../lib.ts";

/** True when a user or project settings file wires `client.ts hook-stop` on Stop. Malformed files count as absent. */
export function stopHookInstalled(cwd = process.cwd()): boolean {
  const files = [join(homedir(), ".claude", "settings.json"), join(cwd, ".claude", "settings.json"), join(cwd, ".claude", "settings.local.json")];
  return files.some((file) => {
    try {
      const stop = JSON.parse(readFileSync(file, "utf8"))?.hooks?.Stop;
      return Array.isArray(stop) && stop.some((group) => group?.hooks?.some?.((h: { command?: unknown }) => typeof h?.command === "string" && h.command.includes("hook-stop")));
    } catch {
      return false;
    }
  });
}

export async function doctor(): Promise<unknown> {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 24) throw new ClientError("node_unsupported", "Node 24+ required (runs .ts natively)");

  await api("/api/sessions?mine=1"); // config + cloudflared + Access + Worker, end to end
  let claudeVersion: string | null = null;
  try {
    claudeVersion = execFileSync("claude", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // reported as null
  }
  let codexVersion: string | null = null;
  try { codexVersion = execFileSync("codex", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  const codexDir = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
  const projectsDir = join(homedir(), ".claude", "projects");
  return { configured: true, authenticated: true, claude_version: claudeVersion, codex_version: codexVersion, codex_sessions_dir: existsSync(codexDir) ? codexDir : null, projects_dir: existsSync(projectsDir) ? projectsDir : null, stop_hook: stopHookInstalled() };
}
