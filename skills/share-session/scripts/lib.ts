import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Server URLs (no secret): the user's override, else the config.json baked in by build-skill.sh.
export const CONFIG_PATH = process.env.SESSION_SHARE_CONFIG ?? join(homedir(), ".claude/session-share/config.json");
export const BUNDLED_CONFIG_PATH = fileURLToPath(new URL("../config.json", import.meta.url));

export class ClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const httpsOrigin = (value: unknown): string => {
  const url = new URL(String(value));
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error();
  return url.origin;
};

export async function loadConfig(): Promise<{ baseUrl: string; brokerUrl?: string }> {
  for (const path of [CONFIG_PATH, BUNDLED_CONFIG_PATH]) {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new ClientError("invalid_config", `Cannot read ${path}`);
    }
    try {
      const { baseUrl, brokerUrl } = JSON.parse(raw);
      return { baseUrl: httpsOrigin(baseUrl), ...(brokerUrl === undefined ? {} : { brokerUrl: httpsOrigin(brokerUrl) }) };
    } catch {
      throw new ClientError("invalid_config", `${path}: baseUrl and brokerUrl must be https origins`);
    }
  }
  throw new ClientError("invalid_config", `No server configured: create ${CONFIG_PATH} from config.example.json`);
}

export const loadBaseUrl = async (): Promise<string> => (await loadConfig()).baseUrl;

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
  // Broker mode needs neither local config nor a cloudflared installation.
  const brokerToken = process.env.SESSION_TOKEN;
  let baseUrl: string;
  let token: string;
  if (brokerToken !== undefined) {
    try {
      // Routing/expiry check only; the Worker verifies the signature. Pin the origin so an
      // untrusted issuer claim cannot redirect a credential to another host.
      const { brokerUrl } = await loadConfig();
      const claims = JSON.parse(Buffer.from(brokerToken.split(".")[1] ?? "", "base64url").toString("utf8"));
      if (!brokerUrl || claims.iss !== brokerUrl || claims.aud !== "session-share-cli" || typeof claims.exp !== "number") {
        throw new Error();
      }
      if (claims.exp * 1000 <= Date.now()) throw new ClientError("token_expired", "Call get_token for a fresh broker token");
      baseUrl = claims.iss;
      token = brokerToken;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      throw new ClientError("invalid_token", "SESSION_TOKEN is not a Session Share broker token");
    }
  } else {
    baseUrl = await loadBaseUrl();
    token = accessToken(baseUrl);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    redirect: "manual", // an Access login redirect means the token was refused
    headers: { ...init.headers, ...(!brokerToken ? { "cf-access-token": token } : {}), Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || (response.status >= 300 && response.status < 400)) {
    throw new ClientError("unauthorized", `Access refused (${response.status})`);
  }
  if (response.ok) return response.json();
  // The Worker answers `{ error }`; the Access edge answers HTML. The text is the server's, never a secret.
  const reason = await response.json().then((b: { error?: unknown }) => typeof b?.error === "string" ? b.error : null, () => null);
  const projects = path.startsWith("/api/projects");
  if (response.status === 403) throw new ClientError("forbidden", reason ?? `Access refused (${response.status})`);
  if (response.status === 409) {
    if (projects || path.endsWith("/project")) throw new ClientError("conflict", reason ?? "Conflict");
    throw new ClientError("offset_mismatch", "Server offset changed; full upload required");
  }
  if (response.status === 404) throw new ClientError("not_found", reason ?? (projects ? "Project not found" : "Session not found"));
  if (response.status === 400) throw new ClientError("bad_request", reason ?? "Bad request");
  throw new ClientError("http_error", `Server answered ${response.status}`);
}
