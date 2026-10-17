import type { Identity } from "../auth";
import { segmentKey, VISIBLE, visibleSince } from "../db";

/** Stream decompressed segments in order; the T02 initial segment stays readable. */
export async function sessionBundle(request: Request, env: Env, _who: Identity, { id }: Record<string, string>): Promise<Response> {
  const session = await env.DB.prepare(`SELECT * FROM sessions WHERE id = ? AND ${VISIBLE}`)
    .bind(id, visibleSince()).first<{ segment_count: number } & Record<string, unknown>>();
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  let n = 1;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          if (!reader) {
            if (n > session.segment_count) { controller.close(); return; }
            const compressed = n > 1;
            const object = await env.SESSIONS.get(segmentKey(id!, n++) + (compressed ? ".gz" : ""));
            if (!object) throw new Error("Missing segment");
            reader = (compressed ? object.body.pipeThrough(new DecompressionStream("gzip")) : object.body).getReader();
          }
          const chunk = await reader.read();
          if (!chunk.done) { controller.enqueue(chunk.value); return; }
          reader.releaseLock();
          reader = undefined;
        }
      } catch (error) { controller.error(error); }
    },
    async cancel(reason) { await reader?.cancel(reason); },
  });
  if (request.headers.get("Accept")?.includes("application/json")) {
    const jsonl = await new Response(body).text();
    const tool_results: Record<string, string> = Object.create(null);
    const prefix = `sessions/${id}/tool-results/`;
    let cursor: string | undefined;
    do {
      const listed = await env.SESSIONS.list({ prefix, cursor });
      for (const { key } of listed.objects) {
        const object = await env.SESSIONS.get(key);
        if (!object) return Response.json({ error: "missing tool result" }, { status: 503 });
        const bytes = new Uint8Array(await object.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        tool_results[key.slice(prefix.length)] = btoa(binary);
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    return Response.json({ session, jsonl, tool_results });
  }
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
}
