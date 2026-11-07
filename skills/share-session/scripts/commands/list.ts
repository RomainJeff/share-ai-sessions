import { parseArgs } from "node:util";
import { api, ClientError } from "../lib.ts";

type Row = {
  id: string; title: string | null; project: string; repo: string | null; owner_email: string; last_synced_at: number; msg_count: number;
  external_app?: string | null; external_url?: string | null; external_expires_at?: number | null; done_at?: number | null;
};

export async function list(args: string[]): Promise<unknown> {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: "string" }, repo: { type: "string" }, author: { type: "string" }, mine: { type: "boolean" }, q: { type: "string" },
      status: { type: "string" },
    },
  });
  if (values.status !== undefined && values.status !== "active" && values.status !== "done") {
    throw new ClientError("usage", "--status must be active or done");
  }
  const query = new URLSearchParams();
  if (values.project) query.set("project", values.project);
  if (values.repo) query.set("repo", values.repo);
  if (values.author) query.set("author", values.author);
  if (values.mine) query.set("mine", "1");
  if (values.q) query.set("q", values.q);
  if (values.status) query.set("status", values.status);

  const { sessions } = (await api(`/api/sessions?${query}`)) as { sessions: Row[] };
  return sessions.map((s) => ({
    id: s.id.slice(0, 8),
    title: s.title,
    project: s.project,
    repo: s.repo || null,
    author: s.owner_email,
    date: new Date(s.last_synced_at).toISOString().slice(0, 16).replace("T", " "),
    messages: s.msg_count,
    done: s.done_at == null ? null : new Date(s.done_at).toISOString(),
    ...(s.external_app ? {
      app: s.external_app, url: s.external_url,
      expires: s.external_expires_at == null ? null : new Date(s.external_expires_at).toISOString(),
    } : {}),
  }));
}
