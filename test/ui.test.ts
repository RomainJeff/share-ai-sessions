import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ALICE, mintJwt } from "./jwt";

const ORIGIN = "https://sessions.example.com";
async function get(path: string) {
  return SELF.fetch(ORIGIN + path, { headers: { "Cf-Access-Jwt-Assertion": await mintJwt() } });
}
async function seed(title: string, records: unknown[] = [], project = "acme/repo") {
  const id = crypto.randomUUID();
  const form = new FormData();
  form.set("meta", JSON.stringify({ id, title, project, branch: "main", model: "claude-test" }));
  form.set("jsonl", new File([records.map((r) => JSON.stringify(r)).join("\n") + "\n"], "s.jsonl"));
  const response = await SELF.fetch(ORIGIN + "/api/sessions", {
    method: "POST", body: form, headers: { "Cf-Access-Jwt-Assertion": await mintJwt({ email: ALICE, name: "Alice" }) },
  });
  expect(response.status).toBe(201);
  return id;
}

describe("web reader", () => {
  it("filters title/summary, project, author and inclusive UTC period, newest first", async () => {
    const older = await seed("Older hit");
    const newer = await seed("Newer hit");
    const other = await seed("Other hit", [], "else/repo");
    await env.DB.prepare("UPDATE sessions SET updated_at = ?, summary = ? WHERE id = ?").bind(Date.parse("2026-06-01T23:59:59Z"), "needle", older).run();
    await env.DB.prepare("UPDATE sessions SET updated_at = ?, summary = ? WHERE id = ?").bind(Date.parse("2026-06-02T12:00:00Z"), "needle", newer).run();
    const html = await (await get(`/?project=acme/repo&author=${ALICE}&q=needle&from=2026-06-01&to=2026-06-02`)).text();
    expect(html).toContain(`/s/${older}`);
    expect(html.indexOf("Newer hit")).toBeLessThan(html.indexOf("Older hit"));
    expect(html).not.toContain(`/s/${other}`);
    expect(await (await get("/?from=2026-06-01&to=2026-06-01&q=Older")).text()).toContain(`/s/${older}`);
    expect(await (await get("/?q=Newer&to=2026-06-01")).text()).not.toContain(`/s/${newer}`);
    expect(await (await get("/?author=other@example.com")).text()).not.toContain(`/s/${newer}`);
    expect(await (await get("/?q=Older")).text()).toContain(`/s/${older}`);
    expect((await get("/?from=2026-02-31")).status).toBe(400);
  });

  it("shows metadata, deduplicated tokens, collapsed tools and 100 conversation rows per page", async () => {
    const records = [
      { type: "assistant", message: { id: "same", usage: { input_tokens: 10, output_tokens: 1 }, content: "First chunk" } },
      { type: "assistant", message: { id: "same", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 20, cache_creation_input_tokens: 2 }, content: [{ type: "tool_use", name: "Read", input: { file: "demo.txt" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "read-id", content: "Result body" }] } },
      ...Array.from({ length: 98 }, (_, n) => ({ type: "user", message: { content: `Prompt ${n}` } })),
    ];
    const id = await seed("Reader test", records);
    const html = await (await get(`/s/${id}`)).text();
    expect(html).toContain("Alice · alice@example.com");
    expect(html).toContain("acme/repo@main · claude-test");
    expect(html).toContain("37 tokens · 1 réponses API");
    expect(html.match(/<article /g)).toHaveLength(100);
    expect(html).toContain("<details><summary>Outil : Read</summary>");
    expect(html).toContain("<details><summary>Résultat : read-id</summary>");
    expect(html).toContain("Result body");
    expect(html).toContain(`data-copy="/share-session pull ${id}"`);
    const second = await (await get(`/s/${id}?page=2`)).text();
    expect(second.match(/<article /g)).toHaveLength(1);
    expect(second).toContain("Prompt 97");
    expect(second).toContain("Page 2 / 2");
  });

  it("renders hostile transcript and metadata as text with no executable markup", async () => {
    const attack = '</pre><script>alert(1)</script><img src=x onerror="alert(2)">';
    const id = await seed(attack, [
      { type: "user", message: { content: attack } },
      { type: "assistant", message: { content: [{ type: "tool_use", name: attack, input: { value: attack } }, { type: "tool_result", content: [{ type: "text", text: attack }] }] } },
    ]);
    for (const path of ["/", `/s/${id}`]) {
      const response = await get(path);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(response.headers.get("cache-control")).toContain("no-store");
      const html = await response.text();
      expect(html).not.toContain(attack);
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html.match(/<script /g)).toHaveLength(1);
    }
  });

  it("authenticates both pages and hides expired or unknown sessions", async () => {
    const id = await seed("Expired title");
    await env.DB.prepare("UPDATE sessions SET last_synced_at = ? WHERE id = ?").bind(Date.now() - 91 * 86400000, id).run();
    expect(await (await get("/")).text()).not.toContain(`/s/${id}`);
    expect((await get(`/s/${id}`)).status).toBe(404);
    expect((await get(`/s/${crypto.randomUUID()}`)).status).toBe(404);
    for (const path of ["/", `/s/${id}`]) expect((await SELF.fetch(ORIGIN + path)).status).toBe(401);
  });

  it("reads plain and gzip segments in order and tolerates incomplete JSONL", async () => {
    const id = await seed("Segments", [{ type: "user", message: { content: "First segment" } }]);
    const bytes = new TextEncoder().encode(JSON.stringify({ type: "assistant", message: { content: "Second segment" } }) + "\n{truncated");
    await env.SESSIONS.put(`sessions/${id}/seg-0002.jsonl.gz`, await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
    const html = await (await get(`/s/${id}`)).text();
    expect(html).toContain("Second segment");
    expect(html.indexOf("First segment")).toBeLessThan(html.indexOf("Second segment"));
    expect(html).toContain("1 ligne(s) JSONL invalide(s)");
  });
});
