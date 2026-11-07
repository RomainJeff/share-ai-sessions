import type { Identity } from "../auth";
import { atLeast, roleIn } from "../db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const APP = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const fail = (error: string, status: number) => Response.json({ error }, { status });
const str = (v: unknown, max = 500) => (typeof v === "string" && v ? v.slice(0, max) : null);

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * PUT /api/sessions/:id/relay — a session hosted by another app: metadata and a link, never a transcript.
 * Create or renew, with createSession's ownership and project rules. Every call counts as activity.
 */
export async function relaySession(request: Request, env: Env, who: Identity, { id }: Record<string, string>): Promise<Response> {
  if (!UUID.test(id!)) return fail("id must be a lowercase UUID", 400);
  let input: Record<string, unknown>;
  try {
    input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
  } catch {
    return fail("JSON body required", 400);
  }
  const app = typeof input.app === "string" ? input.app.trim().toLowerCase() : "";
  if (!APP.test(app)) return fail("app must be a short slug: a-z, 0-9 and inner dashes", 400);
  const url = httpsUrl(input.url);
  if (!url) return fail("url must be an absolute https URL of at most 2000 characters", 400);
  let expiresAt: number | null = null;
  if (input.expires_at !== undefined && input.expires_at !== null) {
    expiresAt = typeof input.expires_at === "number" ? input.expires_at : Date.parse(String(input.expires_at));
    if (!Number.isSafeInteger(expiresAt)) return fail("expires_at must be an ISO date or epoch milliseconds", 400);
  }

  // Ownership ignores retention, like uploads.
  const existing = await env.DB.prepare("SELECT owner_email, project, external_app FROM sessions WHERE id = ?")
    .bind(id).first<{ owner_email: string; project: string; external_app: string | null }>();
  if (existing && existing.owner_email !== who.email) return fail("forbidden", 403);
  if (existing && existing.external_app === null) return fail("session already holds a hosted transcript", 409);
  const requested = str(input.project, 200)?.toLowerCase();
  if (existing && requested && requested !== existing.project) {
    return fail(`project is locked to ${existing.project}, the project of this session`, 400);
  }
  const project = existing?.project ?? requested;
  if (!project) return fail("project required: pick one of your projects or create one", 400);
  if (!atLeast(await roleIn(env, project, who.email), "writer")) return fail(`writer role required on project ${project}`, 403);

  const now = Date.now();
  const msgCount = typeof input.msg_count === "number" ? Math.max(0, Math.floor(input.msg_count)) : null;
  const meta = [str(input.repo, 200)?.toLowerCase() ?? null, str(input.branch), str(input.title), str(input.cwd_base, 1000), str(input.model), str(input.cc_version), msgCount];
  if (existing) {
    // A renewal may carry only the link: metadata it omits stays as it was.
    const updated = await env.DB.prepare(`UPDATE sessions SET owner_name = ?, repo = COALESCE(?, repo), branch = COALESCE(?, branch),
      title = COALESCE(?, title), cwd_base = COALESCE(?, cwd_base), model = COALESCE(?, model), cc_version = COALESCE(?, cc_version),
      msg_count = COALESCE(?, msg_count), external_app = ?, external_url = ?, external_expires_at = ?, updated_at = ?, last_synced_at = ?
      WHERE id = ? AND owner_email = ? AND external_app IS NOT NULL`)
      .bind(who.name, ...meta, app, url, expiresAt, now, now, id, who.email).run();
    if (!updated.meta.changes) return fail("session changed; retry", 409);
  } else {
    // No transcript: bytes and segments stay at zero, so nothing is ever read from R2 for this id.
    await env.DB.prepare(`INSERT INTO sessions (id, owner_email, owner_name, project, repo, branch, title, cwd_base, model, cc_version,
      msg_count, bytes, segment_count, created_at, updated_at, last_synced_at, external_app, external_url, external_expires_at)
      VALUES (?, ?, ?, ?, COALESCE(?, ''), ?, ?, ?, ?, ?, COALESCE(?, 0), 0, 0, ?, ?, ?, ?, ?, ?)`)
      .bind(id, who.email, who.name, project, ...meta, now, now, now, app, url, expiresAt).run();
  }
  return Response.json({ id, owner_email: who.email, project, external_app: app, external_url: url, external_expires_at: expiresAt },
    { status: existing ? 200 : 201 });
}
