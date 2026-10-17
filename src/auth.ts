import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import { verifyBroker } from "./broker";

export type Identity = { email: string; name: string; brokerScope?: string };

let remoteKeys: JWTVerifyGetKey | undefined;

// ponytail: mutable holder so tests verify against a local key pair instead of the network.
// createRemoteJWKSet already caches and refreshes the Access signing keys.
export const keySource = {
  resolve(teamDomain: string): JWTVerifyGetKey {
    return (remoteKeys ??= createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`)));
  },
};

/**
 * Person behind a valid Access JWT (`Cf-Access-Jwt-Assertion`, or `Authorization: Bearer`), or null
 * when absent, signed by someone else, meant for another app, expired, or without `email`.
 * Service tokens (`common_name` only) are refused on purpose: they identify a machine, not a person.
 */
export async function identify(request: Request, env: Env): Promise<Identity | null> {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const broker = await verifyBroker(bearer, env);
    if (broker) return { email: broker.email, name: broker.email.split("@")[0]!, brokerScope: broker.scope };
  }
  // The bypass host accepts only broker tokens for data, never an edge Access header.
  if (new URL(request.url).hostname === "sessions-mcp.example.com") return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? bearer;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keySource.resolve(env.ACCESS_TEAM_DOMAIN), {
      audience: env.ACCESS_AUD, // exp checked by default
    });
    const email = payload["email"];
    if (typeof email !== "string" || !email.includes("@")) return null;
    const name = payload["name"];
    return { email, name: typeof name === "string" && name ? name : email.split("@")[0]! };
  } catch {
    return null;
  }
}
