// Crypto contracts run without a local server; Miniflare covers HTTP/OAuth separately.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, decodeJwt } from "jose";
import { mintSessionToken, verifyBroker, brokerInScope, BROKER_AUD } from "../src/broker.ts";
const env = { BROKER_SIGNING_KEY: "test-only-broker-key-at-least-32-bytes", BROKER_ORIGIN: "https://sessions-mcp.example.com" };
const BROKER_ISSUER = env.BROKER_ORIGIN;
const email = "alice@example.com";

test("minted read token has the OAuth email, pinned issuer/audience and 600-second lifetime", async () => {
  const minted = await mintSessionToken(env, email, "read");
  const claims = decodeJwt(minted.token);
  assert.equal(claims.sub, email);
  assert.equal(claims.iss, BROKER_ISSUER);
  assert.equal(claims.aud, BROKER_AUD);
  assert.equal(claims.exp - claims.iat, 600);
  assert.equal(Date.parse(minted.expires_at), claims.exp * 1000);
  assert.deepEqual(await verifyBroker(minted.token, env), { email, scope: "read" });
});

test("missing or short signing key fails closed for mint and verification", async () => {
  const { token } = await mintSessionToken(env, email, "read");
  for (const key of [undefined, "", "short", "x".repeat(31)]) {
    const broken = { BROKER_SIGNING_KEY: key };
    await assert.rejects(mintSessionToken(broken, email, "read"), /BROKER_SIGNING_KEY/);
    assert.equal(await verifyBroker(token, broken), null);
  }
});

test("verification refuses invalid signature, issuer, audience, expiry, subject and scope", async () => {
  const valid = { sub: email, iss: BROKER_ISSUER, aud: BROKER_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, scope: "read" };
  for (const change of [{ iss: "https://evil.example" }, { aud: "other-cli" }, { exp: 1 }, { exp: undefined }, { sub: "machine" }, { scope: "delete" }, { scope: "write:bad-id" }]) {
    const token = await new SignJWT({ ...valid, ...change }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(env.BROKER_SIGNING_KEY));
    assert.equal(await verifyBroker(token, env), null);
  }
  const { token } = await mintSessionToken(env, email, "read");
  assert.equal(await verifyBroker(token, { BROKER_SIGNING_KEY: "another-key-that-is-at-least-32-bytes" }), null);
});

test("scope gate preserves the upload body and allows only the target session", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const form = new FormData();
  form.set("meta", JSON.stringify({ id }));
  const request = new Request(`${BROKER_ISSUER}/api/sessions`, { method: "POST", body: form });
  assert.equal(await brokerInScope(request, `write:${id}`), true);
  assert.equal((await request.formData()).get("meta"), JSON.stringify({ id }));
  assert.equal(await brokerInScope(new Request(`${BROKER_ISSUER}/api/sessions/${id}`, { method: "PATCH" }), `write:${id}`), true);
  assert.equal(await brokerInScope(new Request(`${BROKER_ISSUER}/api/sessions/other`, { method: "PATCH" }), `write:${id}`), false);
  assert.equal(await brokerInScope(new Request(`${BROKER_ISSUER}/api/sessions/${id}`, { method: "DELETE" }), `write:${id}`), false);
});
