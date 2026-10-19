import { identify, type Identity } from "./auth";
import { createSession } from "./routes/sessions-create";
import { listSessions } from "./routes/sessions-list";
import { projectsPage, projectSettingsPage } from "./routes/ui-projects";
import { sessionListPage, projectSessionsPage } from "./routes/ui-list";
import { homePage } from "./routes/ui-home";
import { sessionDetailPage } from "./routes/ui-detail";

import { moveSession } from "./routes/sessions-project";
import { patchSession } from "./routes/sessions-patch";
import { getSession } from "./routes/sessions-get";
import { sessionBundle } from "./routes/sessions-bundle";
import { skillDownload } from "./routes/skill-download";
import { createProject, deleteMember, getProject, listProjects, putMember } from "./routes/projects";

import { brokerInScope } from "./broker";
import { handleMcpHost } from "./routes/mcp";

type Handler = (request: Request, env: Env, who: Identity, params: Record<string, string>) => Promise<Response>;

// Preserve bookmarks from the former homepage-as-session-list while making / a real overview.
const legacyFilters = ["project", "repo", "author", "mine", "q", "from", "to", "page", "sort"];
function legacyListRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname === "/" && !legacyFilters.some(key => url.searchParams.has(key))) return null;
  const project = url.searchParams.get("project");
  if (url.pathname === "/sessions" && !project) return null;
  const path = project ? `/projects/${encodeURIComponent(project.toLowerCase())}` : "/sessions";
  url.searchParams.delete("project");
  const query = url.searchParams.toString();
  return new Response(null, { status: 302, headers: { Location: path + (query ? `?${query}` : ""), "Cache-Control": "private, no-store" } });
}
const landingPage: Handler = (request, env, who) => Promise.resolve(legacyListRedirect(request) ?? homePage(request, env, who));
const allSessionsPage: Handler = (request, env, who) => Promise.resolve(legacyListRedirect(request) ?? sessionListPage(request, env, who));

// One line per route; each handler lives in its own file under routes/.
const ROUTES: [method: string, pattern: URLPattern, handler: Handler][] = [
  ["PUT", new URLPattern({ pathname: "/api/sessions/:id/project" }), moveSession],
  ["PATCH", new URLPattern({ pathname: "/api/sessions/:id" }), patchSession],
  ["GET", new URLPattern({ pathname: "/api/sessions/:id" }), getSession],
  ["GET", new URLPattern({ pathname: "/api/sessions/:id/bundle" }), sessionBundle],
  ["POST", new URLPattern({ pathname: "/api/sessions" }), createSession],
  ["GET", new URLPattern({ pathname: "/api/sessions" }), listSessions],
  ["PUT", new URLPattern({ pathname: "/api/projects/:slug/members/:email" }), putMember],
  ["DELETE", new URLPattern({ pathname: "/api/projects/:slug/members/:email" }), deleteMember],
  ["GET", new URLPattern({ pathname: "/api/projects/:slug" }), getProject],
  ["POST", new URLPattern({ pathname: "/api/projects" }), createProject],
  ["GET", new URLPattern({ pathname: "/api/projects" }), listProjects],
  ["GET", new URLPattern({ pathname: "/projects" }), projectsPage],
  ["GET", new URLPattern({ pathname: "/projects/:slug/settings" }), projectSettingsPage],
  ["GET", new URLPattern({ pathname: "/projects/:slug" }), projectSessionsPage],
  ["GET", new URLPattern({ pathname: "/sessions" }), allSessionsPage],
  ["GET", new URLPattern({ pathname: "/" }), landingPage],
  ["GET", new URLPattern({ pathname: "/s/:id" }), sessionDetailPage],
  ["GET", new URLPattern({ pathname: "/share-session.skill" }), skillDownload],
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.origin === env.BROKER_ORIGIN && !url.pathname.startsWith("/api/")) return handleMcpHost(request, env, ctx);
    // Access guards the custom domain; the Worker checks the JWT itself anyway (defence in depth).
    const who = await identify(request, env);
    if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });

    if (who.brokerScope && !(await brokerInScope(request, who.brokerScope))) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    for (const [method, pattern, handler] of ROUTES) {
      const match = pattern.exec(request.url);
      if (match && request.method === method) {
        return handler(request, env, who, match.pathname.groups as Record<string, string>);
      }
    }
    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
