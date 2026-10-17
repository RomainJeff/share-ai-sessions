import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ALICE, BOB, mintJwt } from "./jwt";

const ORIGIN = "https://sessions.example.com";
async function get(path: string) {
  return SELF.fetch(ORIGIN + path, { headers: { "Cf-Access-Jwt-Assertion": await mintJwt() } });
}
async function seed(title: string, records: unknown[] = [], repo = "acme/repo") {
  const id = crypto.randomUUID();
  const form = new FormData();
  form.set("meta", JSON.stringify({ id, title, project: "team", repo, branch: "main", model: "claude-test" }));
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

  it("renders a turn longer than 100 rows in full without pagination", async () => {
    const id = await seed("Long turn", [
      { type: "user", timestamp: "2026-10-17T10:00:00Z", message: { content: "Long question" } },
      ...Array.from({ length: 100 }, (_, n) => ({ type: "assistant", timestamp: "2026-10-17T10:01:00Z", message: { content: `Progress ${n}` } })),
      { type: "assistant", timestamp: "2026-10-17T10:12:00Z", message: { content: "Long final" } },
    ]);
    for (const query of ["", "?page=2"]) {
      const html = await (await get(`/s/${id}${query}`)).text();
      const { inside, outside } = await workedParts(html);
      expect(inside).toHaveLength(1);
      expect(inside[0]).toContain("A travaillé pendant 12 min · 100 étapes");
      for (let n = 0; n < 100; n++) expect(inside[0]).toContain(`Progress ${n}`);
      expect(outside).not.toContain("Progress ");
      expect(outside).toContain("Long question");
      expect(outside).toContain("Long final");
      expect(html.match(/<article /g)).toHaveLength(102);
      expect(html).not.toContain("?page=");
      expect(html).not.toContain('<nav class="pagination"');
    }
  });

  it("provides a viewport-bounded conversation scroller opened at the bottom", async () => {
    const id = await seed("Scrollable", [{ type: "user", message: { content: "Latest prompt" } }]);
    const response = await get(`/s/${id}`);
    const html = await response.text();
    expect(html).toContain('<section class="chat transcript" id="conversation" tabindex="0" aria-label="Conversation">');
    expect(html).toMatch(/\.transcript\{[^}]*max-height:[^}]*100dvh[^}]*overflow-y:auto/);
    expect(html).toContain("const conversation=document.getElementById('conversation');");
    const script = html.match(/<script nonce="([^"]+)">([^]*?)<\/script>/)!;
    expect(script[2]).toContain("conversation.scrollTop=conversation.scrollHeight");
    expect(script[2]).toContain("conversation.getBoundingClientRect()");
    expect(script[2]).toContain("actionbar.getBoundingClientRect().height");
    expect(script[2]).toContain("conversation.scrollIntoView({block:'nearest'})");
    expect(script[2]).toContain("window.visualViewport?.addEventListener('resize',sizeConversation)");
    expect(html).toMatch(/\.transcript\{[^}]*max-height:[^;]*100vh/);
    expect(response.headers.get("content-security-policy")).toContain(`script-src 'nonce-${script[1]}'`);
  });

  it("keeps sharing instructions behind a disclosure and the download reachable without JavaScript", async () => {
    const html = await (await get("/")).text();
    const help = html.match(/<details class="panel share-help"[^>]*>([^]*?)<\/details>/)?.[1];
    expect(help).toBeDefined();
    expect(help).toContain("Partager une session");
    expect(help).toContain('class="btn" href="/share-session.skill" download');
    expect(html).toContain('href="/sessions"');
  });

  it("filters title/summary, project, author and inclusive UTC period, newest first", async () => {
    const older = await seed("Older hit");
    const newer = await seed("Newer hit");
    const other = await seed("Other hit", [], "else/repo");
    const today = new Date().toISOString().slice(0, 10);
    const firstDay = new Date(Date.parse(today) - 2 * 86400000).toISOString().slice(0, 10);
    const secondDay = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
    await env.DB.prepare("UPDATE sessions SET last_synced_at = ?, summary = ? WHERE id = ?").bind(Date.parse(`${firstDay}T23:59:59Z`), "needle", older).run();
    await env.DB.prepare("UPDATE sessions SET last_synced_at = ?, summary = ? WHERE id = ?").bind(Date.parse(`${secondDay}T12:00:00Z`), "needle", newer).run();
    const html = await (await get(`/sessions?repo=acme/repo&author=${ALICE}&q=needle&from=${firstDay}&to=${secondDay}`)).text();
    expect(html).toContain(`/s/${older}`);
    expect(html.indexOf("Newer hit")).toBeLessThan(html.indexOf("Older hit"));
    expect(html).not.toContain(`/s/${other}`);
    expect(await (await get(`/sessions?from=${firstDay}&to=${firstDay}&q=Older`)).text()).toContain(`/s/${older}`);
    expect(await (await get(`/sessions?q=Newer&to=${firstDay}`)).text()).not.toContain(`/s/${newer}`);
    expect(await (await get("/sessions?author=other@example.com")).text()).not.toContain(`/s/${newer}`);
    expect(await (await get("/sessions?q=Older")).text()).toContain(`/s/${older}`);
    expect((await get("/sessions?from=2026-02-31")).status).toBe(400);
  });

  it("shows metadata, deduplicated tokens, collapsed tools and every conversation row", async () => {
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
    expect(html).toContain("37 tokens · 101 messages");
    expect(html).toContain("<dt>Réponses API</dt><dd>1</dd>");
    expect(html.match(/<article /g)).toHaveLength(101);
    expect(html).toMatch(/<details class="tool"><summary>[^]*?Outil : Read[^]*?<\/summary>/);
    expect(html).toMatch(/<details class="tool"><summary>[^]*?Résultat : read-id[^]*?<\/summary>/);
    expect(html).toContain("Result body");
    expect(html).toContain(`data-copy="/share-session pull ${id}"`);
    expect(html).toContain("Prompt 97");
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
      (id, owner_email, owner_name, project, repo, title, created_at, updated_at, last_synced_at)
      VALUES (?, ?, 'Alice', 'team', 'paging/repo', ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), ALICE, `Pagination ${n}`, Date.now(), Date.now() + n + 1, Date.now() + n + 1)));
    const query = `repo=paging%2Frepo&author=${encodeURIComponent(ALICE)}&q=Pagination`;
    const first = await (await get(`/sessions?${query}`)).text();
    expect(first.match(/<article class="session-row"/g)).toHaveLength(100);
    expect(first).toContain(`href="/sessions?${query.replaceAll("&", "&amp;")}&amp;page=2"`);
    const second = await (await get(`/sessions?${query}&page=2`)).text();
    expect(second.match(/<article class="session-row"/g)).toHaveLength(1);
    expect(second).toContain(`/s/${id}`);
    const hostile = await (await get('/sessions?q=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')).text();
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


