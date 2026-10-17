import { fileURLToPath } from "node:url";
import { ClientError } from "../lib.ts";
import { readManifest } from "../manifest.ts";
import { syncSession } from "./sync.ts";

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
    const entry = (await readManifest()).sessions[id];
    if (entry) await syncSession(id, { path: entry.path, strip: entry.strip ?? {} });
  } catch (error) {
    if (error instanceof ClientError && ["login_required", "cloudflared_missing", "unauthorized", "token_expired", "invalid_token"].includes(error.code)) {
      if (!active) process.stdout.write(JSON.stringify({
        decision: "block",
        reason: `share-session: sync pending. Call the get_token MCP tool with scope "write" and session_id "${id}", then run SESSION_TOKEN=<token> node ${JSON.stringify(fileURLToPath(new URL("../client.ts", import.meta.url)))} sync ${id}. Keep the token only in the command environment.`,
      }) + "\n");
      return;
    }
    process.stderr.write(`share-session: Stop sync skipped (${error instanceof ClientError ? error.code : "internal_error"})\n`);
  }
}
