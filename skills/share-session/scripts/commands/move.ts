import { parseArgs } from "node:util";
import { api, ClientError } from "../lib.ts";

export async function move(args: string[]): Promise<unknown> {
  const usage = "Usage: client.ts move <session UUID> --project <slug>";
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: { project: { type: "string" } } });
  } catch {
    throw new ClientError("usage", usage);
  }
  const id = parsed.positionals[0]?.toLowerCase();
  const project = typeof parsed.values.project === "string" ? parsed.values.project.trim().toLowerCase() : "";
  if (parsed.positionals.length !== 1 || !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ||
      !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(project)) throw new ClientError("usage", usage);
  return api(`/api/sessions/${id}/project`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project }),
  });
}
