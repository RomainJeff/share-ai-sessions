import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { api, ClientError } from "../lib.ts";

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
  const projectsDir = join(homedir(), ".claude", "projects");
  return { configured: true, authenticated: true, claude_version: claudeVersion, projects_dir: existsSync(projectsDir) ? projectsDir : null };
}
