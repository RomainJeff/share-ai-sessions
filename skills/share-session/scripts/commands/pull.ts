import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { api, ClientError } from "../lib.ts";
import { readManifest, writeManifest } from "../manifest.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const enc = (s: string) => s.replace(/[^A-Za-z0-9]/g, "-");
const quoted = (s: string) => JSON.stringify(s).slice(1, -1);
type Line = Record<string, any>;
type Bundle = {
  session: { id: string; owner_email: string; owner_name: string; project: string; repo?: string | null; branch: string | null; cwd_base: string | null };
  jsonl: string;
  // Paths relative to tool-results/, with base64 bytes. Absent until external files are bundled.
  tool_results?: Record<string, string>;
};

function transplant(bundle: Bundle, id: string, cwd: string): string {
  const lines: Line[] = [];
  const removed = new Map<string, string | null>();
  let originalCwd = bundle.session.cwd_base;
  if (!originalCwd) {
    for (const raw of bundle.jsonl.split("\n")) {
      try {
        const cwd = JSON.parse(raw)?.cwd;
        if (typeof cwd === "string" && cwd) { originalCwd = cwd; break; }
      } catch {}
    }
  }
  for (let raw of bundle.jsonl.split("\n")) {
    if (!raw.trim()) continue;
    raw = raw.replaceAll(bundle.session.id, id);
    if (originalCwd) raw = raw.replaceAll(enc(originalCwd), enc(cwd)).replaceAll(quoted(originalCwd), () => quoted(cwd));
    let line: Line;
    try {
      line = JSON.parse(raw);
      if (!line || typeof line !== "object" || Array.isArray(line)) throw new Error();
    } catch { throw new ClientError("invalid_jsonl", "Bundle contains an invalid transcript line"); }
    if (line.type === "assistant" && Array.isArray(line.message?.content)) {
      line.message.content = line.message.content.filter((b: { type?: string } | null) => b?.type !== "thinking" && b?.type !== "redacted_thinking");
      if (!line.message.content.length) {
        if (typeof line.uuid === "string") removed.set(line.uuid, line.parentUuid ?? null);
        continue;
      }
    }
    lines.push(line);
  }
  for (const line of lines) {
    const visited = new Set<string>();
    while (removed.has(line.parentUuid)) {
      if (visited.has(line.parentUuid)) throw new ClientError("invalid_jsonl", "Transcript has a cyclic parent chain");
      visited.add(line.parentUuid);
      line.parentUuid = removed.get(line.parentUuid);
    }
  }
  const last = (key: string) => lines.map((l) => l[key]).filter((v) => typeof v === "string").at(-1);
  const origin = bundle.session;
  const note = `<session-share-context>
Origin session: ${origin.id}
Author: ${origin.owner_name} (${origin.owner_email})
Project: ${origin.project}${origin.repo ? ` (repo ${origin.repo})` : ""}
Branch: ${origin.branch ?? "unknown"}
Original cwd: ${originalCwd ?? "unknown"}
Current cwd: ${cwd}
This is a local fork. Re-check paths, access permissions and environment before relying on the history; files, credentials and tools may differ.
</session-share-context>`;
  lines.push({
    parentUuid: last("uuid") ?? null, isSidechain: false, type: "user", isMeta: true,
    message: { role: "user", content: [{ type: "text", text: note }] },
    uuid: randomUUID(), timestamp: new Date().toISOString(), userType: "external",
    entrypoint: last("entrypoint"), cwd, sessionId: id, version: last("version"), gitBranch: last("gitBranch") ?? origin.branch,
  });
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}

export async function pull(args: string[]): Promise<unknown> {
  let parsed: ReturnType<typeof parseArgs>;
  try { parsed = parseArgs({ args, allowPositionals: true, options: { target: { type: "string" } } }); }
  catch { throw new ClientError("usage", "Usage: client.ts pull <id> [--target terminal|desktop]"); }
  const [origin] = parsed.positionals;
  if (parsed.positionals.length !== 1 || !origin || !UUID.test(origin)) throw new ClientError("usage", "Provide one session UUID");
  const target = parsed.values.target ?? (/desktop/i.test(process.env.CLAUDE_CODE_ENTRYPOINT ?? "") ? "desktop" : "terminal");
  if (target !== "terminal" && target !== "desktop") throw new ClientError("usage", "Target must be terminal or desktop");
  if (target === "desktop") throw new ClientError("unsupported_target", "Claude Desktop import is pending location/index verification (HITL); use --target terminal");

  const bundle = await api(`/api/sessions/${origin}/bundle`, { headers: { Accept: "application/json" } }) as Bundle;
  if (!bundle?.session || bundle.session.id !== origin || typeof bundle.jsonl !== "string") throw new ClientError("invalid_bundle", "Expected session metadata and JSONL in the bundle");
  const files: { path: string; bytes: Buffer }[] = [];
  if (bundle.tool_results !== undefined && (!bundle.tool_results || typeof bundle.tool_results !== "object" || Array.isArray(bundle.tool_results))) throw new ClientError("invalid_bundle", "Invalid tool-results bundle");
  for (const [path, content] of Object.entries(bundle.tool_results ?? {})) {
    if (path.includes("\\") || path.includes("\0") || path.includes(":") || path.split("/").some((p) => !p || p === "." || p === "..") || typeof content !== "string") throw new ClientError("invalid_bundle", "Unsafe tool-result path or content");
    const bytes = Buffer.from(content, "base64");
    if (bytes.toString("base64") !== content) throw new ClientError("invalid_bundle", "Invalid tool-result base64");
    files.push({ path, bytes });
  }
  const id = randomUUID();
  const cwd = process.cwd();
  const jsonl = transplant(bundle, id, cwd);
  const dir = join(homedir(), ".claude/projects", enc(cwd));
  const path = join(dir, `${id}.jsonl`);
  await mkdir(dir, { recursive: true });
  await writeFile(path, jsonl, { flag: "wx", mode: 0o600 });
  for (const file of files) {
    const dest = join(dir, id, "tool-results", file.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, file.bytes, { flag: "wx", mode: 0o600 });
  }
  const manifest = await readManifest();
  (manifest.forks ??= {})[id] = { forked_from: origin };
  await writeManifest(manifest);
  return { id, forked_from: origin, path, target, command: `claude --resume ${id}` };
}
