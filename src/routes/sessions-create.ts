import type { Identity } from "../auth";
import { atLeast, roleIn, segmentKey } from "../db";
import { lastLineHash } from "../transcript";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const str = (v: unknown, max = 500) => (typeof v === "string" && v ? v.slice(0, max) : null);

/**
 * POST /api/sessions — multipart: `meta` (JSON) + `jsonl` (file). Idempotent for the owner
 * (re-upload replaces), 403 for anyone else. Owner always comes from the verified token.
 * The project is chosen once: a re-upload, a fork or a compaction continuation stays where its
 * session, origin or parent lives. Uploading needs at least `writer` on that project.
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
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error();
  } catch {
    return Response.json({ error: "meta must be JSON" }, { status: 400 });
  }
  const id = String(meta.id ?? "").toLowerCase();
  const requested = str(meta.project, 200)?.toLowerCase();
  if (!UUID.test(id) || !(file instanceof File)) {
    return Response.json({ error: "id (uuid) and jsonl are required" }, { status: 400 });
  }

  // Ownership ignores retention: an expired session still belongs to its owner.
  const existing = await env.DB.prepare("SELECT owner_email, project, created_at, forked_from, continued_from FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ owner_email: string; project: string; created_at: number; forked_from: string | null; continued_from: string | null }>();
  if (existing && existing.owner_email !== who.email) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  let forkedFrom = existing?.forked_from ?? null;
  if (meta.forked_from !== undefined && meta.forked_from !== null) {
    if (typeof meta.forked_from !== "string" || !UUID.test(meta.forked_from) || meta.forked_from === id) {
      return Response.json({ error: "forked_from must be another session UUID" }, { status: 400 });
    }
    if (existing && meta.forked_from !== forkedFrom) {
      return Response.json({ error: "forked_from cannot change" }, { status: 400 });
    }
    forkedFrom = meta.forked_from;
  }
  let forkedFromOwner: string | null = null;
  let inherited: { project: string; from: string } | null = existing ? { project: existing.project, from: "this session" } : null;
  if (forkedFrom) {
    const origin = await env.DB.prepare("SELECT owner_email, project FROM sessions WHERE id = ?").bind(forkedFrom).first<{ owner_email: string; project: string }>();
    if (!origin) return Response.json({ error: "forked_from session does not exist" }, { status: 400 });
    forkedFromOwner = origin.owner_email;
    inherited ??= { project: origin.project, from: "the forked session" };
  }

  // A compaction continuation links to the uploader's own parent session; like a fork, the link is set once.
  let continuedFrom = existing?.continued_from ?? null;
  if (meta.continued_from !== undefined && meta.continued_from !== null) {
    if (typeof meta.continued_from !== "string" || !UUID.test(meta.continued_from) || meta.continued_from === id) {
      return Response.json({ error: "continued_from must be another session UUID" }, { status: 400 });
    }
    if (existing && continuedFrom !== null && meta.continued_from !== continuedFrom) {
      return Response.json({ error: "continued_from cannot change" }, { status: 400 });
    }
    const parent = await env.DB.prepare("SELECT owner_email, project FROM sessions WHERE id = ?").bind(meta.continued_from).first<{ owner_email: string; project: string }>();
    if (parent?.owner_email !== who.email) return Response.json({ error: "continued_from must be one of your sessions" }, { status: 400 });
    continuedFrom = meta.continued_from;
    inherited ??= { project: parent.project, from: "the compacted session" };
  }

  if (inherited && requested && requested !== inherited.project) {
    return Response.json({ error: `project is locked to ${inherited.project}, the project of ${inherited.from}` }, { status: 400 });
  }
  const project = inherited?.project ?? requested;
  if (!project) return Response.json({ error: "project required: pick one of your projects or create one" }, { status: 400 });
  if (!atLeast(await roleIn(env, project, who.email), "writer")) {
    return Response.json({ error: `writer role required on project ${project}` }, { status: 403 });
  }

  // `repo` inherits NOT NULL from the old `project` column: empty when the client did not send one.
  const repo = str(meta.repo, 200)?.toLowerCase() ?? "";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await lastLineHash(bytes);
  await env.SESSIONS.put(segmentKey(id, 1), bytes, {
    httpMetadata: { contentType: "application/x-ndjson" },
  });

  // A full replacement invalidates every old delta. Paginate R2 listings.
  let cursor: string | undefined;
  do {
    const page = await env.SESSIONS.list({ prefix: `sessions/${id}/seg-`, cursor });
    const stale = page.objects.filter((o) => o.key !== segmentKey(id, 1)).map((o) => o.key);
    if (stale.length) await env.SESSIONS.delete(stale);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const now = Date.now();
  const msgCount = typeof meta.msg_count === "number" ? Math.max(0, Math.floor(meta.msg_count)) : 0;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO sessions
       (id, owner_email, owner_name, project, repo, branch, title, cwd_base, model, cc_version,
        msg_count, bytes, created_at, updated_at, last_synced_at, last_line_hash, forked_from, forked_from_owner, continued_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, who.email, who.name, project, repo, str(meta.branch), str(meta.title), str(meta.cwd_base, 1000),
      str(meta.model), str(meta.cc_version), msgCount, file.size, existing?.created_at ?? now, now, now, hash, forkedFrom, forkedFromOwner, continuedFrom,
    )
    .run();

  return Response.json({ id, owner_email: who.email, project, repo, bytes: file.size, last_line_hash: hash }, { status: existing ? 200 : 201 });
}
