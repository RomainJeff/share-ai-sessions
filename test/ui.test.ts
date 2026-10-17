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

async function workedParts(html: string) {
  const inside: string[] = [];
  await new HTMLRewriter().on("details.worked", {
    element() { inside.push(""); },
    text(chunk) { inside[inside.length - 1] += chunk.text; },
  }).transform(new Response(html)).text();
  const outside = await new HTMLRewriter().on("details.worked", {
    element(element) { element.remove(); },
  }).transform(new Response(html)).text();
  return { inside, outside };
}

describe("web reader", () => {
  it("collapses intermediate rows and their raw JSON before the final timed answer", async () => {
    const id = await seed("Worked turn", [
      { type: "user", timestamp: "2026-10-17T10:00:00Z", message: { content: "Human question" } },
      { type: "assistant", message: { content: [{ type: "thinking", thinking: "Private reasoning" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file: "demo.txt" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "read-id", content: "Read output" }] } },
      { type: "user", isMeta: true, message: { content: "Injected context" } },
      { type: "assistant", message: { content: "Progress update" } },
      { type: "assistant", timestamp: "2026-10-17T10:10:00Z", message: { content: [{ type: "text", text: "Final answer" }] } },
      { type: "user", isMeta: true, timestamp: "2026-10-17T10:12:00Z", message: { content: "Trailing context" } },
    ]);
    const html = await (await get(`/s/${id}`)).text();
    const { inside, outside } = await workedParts(html);
    expect(html.match(/<details class="worked"[^>]*>/g)).toEqual(['<details class="worked">']);
    expect(inside).toHaveLength(1);
    expect(inside[0]).toContain("A travaillé pendant 12 min · 6 étapes");
    for (const text of ["Private reasoning", "Outil : Read", "Read output", "Injected context", "Progress update", "Trailing context"]) {
      expect(inside[0]).toContain(text);
      expect(outside).not.toContain(text);
    }
    expect(inside[0]!.match(/JSON brut/g)).toHaveLength(6);
    for (const text of ["Human question", "Final answer"]) {
      expect(inside[0]).not.toContain(text);
      expect(outside).toContain(text);
    }
    expect(outside).toContain('<time datetime="2026-10-17T10:10:00.000Z"');
    expect(html.indexOf('class="worked"')).toBeLessThan(html.indexOf("Final answer"));
  });

  it("groups the preamble and interrupted turns, but leaves direct answers unwrapped", async () => {
    const id = await seed("Turn boundaries", [
      { type: "user", isMeta: true, message: { content: "Session preamble" } },
      { type: "assistant", message: { content: "Preamble text" } },
      { type: "user", timestamp: "2026-10-17T10:00:00Z", message: { content: "Interrupted question" } },
      { type: "assistant", timestamp: "2026-10-17T10:00:30Z", message: { content: [{ type: "thinking", thinking: "Unfinished work" }, { type: "tool_use", name: "PendingTool", input: {} }, { type: "text", text: "  " }] } },
      { type: "user", message: { content: "Direct question" } },
      { type: "assistant", message: { content: "Direct answer" } },
    ]);
    const { inside, outside } = await workedParts(await (await get(`/s/${id}`)).text());
    expect(inside).toHaveLength(2);
    expect(inside[0]).toContain("Étapes intermédiaires · 2 étapes");
    expect(inside[0]).toContain("Session preamble");
    expect(inside[0]).toContain("Preamble text");
    expect(inside[1]).toMatch(/A travaillé pendant moins d(?:'|&#39;)une minute · 1 étape/);
    expect(inside[1]).toContain("Unfinished work");
    expect(inside[1]).toContain("PendingTool");
    expect(outside).not.toContain("Unfinished work");
    expect(outside).not.toContain("PendingTool");
    for (const text of ["Interrupted question", "Direct question", "Direct answer"]) expect(outside).toContain(text);
    const direct = await seed("Direct only", [
      { type: "user", message: { content: "Question" } },
      { type: "assistant", message: { content: "Answer" } },
    ]);
    expect(await (await get(`/s/${direct}`)).text()).not.toContain('<details class="worked">');
  });

  it.each([
    [undefined, "2026-10-17T11:05:00Z", "Étapes intermédiaires"],
    ["2026-10-17T10:00:00Z", undefined, "Étapes intermédiaires"],
    ["invalid", "2026-10-17T11:05:00Z", "Étapes intermédiaires"],
    ["2026-10-17T10:00:00Z", "invalid", "Étapes intermédiaires"],
    ["2026-10-17T10:00:00Z", "2026-10-17T11:05:00Z", "A travaillé pendant 1 h 05"],
  ])("labels work with timestamps %s → %s", async (start, end, label) => {
    const id = await seed("Timing", [
      { type: "user", timestamp: start, message: { content: "Question" } },
      { type: "assistant", message: { content: "Intermediate" } },
      { type: "assistant", timestamp: end, message: { content: "Final" } },
    ]);
    const { inside } = await workedParts(await (await get(`/s/${id}`)).text());
    expect(inside).toHaveLength(1);
    expect(inside[0]).toContain(`${label} · 1 étape`);
  });

  it("keeps full-turn timing and final-answer visibility across 100-record pages", async () => {
    const id = await seed("Paged turn", [
      { type: "user", timestamp: "2026-10-17T10:00:00Z", message: { content: "Long question" } },
      ...Array.from({ length: 100 }, (_, n) => ({ type: "assistant", timestamp: "2026-10-17T10:01:00Z", message: { content: `Progress ${n}` } })),
      { type: "assistant", timestamp: "2026-10-17T10:12:00Z", message: { content: "Paged final" } },
    ]);
    for (const [page, steps] of [[1, 99], [2, 1]]) {
      const html = await (await get(`/s/${id}?page=${page}`)).text();
      const { inside, outside } = await workedParts(html);
      expect(inside).toHaveLength(1);
      expect(inside[0]).toContain(`A travaillé pendant 12 min · ${steps} étape${steps === 1 ? "" : "s"}`);
      expect(outside).not.toContain("Progress ");
      expect(outside.includes("Paged final")).toBe(page === 2);
      expect(html.match(/<article /g)).toHaveLength(page === 1 ? 100 : 2);
      expect(html).toContain(`href="?page=${page === 1 ? 2 : 1}"`);
    }
  });

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
    const text = html.match(/<main[^>]*>([^]*?)<\/main>/)![1]!.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    expect(html).toContain("Alice · alice@example.com");
    expect(text).toContain("acme/repo main claude-test");
    expect(html).toContain("37 tokens · 1 réponses API");
    expect(html.match(/<article /g)).toHaveLength(100);
    expect(html).toMatch(/<details class="tool"><summary>[^]*?Outil : Read[^]*?<\/summary>/);
    expect(html).toMatch(/<details class="tool"><summary>[^]*?Résultat : read-id[^]*?<\/summary>/);
    expect(html).toContain("Result body");
    expect(html).toContain(`data-copy="/share-session pull ${id}"`);
    const second = await (await get(`/s/${id}?page=2`)).text();
    expect(second.match(/<article /g)).toHaveLength(1);
    expect(second).toContain("Prompt 97");
    expect(second).toContain("Page 2 / 2");
  });

  it("attributes only human prompts to the user and keeps tool/context records reachable", async () => {
    const records = [
      { type: "user", message: { content: "Explain this change" } },
      { type: "user", toolUseResult: { stdout: "Read output" }, message: { content: [{ type: "tool_result", tool_use_id: "read-id", content: "Read output" }] } },
      { type: "user", isMeta: true, message: { content: "Injected context" } },
      { type: "user", message: { content: "<command-name>/clear</command-name>" } },
    ];
    const id = await seed("Attribution", records);
    const html = await (await get(`/s/${id}`)).text();
    const rows = html.match(/<article\b[^]*?<\/article>/g)!;
    expect(rows).toHaveLength(4);
    expect(html.match(/data-role="user"/g)).toHaveLength(1);
    expect(html.match(/<b>Utilisateur<\/b>/g)).toHaveLength(1);
    expect(rows[0]).toContain('class="turn me" data-role="user"');
    expect(rows[0]).toContain('aria-hidden="true">U</span>');
    expect(rows[0]).toContain("Explain this change");
    expect(rows[1]).toContain('class="turn ai" data-role="tool"');
    expect(rows[1]).toMatch(/<details class="tool"><summary>[^]*?Résultat : read-id/);
    for (const row of rows.slice(1)) {
      expect(row).not.toContain("Utilisateur");
      expect(row).not.toContain('aria-hidden="true">U</span>');
      expect(row).not.toContain('class="turn me"');
    }
    for (const row of rows.slice(2)) {
      expect(row).toContain('data-role="system"');
      expect(row).toMatch(/<details class="reason context"><summary>[^]*?Contexte/);
      expect(row).not.toMatch(/<details[^>]*\bopen\b/);
    }
    for (const [index, record] of records.entries()) {
      expect(rows[index]).toContain("JSON brut");
      expect(rows[index]).toContain(JSON.stringify(record).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"));
    }
    expect(html).toContain("<dt>Messages</dt><dd>4</dd>");
  });

  it("distinguishes harness-only text from human text and image prompts", async () => {
    const cases = [
      { role: "user", message: { content: [{ type: "text", text: "Review this" }, { type: "image", source: { type: "base64", data: "test" } }] } },
      { role: "user", message: { content: [{ type: "image", source: { type: "base64", data: "test" } }] } },
      { role: "user", message: { content: "<system-reminder>Injected</system-reminder>\nMy real question" } },
      { role: "user", message: { content: "Explain <command-name> to me" } },
      { role: "user", message: { content: "[Request interrupted by user]\nMy real question" } },
      { role: "system", isCompactSummary: true, message: { content: "Conversation summary" } },
      { role: "system", message: { content: "  <command-message>clear</command-message>\n<command-name>/clear</command-name>  " } },
      { role: "system", message: { content: "<local-command-stdout>Done</local-command-stdout>" } },
      { role: "system", message: { content: "<local-command-caveat>Local only</local-command-caveat>" } },
      { role: "system", message: { content: [{ type: "text", text: "<system-reminder>Injected</system-reminder>" }] } },
      { role: "system", message: { content: "[Request interrupted by user for tool use]" } },
      { role: "system", message: { content: "[Request interrupted by user]\n[Request interrupted by user for tool use]" } },
      { role: "system", message: { content: [{ type: "text", text: "Text" }, { type: "thinking", thinking: "Internal" }] } },
      { role: "system", message: { content: [] } },
      { role: "system", message: { content: { unexpected: "value" } } },
      { role: "tool", toolUseResult: null, message: { content: "Tool output without blocks" } },
      { role: "tool", message: { content: [{ type: "tool_result", content: "Tool output without metadata" }] } },
    ];
    const id = await seed("Prompt shapes", cases.map(({ role, ...record }) => ({ type: "user", ...record })));
    const html = await (await get(`/s/${id}`)).text();
    const rows = html.match(/<article\b[^]*?<\/article>/g)!;
    expect(rows).toHaveLength(cases.length);
    for (const [index, { role }] of cases.entries()) {
      expect(rows[index]).toContain(`data-role="${role}"`);
      expect(rows[index]?.includes("<b>Utilisateur</b>")).toBe(role === "user");
    }
  });

  it("renders hostile transcript and metadata as text with no executable markup", async () => {
    const attack = '</pre><script>alert(1)</script><img src=x onerror="alert(2)">';
    const id = await seed(attack, [
      { type: "user", message: { content: attack } },
      { type: "user", isMeta: true, message: { content: attack } },
      { type: "user", toolUseResult: {}, message: { content: attack } },
      { type: "assistant", message: { content: [{ type: "tool_use", name: attack, input: { value: attack } }, { type: "tool_result", content: [{ type: "text", text: attack }] }] } },
    ]);
    for (const path of ["/", `/s/${id}`]) {
      const response = await get(path);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(response.headers.get("cache-control")).toContain("no-store");
      const html = await response.text();
      const nonce = html.match(/<script nonce="([^"]+)">/)?.[1];
      expect(nonce).toBeTruthy();
      expect(response.headers.get("content-security-policy")).toContain(`script-src 'nonce-${nonce}'`);
      expect(response.headers.get("content-security-policy")).not.toContain("script-src 'unsafe-inline'");
      expect(html).not.toMatch(/<(?:link|script)[^>]+(?:href|src)=/);
      expect(html).not.toContain(attack);
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html.match(/<script /g)).toHaveLength(1);
    }
  });

  it("keeps active filters while paging the list by 100, and escapes search values", async () => {
    const id = await seed("Pagination", [], "paging/repo");
    await env.DB.batch(Array.from({ length: 100 }, (_, n) => env.DB.prepare(`INSERT INTO sessions
      (id, owner_email, owner_name, project, title, created_at, updated_at, last_synced_at)
      VALUES (?, ?, 'Alice', 'paging/repo', ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), ALICE, `Pagination ${n}`, Date.now(), Date.now() + n + 1, Date.now())));
    const query = `project=paging%2Frepo&author=${encodeURIComponent(ALICE)}&q=Pagination`;
    const first = await (await get(`/?${query}`)).text();
    expect(first.match(/<a class="card" /g)).toHaveLength(100);
    expect(first).toContain(`href="/?${query.replaceAll("&", "&amp;")}&amp;page=2"`);
    const second = await (await get(`/?${query}&page=2`)).text();
    expect(second.match(/<a class="card" /g)).toHaveLength(1);
    expect(second).toContain(`/s/${id}`);
    const hostile = await (await get('/?q=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')).text();
    expect(hostile).toContain('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(hostile).not.toContain('<script>alert(1)</script>');
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

  it("serves the packaged skill behind Access and links it from the list", async () => {
    const response = await get("/share-session.skill");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain("share-session.skill");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
    expect(new TextDecoder().decode(bytes)).toContain("share-session/SKILL.md");
    expect((await SELF.fetch(ORIGIN + "/share-session.skill")).status).toBe(401);
    expect(await (await get("/")).text()).toContain('href="/share-session.skill"');
  });
});
