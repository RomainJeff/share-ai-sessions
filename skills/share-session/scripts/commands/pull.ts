import { harnessOf, resumeHistory, readerLine, portableContent, type Harness } from "../transcript.ts";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { api, ClientError } from "../lib.ts";
import { readManifest, writeManifest } from "../manifest.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const enc = (s: string) => s.replace(/[^A-Za-z0-9]/g, "-");
type Line = Record<string, any>;
type Bundle = {
  session: { id: string; owner_email: string; owner_name: string; project: string; repo?: string | null; branch: string | null; cwd_base: string | null };
  jsonl: string;
  // Paths relative to tool-results/, with base64 bytes. Absent until external files are bundled.
  tool_results?: Record<string, string>;
};

function transplant(bundle: Bundle, id: string, cwd: string, harness: Harness): string {
  const source: Line[] = [];
  for (const raw of bundle.jsonl.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const line = JSON.parse(raw);
      if (!line || typeof line !== "object" || Array.isArray(line)) throw new Error();
      source.push(line);
    } catch { throw new ClientError("invalid_jsonl", "Bundle contains an invalid transcript line"); }
  }
  const originalHarness = harnessOf(source);
  if (originalHarness === "codex" && !bundle.session.cwd_base) bundle = { ...bundle, session: { ...bundle.session, cwd_base: source.find(l => l.type === "session_meta")?.payload.cwd } };
  if (originalHarness !== harness) {
    let parent: string | null = null;
    const converted: Line[] = [];
    for (const line of originalHarness === "codex" ? resumeHistory(source) : source) {
      const record = readerLine(line);
      if (!record) continue;
      const blocks = portableContent(record.message?.content);
      if (!blocks.length) continue;
      const uuid = randomUUID();
      converted.push({ ...record, isSidechain: false, userType: "external", isMeta: record.isMeta || (record.type === "user" && Array.isArray(record.message?.content) && record.message.content.some((b: Line) => b.type === "tool_result")), uuid, parentUuid: parent, sessionId: bundle.session.id, cwd: bundle.session.cwd_base,
        message: { role: record.type, content: blocks.length === 1 && blocks[0]?.type === "text" ? blocks[0].text : blocks } });
      parent = uuid;
    }
    // Claude transplant below supplies path remapping and provenance for both destinations.
    bundle = { ...bundle, jsonl: converted.map(l => JSON.stringify(l)).join("\n") };
  }
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
  const remap = (value: any): any => {
    if (typeof value === "string") {
      // Tool arguments may themselves be serialized JSON. Remap at the right escaping depth.
      try {
        const nested = JSON.parse(value);
        if (nested && typeof nested === "object") return JSON.stringify(remap(nested));
      } catch {}
      value = value.replaceAll(bundle.session.id, id);
      return originalCwd ? value.replaceAll(enc(originalCwd), enc(cwd)).replaceAll(originalCwd, () => cwd) : value;
    }
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)]));
    return value;
  };
  for (const raw of bundle.jsonl.split("\n")) {
    if (!raw.trim()) continue;
    let line: Line;
    try {
      line = remap(JSON.parse(raw));
      if (!line || typeof line !== "object" || Array.isArray(line)) throw new Error();
    } catch { throw new ClientError("invalid_jsonl", "Bundle contains an invalid transcript line"); }
    if (line.type === "assistant" && Array.isArray(line.message?.content)) {
      line.message.content = line.message.content.filter((b: { type?: string } | null) => b?.type !== "thinking" && b?.type !== "redacted_thinking");
      if (!line.message.content.length) {
        if (typeof line.uuid === "string") removed.set(line.uuid, line.parentUuid ?? null);
        continue;
      }
    }
    if (originalHarness === "codex" && harness === "codex") {
      if (!["session_meta", "response_item", "event_msg", "compacted"].includes(line.type) || (line.type === "response_item" && ["reasoning", "additional_tools"].includes(line.payload?.type))) continue;
      if ((line.type === "response_item" || line.type === "event_msg") && !line.payload) continue;
      if (line.type === "event_msg" && (/^agent_reasoning/.test(line.payload?.type ?? "") || line.payload?.item?.type === "Reasoning")) continue;
      if (line.type === "compacted" && Array.isArray(line.payload?.replacement_history)) {
        line.payload.replacement_history = line.payload.replacement_history.filter((p: Line) => !["reasoning", "additional_tools"].includes(p.type));
      }
      if (line.type === "session_meta") line.payload = { ...line.payload, id, session_id: id, cwd, source: "cli", originator: "share-session", base_instructions: null };
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
  if (harness === "codex") {
    const now = new Date().toISOString();
    const message = (line: Line): Line => ({ timestamp: line.timestamp ?? now, type: "response_item", payload: {
      type: "message", role: line.isMeta ? "developer" : line.type,
      content: portableContent(line.message?.content).map((b: Line) => {
        if (b.type === "image") {
          const url = b.source?.url ?? (b.source?.type === "base64" ? `data:${b.source.media_type};base64,${b.source.data}` : undefined);
          return url ? { type: "input_image", image_url: url } : { type: "input_text", text: `[Historical image] ${JSON.stringify(b)}` };
        }
        return { type: line.type === "assistant" ? "output_text" : "input_text", text: b.text };
      }),
    } });
    if (originalHarness === "codex") return [...lines.slice(0, -1), message(lines.at(-1)!)].map(l => JSON.stringify(l)).join("\n") + "\n";
    return [{ timestamp: now, type: "session_meta", payload: { id, timestamp: now, cwd, originator: "share-session", cli_version: "unknown", source: "cli", model_provider: "openai" } }, ...lines.flatMap(line => {
      const item = message(line);
      if (line.isMeta) return [item];
      const text = portableContent(line.message?.content).filter((b: Line) => b.type === "text").map((b: Line) => b.text).join("\n");
      const event = { timestamp: item.timestamp, type: "event_msg", payload: line.type === "assistant"
        ? { type: "agent_message", message: text, phase: "final_answer" }
        : { type: "user_message", message: text, images: [], local_images: [], text_elements: [] } };
      return [event, item];
    })].map(l => JSON.stringify(l)).join("\n") + "\n";
  }
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}

export async function pull(args: string[]): Promise<unknown> {
  let parsed: ReturnType<typeof parseArgs>;
  try { parsed = parseArgs({ args, allowPositionals: true, options: { target: { type: "string" }, harness: { type: "string" } } }); }
  catch { throw new ClientError("usage", "Usage: client.ts pull <id> [--harness claude|codex] [--target terminal|desktop]"); }
  const [origin] = parsed.positionals;
  if (parsed.positionals.length !== 1 || !origin || !UUID.test(origin)) throw new ClientError("usage", "Provide one session UUID");
  const harness = parsed.values.harness ?? (process.env.CLAUDE_CODE_ENTRYPOINT || process.env.CLAUDE_SESSION_ID ? "claude" : process.env.CODEX_THREAD_ID || process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE ? "codex" : "claude");
  if (harness !== "claude" && harness !== "codex") throw new ClientError("usage", "Harness must be claude or codex");
  const target = parsed.values.target ?? (harness === "claude" && /desktop/i.test(process.env.CLAUDE_CODE_ENTRYPOINT ?? "") ? "desktop" : "terminal");
  if (target !== "terminal" && target !== "desktop") throw new ClientError("usage", "Target must be terminal or desktop");
  if (target === "desktop") throw new ClientError("unsupported_target", `${harness === "codex" ? "Codex" : "Claude"} Desktop import is pending location/index verification (HITL); use --target terminal`);

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
  const jsonl = transplant(bundle, id, cwd, harness);
  const now = new Date().toISOString();
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  const dir = harness === "codex" ? join(codexHome, "sessions", ...now.slice(0, 10).split("-")) : join(homedir(), ".claude/projects", enc(cwd));
  const path = join(dir, harness === "codex" ? `rollout-${now.slice(0, 19).replaceAll(":", "-")}-${id}.jsonl` : `${id}.jsonl`);
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
  return { id, forked_from: origin, path, target, harness, source_harness: harnessOf(bundle.jsonl.split("\n").filter(l => l.trim()).map(l => JSON.parse(l))), command: harness === "codex" ? `codex resume ${id}` : `claude --resume ${id}` };
}
