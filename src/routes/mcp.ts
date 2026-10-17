// OAuth consent + Access OIDC + short-lived CLI JWTs.
import {
  AuthorizationError, OAuthProvider, authorizationErrorRedirect, type ConsentDescription,
} from "@cloudflare/workers-oauth-provider";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { decodeJwt } from "jose";
import { z } from "zod";
import { BROKER_ISSUER, mintSessionToken } from "../broker";

const OAUTH_SCOPE = "sessions:token";
const issuerOf = (_env: Env) => BROKER_ISSUER;
const fail = (error: string, status: number) => Response.json({ error }, { status });
type Props = { email: string };

/** One tool, closed over the identity stored by the OAuth grant. */
function brokerServer(env: Env, email: string): McpServer {
  const server = new McpServer({ name: "claude-session-share", version: "1.0.0" });
  server.registerTool("get_token", {
    title: "Get a Session Share token",
    description: "Mint a 10-minute CLI token: read sessions and projects, write one session owned by you, or manage projects (create, add or remove members). Run the returned command; keep the token in memory only.",
    inputSchema: z.object({ scope: z.enum(["read", "write", "projects"]), session_id: z.string().optional() }),
  }, async ({ scope, session_id }) => {
    try {
      const result = await mintSessionToken(env, email, scope, session_id);
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const text = error instanceof Error ? error.message : "token refused";
      return { content: [{ type: "text", text }], isError: true };
    }
  });
  return server;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function consentPage(details: ConsentDescription, handle: string): string {
  const name = escape(details.clientName);
  const origin = details.clientDomain
    ? `Published by <strong>${escape(details.clientDomain)}</strong>.`
    : "This app registered itself; its name is not verified.";
  return `<!doctype html>
<meta charset="utf-8">
<title>Authorize ${name}</title>
<h1>Allow ${name} to mint Session Share tokens as you?</h1>
<p>${origin} Access will be sent to <strong>${escape(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? "<p><strong>This sends access to an app on your computer.</strong> Continue only if you just started signing in from it.</p>" : ""}
<p>Scope: ${details.scope.map(escape).join(", ") || OAUTH_SCOPE}</p>
<form method="post">
  <input type="hidden" name="handle" value="${escape(handle)}">
  <p><button name="decision" value="approve">Allow</button> <button name="decision" value="deny">Deny</button></p>
</form>`;
}

const oidcIssuer = (env: Env) =>
  `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/sso/oidc/${env.OIDC_CLIENT_ID}`;

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** `/authorize` (consent, then hand-off to Access) and `/callback` (code exchange, grant). */
async function authFlow(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  const url = new URL(request.url);
  const callback = `${issuerOf(env)}/callback`;
  try {
    if (url.pathname === "/authorize" && request.method === "GET") {
      const authRequest = await oauth.parseAuthRequest(request);
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      consent.headers.set("Content-Type", "text/html; charset=utf-8");
      return new Response(consentPage(details, consent.handle), { headers: consent.headers });
    }
    if (url.pathname === "/authorize" && request.method === "POST") {
      const form = await request.formData();
      const handle = String(form.get("handle"));
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(request, handle);
      const verifier = crypto.randomUUID() + crypto.randomUUID();
      const { state, headers } = await oauth.beginUpstream(approved.request, {
        data: { verifier },
        headers: approved.headers,
      });
      const upstream = new URL(`${oidcIssuer(env)}/authorization`);
      upstream.search = new URLSearchParams({
        client_id: env.OIDC_CLIENT_ID,
        redirect_uri: callback,
        response_type: "code",
        scope: "openid email",
        state,
        code_challenge: await s256(verifier),
        code_challenge_method: "S256",
      }).toString();
      headers.set("Location", upstream.href);
      return new Response(null, { status: 302, headers });
    }
    if (url.pathname === "/callback" && request.method === "GET") {
      const { request: original, data, headers } = await oauth.finishUpstream<{ verifier: string }>(request);
      const code = url.searchParams.get("code");
      if (url.searchParams.get("error") || !code) {
        headers.set("Location", authorizationErrorRedirect(original, "access_denied"));
        return new Response(null, { status: 302, headers });
      }
      const email = await exchangeCode(env, code, data.verifier, callback);
      if (!email) return fail("upstream login failed", 502);
      const { redirectTo } = await oauth.completeAuthorization({
        request: original,
        userId: email,
        metadata: {},
        scope: original.scope,
        props: { email } satisfies Props,
      });
      headers.set("Location", redirectTo);
      return new Response(null, { status: 302, headers });
    }
  } catch (error) {
    // Validation failures without a redirect URI are rendered locally, never bounced to a client.
    if (error instanceof AuthorizationError) return fail(error.description, 400);
    throw error;
  }
  return fail("not found", 404);
}

/** Exchange the Access code for an id_token and return its email, or null. */
async function exchangeCode(
  env: Env,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<string | null> {
  const response = await fetch(`${oidcIssuer(env)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.OIDC_CLIENT_ID,
      client_secret: env.OIDC_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) return null;
  const { id_token } = (await response.json()) as { id_token?: string };
  if (!id_token) return null;
  // ponytail: the id_token came straight from the token endpoint over TLS, in exchange for the
  // client secret, so its signature adds nothing (OIDC Core 3.1.3.7 §6). Checked: iss, aud, exp.
  // Switch to jwtVerify + createRemoteJWKSet(`${issuer}/jwks`) if it ever arrives another way.
  try {
    const claims = decodeJwt(id_token);
    const fresh = typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== oidcIssuer(env) || !audience.includes(env.OIDC_CLIENT_ID) || !fresh) return null;
    return typeof claims["email"] === "string" && claims["email"].includes("@") ? claims["email"] : null;
  } catch {
    return null;
  }
}

// One provider per isolate; the upstream Access app identifies the user.
let provider: OAuthProvider<Env> | undefined;

function getProvider(env: Env): OAuthProvider<Env> {
  provider ??= new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: {
      fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const { email } = ctx.props as Props; // what completeAuthorization stored, decrypted
        return createMcpHandler(() => brokerServer(env, email)).fetch(request);
      },
    },
    defaultHandler: { fetch: (request: Request, env: Env) => authFlow(request, env) },
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    scopesSupported: [OAUTH_SCOPE],
    resourceMetadata: {
      resource: `${issuerOf(env)}/mcp`,
      authorization_servers: [issuerOf(env)],
      scopes_supported: [OAUTH_SCOPE],
    },
  });
  return provider;
}

export async function handleMcpHost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  return getProvider(env).fetch(request, env, ctx);
}
