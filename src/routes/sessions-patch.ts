import type { Identity } from "../auth";
import { atLeast, roleIn, segmentKey } from "../db";
import { lastLineHash } from "../transcript";

export async function patchSession(request: Request, env: Env, who: Identity, { id }: Record<string, string>): Promise<Response> {
  // Writes can revive an expired session; ownership still applies.
  const session = await env.DB.prepare("SELECT owner_email, project, bytes, segment_count FROM sessions WHERE id = ?")
    .bind(id).first<{ owner_email: string; project: string; bytes: number; segment_count: number }>();
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  if (session.owner_email !== who.email) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!atLeast(await roleIn(env, session.project, who.email), "writer")) {
    return Response.json({ error: `writer role required on project ${session.project}` }, { status: 403 });
  }
  const raw = request.headers.get("X-Base-Offset");
  const offset = Number(raw);
  if (raw === null || !/^\d+$/.test(raw) || !Number.isSafeInteger(offset)) {
    return Response.json({ error: "invalid offset" }, { status: 400 });
  }
  if (offset !== session.bytes) return Response.json({ error: "offset mismatch", bytes: session.bytes }, { status: 409 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return Response.json({ id, bytes: offset });
  try {
    if (bytes.at(-1) !== 10) throw new Error();
    for (const line of new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes).split("\n")) {
      if (line.trim()) JSON.parse(line);
    }
  } catch {
    return Response.json({ error: "complete JSONL lines required" }, { status: 400 });
  }
  const key = segmentKey(id!, session.segment_count + 1) + ".gz";
  const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const object = await env.SESSIONS.put(key, await new Response(compressed).arrayBuffer(), {
    onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/gzip" },
  });
  if (!object) return Response.json({ error: "concurrent sync" }, { status: 409 });
  const hash = await lastLineHash(bytes);
  const now = Date.now();
  const updated = await env.DB.prepare(`UPDATE sessions SET bytes = ?, segment_count = segment_count + 1,
    last_line_hash = ?, updated_at = ?, last_synced_at = ? WHERE id = ? AND bytes = ? AND segment_count = ?`)
    .bind(offset + bytes.length, hash, now, now, id, offset, session.segment_count).run();
  if (!updated.meta.changes) {
    await env.SESSIONS.delete(key);
    return Response.json({ error: "concurrent sync" }, { status: 409 });
  }
  return Response.json({ id, bytes: offset + bytes.length, last_line_hash: hash });
}
