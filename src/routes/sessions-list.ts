import type { Identity } from "../auth";
import { VISIBLE, visibleSince } from "../db";

const COLUMNS =
  "id, owner_email, owner_name, project, branch, title, summary, model, cc_version, msg_count, bytes, created_at, updated_at, last_synced_at";

/** GET /api/sessions?project=&author=&mine=1&q= — newest first, retention-filtered. */
export async function listSessions(request: Request, env: Env, who: Identity): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const where = [VISIBLE];
  const binds: (string | number)[] = [visibleSince()];

  const project = params.get("project");
  if (project) (where.push("project = ?"), binds.push(project.toLowerCase()));
  const author = params.get("mine") === "1" ? who.email : params.get("author");
  if (author) (where.push("owner_email = ?"), binds.push(author));
  const q = params.get("q");
  if (q) (where.push("(title LIKE ? OR summary LIKE ?)"), binds.push(`%${q}%`, `%${q}%`));

  // ponytail: fixed page of 100, add a cursor when someone has more than 100 live sessions.
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM sessions WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT 100`,
  )
    .bind(...binds)
    .all();
  return Response.json({ sessions: results });
}
