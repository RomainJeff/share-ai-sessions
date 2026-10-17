import { env } from "cloudflare:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { keySource } from "../src/auth";

const ALG = "RS256";
const access = await generateKeyPair(ALG, { extractable: true });
const impostor = await generateKeyPair(ALG, { extractable: true });

// Importing this module points verification at the local key pair: nothing reaches Access.
const localKeys = createLocalJWKSet({ keys: [{ ...(await exportJWK(access.publicKey)), alg: ALG }] });
keySource.resolve = () => localKeys;

export const ALICE = "alice@example.com";
export const BOB = "bob@example.com";

export function mintJwt(
  payload: JWTPayload = { email: ALICE },
  opts: { aud?: string; exp?: string; impostor?: boolean } = {},
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setAudience(opts.aud ?? env.ACCESS_AUD)
    .setExpirationTime(opts.exp ?? "5m")
    .sign(opts.impostor ? impostor.privateKey : access.privateKey);
}
