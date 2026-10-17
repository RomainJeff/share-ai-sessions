import type { Identity } from "../auth";
import { segmentKey } from "../db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const str = (v: unknown, max = 500) => (typeof v === "string" && v ? v.slice(0, max) : null);

/**
 * POST /api/sessions — multipart: `meta` (JSON) + `jsonl` (file). Idempotent for the owner
 * (re-upload replaces), 403 for anyone else. Owner always comes from the verified token.
 */
export async function createSession(request: Request, env: Env, who: Identity): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "multipart body required" }, { status: 400 });
  }
  const file = form.get("jsonl");
  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    return Response.json({ error: "meta must be JSON" }, { status: 400 });
  }
  const id = String(meta.id ?? "").toLowerCase();
  const project = str(meta.project, 200)?.toLowerCase();
  if (!UUID.test(id) || !project || !(file instanceof File)) {
    return Response.json({ error: "id (uuid), project and jsonl are required" }, { status: 400 });
  }

  // Ownership ignores retention: an expired session still belongs to its owner.
  const existing = await env.DB.prepare("SELECT owner_email, created_at FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ owner_email: string; created_at: number }>();
  if (existing && existing.owner_email !== who.email) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  await env.SESSIONS.put(segmentKey(id, 1), file.stream(), {
    httpMetadata: { contentType: "application/x-ndjson" },
  });

  const now = Date.now();
  const msgCount = typeof meta.msg_count === "number" ? Math.max(0, Math.floor(meta.msg_count)) : 0;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO sessions
       (id, owner_email, owner_name, project, branch, title, cwd_base, model, cc_version,
        msg_count, bytes, created_at, updated_at, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, who.email, who.name, project, str(meta.branch), str(meta.title), str(meta.cwd_base, 1000),
      str(meta.model), str(meta.cc_version), msgCount, file.size, existing?.created_at ?? now, now, now,
    )
    .run();

  return Response.json({ id, owner_email: who.email, project, bytes: file.size }, { status: existing ? 200 : 201 });
}
