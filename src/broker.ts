import { SignJWT, jwtVerify } from "jose";

export const BROKER_ISSUER = "https://sessions-mcp.example.com";
export const BROKER_AUD = "session-share-cli";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validScope = (scope: unknown): scope is string =>
  typeof scope === "string" && (scope === "read" || (scope.startsWith("write:") && UUID.test(scope.slice(6))));

// Fail closed: never sign with the guessable string "undefined", or a short key.
function signingKey(env: Env): Uint8Array {
  const key = new TextEncoder().encode(env.BROKER_SIGNING_KEY ?? "");
  if (key.length < 32) throw new Error("BROKER_SIGNING_KEY missing or shorter than 32 bytes");
  return key;
}

export async function mintSessionToken(env: Env, email: string, scope: string, sessionId?: string) {
  const key = signingKey(env);
  if (!email.includes("@")) throw new Error("invalid email");
  if (scope !== "read" && scope !== "write") throw new Error("invalid scope");
  if (scope === "read" && sessionId !== undefined) throw new Error("session_id only applies to write scope");
  if (scope === "write") {
    if (!sessionId || !UUID.test(sessionId)) throw new Error("write requires session_id (lowercase UUID)");
    // Retention never releases ownership of an existing id.
    const existing = await env.DB.prepare("SELECT owner_email FROM sessions WHERE id = ?")
      .bind(sessionId).first<{ owner_email: string }>();
    if (existing && existing.owner_email !== email) throw new Error("forbidden: session belongs to another email");
  }
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  const token = await new SignJWT({ scope: scope === "read" ? "read" : `write:${sessionId}` })
    .setProtectedHeader({ alg: "HS256" }).setSubject(email).setIssuer(BROKER_ISSUER)
    .setAudience(BROKER_AUD).setIssuedAt().setExpirationTime(expiresAt).sign(key);
  return {
    token, expires_at: new Date(expiresAt * 1000).toISOString(), base_url: BROKER_ISSUER,
    command: `SESSION_TOKEN=${token} node <share-session skill dir>/scripts/client.ts ${scope === "read" ? "list" : "upload <path.jsonl>"}`,
  };
}

export async function verifyBroker(token: string, env: Env): Promise<{ email: string; scope: string } | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(env), {
      algorithms: ["HS256"], issuer: BROKER_ISSUER, audience: BROKER_AUD, requiredClaims: ["exp", "iat", "sub"],
      maxTokenAge: "10m",
    });
    if (typeof payload.sub !== "string" || !payload.sub.includes("@") || !validScope(payload["scope"])) return null;
    return { email: payload.sub, scope: payload["scope"] };
  } catch {
    return null;
  }
}

/** Applied before route dispatch so later routes inherit the same broker restrictions. */
export async function brokerInScope(request: Request, scope: string): Promise<boolean> {
  const path = new URL(request.url).pathname;
  if (scope === "read") return request.method === "GET" && /^\/api\/sessions(?:\/[^/]+(?:\/bundle)?)?$/.test(path);
  const id = scope.slice(6);
  if (request.method === "PATCH") return path === `/api/sessions/${id}`;
  if (request.method !== "POST" || path !== "/api/sessions") return false;
  try {
    const form = await request.clone().formData();
    const meta = JSON.parse(String(form.get("meta")));
    return typeof meta?.id === "string" && meta.id.toLowerCase() === id;
  } catch {
    return false;
  }
}
