import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { api, ClientError } from "../lib.ts";
import { detectProject } from "../project.ts";

type Line = Record<string, any>;

/** Metadata read from the JSONL itself. Declarative: the server only trusts the token for the owner. */
export function readMeta(jsonl: string, fileName: string) {
  const lines: Line[] = [];
  for (const raw of jsonl.split("\n")) {
    try {
      if (raw.trim()) lines.push(JSON.parse(raw));
    } catch {
      // tolerate a truncated last line (session still being written)
    }
  }
  const last = (pick: (l: Line) => unknown) => lines.map(pick).filter((v) => typeof v === "string" && v).at(-1) as string | undefined;
  const firstPrompt = lines.find((l) => l.type === "user" && !l.isMeta && typeof l.message?.content === "string")?.message.content as string | undefined;
  const assistantIds = new Set(lines.filter((l) => l.type === "assistant").map((l) => l.message?.id));
  const prompts = lines.filter((l) => l.type === "user" && !l.isMeta && typeof l.message?.content === "string").length;

  return {
    id: lines.find((l) => typeof l.sessionId === "string")?.sessionId ?? basename(fileName, ".jsonl"),
    cwd: lines.find((l) => typeof l.cwd === "string")?.cwd as string | undefined,
    branch: last((l) => l.gitBranch),
    cc_version: last((l) => l.version),
    model: last((l) => (l.type === "assistant" && l.message?.model !== "<synthetic>" ? l.message?.model : undefined)),
    title: last((l) => l.aiTitle) ?? last((l) => l.customTitle) ?? last((l) => (l.type === "summary" ? l.summary : undefined)) ?? firstPrompt?.slice(0, 80),
    msg_count: prompts + assistantIds.size,
  };
}

// T02: raw upload, no redaction yet (T04). Do not upload real sessions to prod before T04.
export async function upload(path: string): Promise<unknown> {
  let jsonl: string;
  try {
    jsonl = await readFile(path, "utf8");
  } catch {
    throw new ClientError("not_found", `Cannot read ${path}`);
  }
  const { cwd, ...meta } = readMeta(jsonl, path);
  const body = { ...meta, cwd_base: cwd, project: detectProject(cwd ?? process.cwd()) };

  const form = new FormData();
  form.set("meta", JSON.stringify(body));
  form.set("jsonl", new Blob([jsonl], { type: "application/x-ndjson" }), `${meta.id}.jsonl`);
  return api("/api/sessions", { method: "POST", body: form });
}
