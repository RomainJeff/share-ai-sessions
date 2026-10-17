import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { ClientError } from "../lib.ts";
import { readManifest, writeManifest, type Entry } from "../manifest.ts";
import { syncSession } from "./sync.ts";

const client = fileURLToPath(new URL("../client.ts", import.meta.url));

/**
 * Claude Code continues a compacted conversation under a new session id: the new transcript
 * starts with the parent's compact_boundary line, same uuid. Structural match only ("uuid":"…"),
 * so a uuid quoted inside message text (escaped quotes) never links sessions.
 */
async function continuationParent(path: string, sessions: Record<string, Entry>): Promise<Entry | undefined> {
  let first: { type?: string; subtype?: string; uuid?: string } | undefined;
  // Stream: runs on every Stop of every unshared session, transcripts can be large.
  for await (const line of createInterface({ input: createReadStream(path) })) {
    let parsed;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (typeof parsed?.uuid === "string") { first = parsed; break; }
  }
  if (first?.type !== "system" || first.subtype !== "compact_boundary") return;
  const needle = `"uuid":${JSON.stringify(first.uuid)}`;
  for (const entry of Object.values(sessions)) {
    // ponytail: reads each shared transcript once per unknown session; only runs until the user is asked.
    const text = await readFile(entry.path, "utf8").catch(() => "");
    if (text.includes(needle)) return entry;
  }
}

export async function hookStop(): Promise<void> {
  let id = "";
  let active = false;
  try {
    let input = "";
    for await (const chunk of process.stdin) input += chunk.toString();
    const payload = JSON.parse(input);
    if (typeof payload?.session_id !== "string" || typeof payload?.transcript_path !== "string") {
      throw new ClientError("invalid_hook_input", "Expected session_id and transcript_path");
    }
    id = payload.session_id;
    active = payload.stop_hook_active === true;
    // Manifest only: transcript text is not consent (pasted or tool-read content could carry a marker).
    const manifest = await readManifest();
    const entry = manifest.sessions[id];
    if (entry) await syncSession(id, { path: entry.path, strip: entry.strip ?? {} });
    else if (!manifest.stopped?.[id] && !manifest.forks?.[id] && !manifest.continuations?.[id]) {
      const parent = await continuationParent(payload.transcript_path, manifest.sessions);
      if (!parent) return;
      // Record before blocking so the user is asked once; this is not consent, upload still needs --confirm.
      (manifest.continuations ??= {})[id] = { continued_from: parent.id };
      await writeManifest(manifest);
      if (active) return;
      const flags = `${parent.strip?.stripThinking ? " --strip-thinking" : ""}${parent.strip?.stripToolResults ? " --strip-tool-results" : ""}`;
      const command = `node ${JSON.stringify(client)} upload ${JSON.stringify(payload.transcript_path)}${flags}`;
      process.stdout.write(JSON.stringify({
        decision: "block",
        reason: `share-session: this session continues shared session ${parent.id} after compaction, but it is not shared. Ask the user whether to share it too. Only if they agree: run ${command}, show them the preview, and after their explicit consent rerun it with --confirm <hash>. Never upload without consent.`,
      }) + "\n");
    }
  } catch (error) {
    if (error instanceof ClientError && ["login_required", "cloudflared_missing", "unauthorized", "token_expired", "invalid_token"].includes(error.code)) {
      if (!active) process.stdout.write(JSON.stringify({
        decision: "block",
        reason: `share-session: sync pending. Call the get_token MCP tool with scope "write" and session_id "${id}", then run SESSION_TOKEN=<token> node ${JSON.stringify(client)} sync ${id}. Keep the token only in the command environment.`,
      }) + "\n");
      return;
    }
    process.stderr.write(`share-session: Stop sync skipped (${error instanceof ClientError ? error.code : "internal_error"})\n`);
  }
}