describe("projects reader", () => {
  async function project(name = "Projet test") {
    const slug = `ui-${crypto.randomUUID().slice(0, 8)}`;
    await env.DB.prepare("INSERT INTO projects VALUES (?, ?, ?, ?)").bind(slug, name, ALICE, Date.now()).run();
    await env.DB.prepare("INSERT INTO project_members VALUES (?, ?, 'owner', ?, ?)").bind(slug, ALICE, ALICE, Date.now()).run();
    return slug;
  }

  it("shows only memberships with roles, live counts and filtered session links", async () => {
    const id = await seed("Live project session");
    const expired = await seed("Expired project session");
    await env.DB.prepare("UPDATE sessions SET last_synced_at = 0 WHERE id = ?").bind(expired).run();
    // Other tests share the DB and fill "team", so count in a project of our own.
    const own = await project("Counted project");
    await env.DB.prepare("UPDATE project_members SET role = 'writer' WHERE project = ?").bind(own).run();
    await env.DB.prepare("UPDATE sessions SET project = ? WHERE id IN (?, ?)").bind(own, id, expired).run();
    const hidden = await project("Hidden project");
    await env.DB.prepare("UPDATE project_members SET email = ? WHERE project = ?").bind(BOB, hidden).run();
    const response = await get("/projects");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Projets");
    expect(html).toContain("Écriture");
    expect(html.replace(/<[^>]*>/g, "")).toContain("1 session");
    expect(html).toContain(`href="/projects/${own}"`);
    expect(html).not.toContain("Hidden project");
    expect(html).not.toContain(`/projects/${own}/settings`);
    expect(await (await get("/")).text()).toContain('href="/projects"');
    expect(await (await get(`/projects/${own}`)).text()).toContain(`/s/${id}`);
    expect(await (await get(`/projects/${hidden}`)).text()).not.toContain(`/s/${id}`);
    expect((await SELF.fetch(ORIGIN + "/projects")).status).toBe(401);
  });

  it.each([null, "writer", "reader"])("hides settings from %s", async (role) => {
    const slug = await project("Secret project name");
    await env.DB.prepare("DELETE FROM project_members WHERE project = ?").bind(slug).run();
    if (role) await env.DB.prepare("INSERT INTO project_members VALUES (?, ?, ?, ?, 0)").bind(slug, ALICE, role, BOB).run();
    const response = await get(`/projects/${slug}/settings`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Secret project name");
  });

  it("gives owners member metadata, role controls and an add form", async () => {
    const slug = await project();
    await env.DB.prepare("INSERT INTO project_members VALUES (?, ?, 'reader', ?, 0)").bind(slug, BOB, ALICE).run();
    const response = await get(`/projects/${slug}/settings`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
    const html = await response.text();
    for (const text of [ALICE, BOB, "Ajouté par", "Ajouté le", "Ajouter un membre", "Enregistrer", "Retirer"]) expect(html).toContain(text);
    for (const role of ["owner", "writer", "reader"]) expect(html).toContain(`value="${role}"`);
    expect(html).toContain('type="email"');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('method="post"');
    expect(await (await get(`/projects/${slug}`)).text()).toContain(`/projects/${slug}/settings`);
    expect((await get('/projects/missing/settings')).status).toBe(404);
    expect((await SELF.fetch(ORIGIN + `/projects/${slug}/settings`)).status).toBe(401);
  });

  it("escapes hostile project names, member emails and added_by values", async () => {
    const attack = '\"><img src=x onerror=alert(1)>';
    const slug = await project(attack);
    await env.DB.prepare("INSERT INTO project_members VALUES (?, ?, 'reader', ?, 0)").bind(slug, attack + '@example.com', attack).run();
    for (const path of ["/projects", `/projects/${slug}/settings`]) {
      const html = await (await get(path)).text();
      expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
      expect(html).not.toContain('<img');
      expect(html.match(/<script /g)).toHaveLength(1);
    }
  });
});
