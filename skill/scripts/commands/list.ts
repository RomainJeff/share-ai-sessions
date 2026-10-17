import { parseArgs } from "node:util";
import { api } from "../lib.ts";

type Row = { id: string; title: string | null; project: string; owner_email: string; updated_at: number; msg_count: number };

export async function list(args: string[]): Promise<unknown> {
  const { values } = parseArgs({
    args,
    options: { project: { type: "string" }, author: { type: "string" }, mine: { type: "boolean" }, q: { type: "string" } },
  });
  const query = new URLSearchParams();
  if (values.project) query.set("project", values.project);
  if (values.author) query.set("author", values.author);
  if (values.mine) query.set("mine", "1");
  if (values.q) query.set("q", values.q);

  const { sessions } = (await api(`/api/sessions?${query}`)) as { sessions: Row[] };
  return sessions.map((s) => ({
    id: s.id.slice(0, 8),
    title: s.title,
    project: s.project,
    author: s.owner_email,
    date: new Date(s.updated_at).toISOString().slice(0, 16).replace("T", " "),
    messages: s.msg_count,
  }));
}
