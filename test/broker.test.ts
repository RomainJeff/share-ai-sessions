import { env, SELF } from "cloudflare:test";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { ALICE, BOB, mintJwt } from "./jwt";

const ISS = "https://sessions-mcp.example.com";
const KEY = "test-only-broker-key-at-least-32-bytes";
const id = crypto.randomUUID();
const other = crypto.randomUUID();
const forge = (scope = "read", overrides: { exp?: number; aud?: string; iss?: string; key?: string } = {}) =>
  new SignJWT({ scope }).setProtectedHeader({ alg: "HS256" }).setSubject(ALICE)
    .setIssuer(overrides.iss ?? ISS).setAudience(overrides.aud ?? "session-share-cli").setIssuedAt()
    .setExpirationTime(overrides.exp ?? Math.floor(Date.now() / 1000) + 600)
    .sign(new TextEncoder().encode(overrides.key ?? KEY));
const call = (path: string, token?: string, init: RequestInit = {}, host = ISS) =>
  SELF.fetch(`${host}${path}`, { ...init, headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
function form(sessionId: string) {
  const body = new FormData();
  body.set("meta", JSON.stringify({ id: sessionId, project: "team", owner_email: BOB }));
  body.set("jsonl", new File(['{"type":"user"}\n'], "s.jsonl"));
  return body;
}

describe("broker API authorization", () => {
  it("accepts read tokens on both API hosts", async () => {
    for (const host of [ISS, "https://sessions.example.com"]) {
      expect((await call("/api/sessions", await forge(), {}, host)).status).toBe(200);
    }
  });
  it("uploads only the scoped id using the verified subject", async () => {
    const token = await forge(`write:${id}`);
    const res = await call("/api/sessions", token, { method: "POST", body: form(id) });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id, owner_email: ALICE });
    expect((await call("/api/sessions", token, { method: "POST", body: form(other) })).status).toBe(403);
  });
  it("denies writes with read scope, reads with write scope, and DELETE with either", async () => {
    expect((await call("/api/sessions", await forge(), { method: "POST", body: form(other) })).status).toBe(403);
    expect((await call("/api/sessions", await forge(`write:${id}`))).status).toBe(403);
    for (const scope of ["read", `write:${id}`]) {
      expect((await call(`/api/sessions/${id}`, await forge(scope), { method: "DELETE" })).status).toBe(403);
      expect((await call(`/api/sessions/${other}`, await forge(scope), { method: "PATCH" })).status).toBe(403);
    }
  });
  it.each([
    ["expired", { exp: Math.floor(Date.now() / 1000) - 1 }],
    ["signature", { key: "another-key-that-is-at-least-32-bytes" }],
    ["audience", { aud: "other-cli" }],
    ["issuer", { iss: "https://other.example" }],
  ])("401s an invalid %s", async (_, overrides) => {
    expect((await call("/api/sessions", await forge("read", overrides))).status).toBe(401);
  });
  it("does not accept Access identity on the bypass host", async () => {
    const res = await SELF.fetch(`${ISS}/api/sessions`, { headers: { "Cf-Access-Jwt-Assertion": await mintJwt() } });
    expect(res.status).toBe(401);
  });
});
