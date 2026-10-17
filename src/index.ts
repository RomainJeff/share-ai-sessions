import { identify, type Identity } from "./auth";
import { createSession } from "./routes/sessions-create";
import { listSessions } from "./routes/sessions-list";
import { sessionListPage } from "./routes/ui-list";
import { sessionDetailPage } from "./routes/ui-detail";

import { patchSession } from "./routes/sessions-patch";
import { getSession } from "./routes/sessions-get";
import { sessionBundle } from "./routes/sessions-bundle";

type Handler = (request: Request, env: Env, who: Identity, params: Record<string, string>) => Promise<Response>;

// One line per route; each handler lives in its own file under routes/.
const ROUTES: [method: string, pattern: URLPattern, handler: Handler][] = [
  ["PATCH", new URLPattern({ pathname: "/api/sessions/:id" }), patchSession],
  ["GET", new URLPattern({ pathname: "/api/sessions/:id" }), getSession],
  ["GET", new URLPattern({ pathname: "/api/sessions/:id/bundle" }), sessionBundle],
  ["POST", new URLPattern({ pathname: "/api/sessions" }), createSession],
  ["GET", new URLPattern({ pathname: "/api/sessions" }), listSessions],
  ["GET", new URLPattern({ pathname: "/" }), sessionListPage],
  ["GET", new URLPattern({ pathname: "/s/:id" }), sessionDetailPage],
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Access guards the custom domain; the Worker checks the JWT itself anyway (defence in depth).
    const who = await identify(request, env);
    if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });

    for (const [method, pattern, handler] of ROUTES) {
      const match = pattern.exec(request.url);
      if (match && request.method === method) {
        return handler(request, env, who, match.pathname.groups as Record<string, string>);
      }
    }
    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
