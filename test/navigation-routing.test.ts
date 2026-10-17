import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { mintJwt } from "./jwt";

it("preserves bookmarked list filters through canonical redirects, after authentication", async () => {
  const headers = { Authorization: `Bearer ${await mintJwt()}` };
  for (const [from, to] of [
    ["/?q=needle&author=alice%40example.com&page=2", "/sessions?q=needle&author=alice%40example.com&page=2"],
    ["/?project=TEAM&mine=1&q=hello", "/projects/team?mine=1&q=hello"],
    ["/sessions?project=team&repo=acme%2Frepo", "/projects/team?repo=acme%2Frepo"],
  ]) {
    const url = "https://sessions.example.com" + from;
    expect((await SELF.fetch(url, { redirect: "manual" })).status).toBe(401);
    const response = await SELF.fetch(url, { headers, redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(to);
    expect(response.headers.get("cache-control")).toContain("no-store");
  }
});
