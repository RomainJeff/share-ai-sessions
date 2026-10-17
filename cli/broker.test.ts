import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { api } from "../skill/scripts/lib.ts";

const key = new TextEncoder().encode("test-only-broker-key-at-least-32-bytes");
const token = (iss = "https://sessions-mcp.example.com", exp = "10m") => new SignJWT({ scope: "read" })
  .setProtectedHeader({ alg: "HS256" }).setSubject("alice@example.com").setIssuer(iss)
  .setAudience("session-share-cli").setIssuedAt().setExpirationTime(exp).sign(key);

test("SESSION_TOKEN reaches the broker API without config or cloudflared and is not returned", async (t) => {
  const jwt = await token();
  const original = process.env.SESSION_TOKEN;
  process.env.SESSION_TOKEN = jwt;
  t.after(() => {
    if (original === undefined) delete process.env.SESSION_TOKEN;
    else process.env.SESSION_TOKEN = original;
  });
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, "https://sessions-mcp.example.com/api/sessions");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${jwt}`);
    assert.equal(new Headers(init?.headers).get("cf-access-token"), null);
    assert.equal(init?.redirect, "manual");
    return Response.json({ sessions: [] });
  });
  assert.deepEqual(await api("/api/sessions"), { sessions: [] });
});

test("refuses expired or foreign-issuer tokens before any request, without disclosing them", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { assert.fail("must not send an invalid token"); });
  for (const [jwt, code] of [[await token(undefined, "-1m"), "token_expired"], [await token("https://evil.example"), "invalid_token"], ["garbage", "invalid_token"]]) {
    const original = process.env.SESSION_TOKEN;
    process.env.SESSION_TOKEN = jwt;
    try {
      await assert.rejects(api("/api/sessions"), (error: any) => {
        assert.equal(error.code, code);
        assert.ok(!error.message.includes(jwt!));
        return true;
      });
    } finally {
      if (original === undefined) delete process.env.SESSION_TOKEN;
      else process.env.SESSION_TOKEN = original;
    }
  }
});
