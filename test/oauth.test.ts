import { SELF, env } from "cloudflare:test";
import { SignJWT, decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BROKER_AUD } from "../src/broker";
import { ALICE as EMAIL, BOB, mintJwt } from "./jwt";
const MCP = "sessions-mcp.example.com";
const ISS = `https://${MCP}`;
const call = (host: string, path: string, init: RequestInit = {}, token?: string) =>
  SELF.fetch(`https://${host}${path}`, {
    redirect: "manual", ...init,
    headers: { ...init.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
function form(id: string) {
  const body = new FormData();
  body.set("meta", JSON.stringify({ id, project: "a/b" }));
  body.set("jsonl", new File(['{"type":"user"}\n'], "s.jsonl"));
  return body;
}

describe("OAuth + get_token", () => {
  const REDIRECT = "https://client.example/cb";
  const OIDC = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const OIDC_PATH = `/cdn-cgi/access/sso/oidc/${env.OIDC_CLIENT_ID}`;

  afterEach(() => vi.restoreAllMocks());

  const cookies = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

  const idToken = (claims: Record<string, unknown>) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(`${OIDC}${OIDC_PATH}`)
      .setAudience(env.OIDC_CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("upstream-key-irrelevant-not-verified"));

  /** Register a client and run consent; returns the Access redirect, with cookies to replay. */
  async function startLogin() {
    const reg = await call(MCP, "/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "test", redirect_uris: [REDIRECT] }),
    });
    expect(reg.status).toBe(201);
    const { client_id, client_secret } = (await reg.json()) as {
      client_id: string;
      client_secret: string;
    };

    const params = new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri: REDIRECT,
      scope: "sessions:token",
      state: "client-state",
    });
    const consent = await call(MCP, `/authorize?${params}`);
    expect(consent.status).toBe(200);
    const html = await consent.text();
    expect(html).toContain("mint Session Share tokens");
    const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1];
    expect(handle).toBeTruthy();
    let cookie = cookies(consent);

    const approve = await call(MCP, "/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams({ handle: handle!, decision: "approve" }),
    });
    expect(approve.status).toBe(302);
    const upstream = new URL(approve.headers.get("location")!);
    expect(upstream.origin + upstream.pathname).toBe(`${OIDC}${OIDC_PATH}/authorization`);
    expect(upstream.searchParams.get("redirect_uri")).toBe(`${ISS}/callback`);
    expect(upstream.searchParams.get("code_challenge_method")).toBe("S256");
    cookie = [cookie, cookies(approve)].filter(Boolean).join("; ");
    return { client_id, client_secret, state: upstream.searchParams.get("state")!, cookie };
  }

  it("refuses an OAuth user Access did not let through", async () => {
    const { state, cookie } = await startLogin();
    const res = await call(MCP, `/callback?state=${state}&error=access_denied`, {
      headers: { cookie },
    });
    expect(res.status).toBe(302);
    const back = new URL(res.headers.get("location")!);
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.get("state")).toBe("client-state");
    expect(back.searchParams.get("code")).toBeNull();
  });

  it("mints for the OAuth email, refuses invalid scopes and foreign ownership", async () => {
    const { client_id, client_secret, state, cookie } = await startLogin();

    const id_token = await idToken({ email: EMAIL, sub: "u1" });
    const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe(`${OIDC}${OIDC_PATH}/token`);
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("code")).toBe("upstream-code");
      expect(form.get("client_secret")).toBe(env.OIDC_CLIENT_SECRET);
      expect(form.get("code_verifier")).toBeTruthy();
      return Response.json({ id_token });
    });

    const cb = await call(MCP, `/callback?state=${state}&code=upstream-code`, {
      headers: { cookie },
    });
    expect(cb.status).toBe(302);
    const back = new URL(cb.headers.get("location")!);
    const code = back.searchParams.get("code")!;
    expect(code).toBeTruthy();
    expect(upstream).toHaveBeenCalledOnce();

    const tok = await call(MCP, "/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id,
        client_secret,
        redirect_uri: REDIRECT,
      }),
    });
    expect(tok.status).toBe(200);
    const { access_token } = (await tok.json()) as { access_token: string };

    const rpc = async (scope: string, session_id?: string) => {
      const res = await call(
        MCP,
        "/mcp",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_token", arguments: { scope, session_id } },
          }),
        },
        access_token,
      );
      expect(res.status).toBe(200);
      // Streamable HTTP answers as SSE; the one message is the JSON-RPC response.
      const data = (await res.text()).match(/^data: (.*)$/m)?.[1];
      return (JSON.parse(data!) as { result: Record<string, unknown> }).result;
    };

    const id = crypto.randomUUID();
    const ok = await rpc("write", id);
    expect(ok["isError"]).toBeFalsy();
    const minted = ok["structuredContent"] as { token: string; base_url: string; expires_at: string; command: string };
    expect(minted.base_url).toBe(ISS);
    expect(minted.command).toContain("SESSION_TOKEN=");
    expect(minted.command).toContain("upload <path.jsonl>");
    expect(Date.parse(minted.expires_at) - Date.now()).toBeGreaterThan(590_000);
    expect(decodeJwt(minted.token)).toMatchObject({ sub: EMAIL, scope: `write:${id}`, aud: BROKER_AUD, iss: ISS });
    expect((await call(MCP, "/api/sessions", { method: "POST", body: form(id) }, minted.token)).status).toBe(201);
    expect((await rpc("write", "not-a-uuid"))["isError"]).toBe(true);
    expect((await rpc("write"))["isError"]).toBe(true);
    expect((await rpc("delete", id))["isError"]).toBe(true);

    // Email from the OAuth grant cannot request a token for someone else's session,
    // including an expired session (retention never releases ownership).
    const foreign = crypto.randomUUID();
    expect((await SELF.fetch("https://sessions.example.com/api/sessions", {
      method: "POST", body: form(foreign), headers: { "Cf-Access-Jwt-Assertion": await mintJwt({ email: BOB }) },
    })).status).toBe(201);
    await env.DB.prepare("UPDATE sessions SET last_synced_at = 0 WHERE id = ?").bind(foreign).run();
    expect((await rpc("write", foreign))["isError"]).toBe(true);
    expect((await rpc("write", id))["isError"]).toBeFalsy();
    const read = (await rpc("read"))["structuredContent"] as { token: string };
    expect((await call(MCP, "/api/sessions", {}, read.token)).status).toBe(200);
  });

  it("401s /mcp without an OAuth token", async () => {
    const res = await call(MCP, "/mcp", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});

