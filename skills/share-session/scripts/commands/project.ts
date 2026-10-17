import { parseArgs } from "node:util";
import { api, ClientError } from "../lib.ts";

const USAGE = "Usage: client.ts project list | create <slug> [--name <name>] | show <slug> | add <slug> <email> [--role reader|writer|owner] | remove <slug> <email>";
const ROLES = ["reader", "writer", "owner"];
const json = (method: string, value: unknown): RequestInit =>
  ({ method, body: JSON.stringify(value), headers: { "Content-Type": "application/json" } });
const member = (slug: string, email: string) => `/api/projects/${encodeURIComponent(slug)}/members/${encodeURIComponent(email)}`;

/** Projects group sessions and carry rights. Membership is checked by the Worker; Access still has to let the person in. */
export async function project(args: string[]): Promise<unknown> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: { name: { type: "string" }, role: { type: "string" } } });
  } catch {
    throw new ClientError("usage", USAGE);
  }
  const [action, slug, email] = parsed.positionals;
  const arity: Record<string, number> = { list: 1, create: 2, show: 2, add: 3, remove: 3 };
  if (!action || arity[action] !== parsed.positionals.length) throw new ClientError("usage", USAGE);
  if (action === "list") return api("/api/projects");
  if (action === "create") return api("/api/projects", json("POST", { slug, name: parsed.values.name }));
  if (action === "show") return api(`/api/projects/${encodeURIComponent(slug!)}`);
  if (action === "remove") return api(member(slug!, email!), { method: "DELETE" });
  const role = typeof parsed.values.role === "string" ? parsed.values.role : "reader";
  if (!ROLES.includes(role)) throw new ClientError("usage", `Role must be one of ${ROLES.join(", ")}`);
  const result = await api(member(slug!, email!), json("PUT", { role }));
  return { ...(result as object), reminder: `${email} also needs to be allowed by the Cloudflare Access policy of sessions.example.com` };
}
