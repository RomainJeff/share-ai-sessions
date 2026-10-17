import type { Identity } from "../auth";
import { VISIBLE, visibleSince } from "../db";

export async function getSession(_request: Request, env: Env, _who: Identity, { id }: Record<string, string>): Promise<Response> {
  const session = await env.DB.prepare(`SELECT * FROM sessions WHERE id = ? AND ${VISIBLE}`)
    .bind(id, visibleSince()).first();
  return session ? Response.json(session) : Response.json({ error: "not found" }, { status: 404 });
}
