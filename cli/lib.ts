import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Runtime config (URL only, no secret), versioned. Template: .agents/skills/share-session/config.example.json
export const CONFIG_PATH = fileURLToPath(
  new URL("../../../.agents/skills-config/share-session/config.json", import.meta.url),
);

export class ClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function loadBaseUrl(): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf8");
  } catch {
    throw new ClientError("config_required", `Create ${CONFIG_PATH} from the skill's config.example.json`);
  }
  try {
    const url = new URL(JSON.parse(raw).baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error();
    return url.origin;
  } catch {
    throw new ClientError("invalid_config", "baseUrl must be an https origin");
  }
}

/**
 * Access user JWT from cloudflared's own cache (~/.cloudflared). Never written, logged or printed
 * by this client.
 */
export function accessToken(baseUrl: string): string {
  try {
    const token = execFileSync("cloudflared", ["access", "token", `-app=${baseUrl}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (token.split(".").length === 3) return token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ClientError("cloudflared_missing", "Install cloudflared (brew install cloudflared)");
    }
  }
  throw new ClientError("login_required", `Run: cloudflared access login ${baseUrl}`);
}

/** Authenticated call to the API. `cf-access-token` passes the Access edge; the Worker reads either header. */
export async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const baseUrl = await loadBaseUrl();
  const token = accessToken(baseUrl);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: "manual", // an Access login redirect means the token was refused
    headers: { ...init.headers, "cf-access-token": token, Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
    throw new ClientError(response.status === 403 ? "forbidden" : "unauthorized", `Access refused (${response.status})`);
  }
  if (response.status === 409) throw new ClientError("offset_mismatch", "Server offset changed; full upload required");
  if (response.status === 404) throw new ClientError("not_found", "Session not found");
  if (!response.ok) throw new ClientError("http_error", `Server answered ${response.status}`);
  return response.json();
}
