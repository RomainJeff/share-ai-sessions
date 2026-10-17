import type { Identity } from "../auth";
import { MEMBER, VISIBLE, visibleSince } from "../db";

const COLUMNS =
  "id, owner_email, owner_name, project, repo, branch, title, summary, model, cc_version, msg_count, bytes, created_at, updated_at, last_synced_at";

/** GET /api/sessions?project=&repo=&author=&mine=1&q= — newest first, retention- and membership-filtered. */
export async function listSessions(request: Request, env: Env, who: Identity): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const where = [VISIBLE, MEMBER];
  const binds: (string | number)[] = [visibleSince(), who.email];

  const project = params.get("project");
  if (project) (where.push("project = ?"), binds.push(project.toLowerCase()));
  const repo = params.get("repo");
  if (repo) (where.push("repo = ?"), binds.push(repo.toLowerCase()));
  const author = params.get("mine") === "1" ? who.email : params.get("author");
  if (author) (where.push("owner_email = ?"), binds.push(author));
  const q = params.get("q");
  if (q) (where.push("(title LIKE ? OR summary LIKE ?)"), binds.push(`%${q}%`, `%${q}%`));

  // ponytail: fixed page of 100, add a cursor when someone has more than 100 live sessions.
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM sessions WHERE ${where.join(" AND ")} ORDER BY last_synced_at DESC, id LIMIT 100`,
  )
    .bind(...binds)
    .all();
  return Response.json({ sessions: results });
}
