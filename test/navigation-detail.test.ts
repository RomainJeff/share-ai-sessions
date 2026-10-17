import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { ALICE, mintJwt } from "./jwt";

it("keeps list context when opening a session, and rejects external or unrelated return targets", async () => {
  const id = crypto.randomUUID();
  const form = new FormData();
  form.set("meta", JSON.stringify({ id, project: "team", title: "Navigation return" }));
  form.set("jsonl", new File(['{"type":"user","message":{"content":"Hello"}}\n'], "s.jsonl"));
  const headers = { "Cf-Access-Jwt-Assertion": await mintJwt({ email: ALICE }) };
  expect((await SELF.fetch("https://sessions.example.com/api/sessions", { method: "POST", headers, body: form })).status).toBe(201);
  const links = async (returnTo: string) => {
    const response = await SELF.fetch(`https://sessions.example.com/s/${id}?return=${encodeURIComponent(returnTo)}`, { headers });
    const hrefs: string[] = [];
    await new HTMLRewriter().on("a[data-list-back]", { element(e) { hrefs.push(e.getAttribute("href")!.replaceAll("&amp;", "&")); } }).transform(response).text();
    return hrefs;
  };
  for (const path of ["/projects/team?mine=1&q=Navigation", "/sessions?author=alice%40example.com&page=2"]) {
    expect(await links(path)).toContain(path);
  }
  for (const path of ["//attacker.example/phish", "https://attacker.example", "/projects/hidden", "/projects/team/settings", "/\\attacker.example"]) {
    expect(await links(path)).toEqual(["/projects/team"]);
  }
  // A metadata-only move does not revive an expired session into the reader.
  await env.DB.prepare("UPDATE sessions SET last_synced_at = 0 WHERE id = ?").bind(id).run();
  expect((await SELF.fetch(`https://sessions.example.com/s/${id}`, { headers })).status).toBe(404);
});
