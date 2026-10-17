import { ClientError } from "../lib.ts";
import { resolveSession, syncSession } from "./sync.ts";

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
    const session = await resolveSession(id, payload.transcript_path);
    if (session) await syncSession(id, session);
  } catch (error) {
    if (error instanceof ClientError && ["login_required", "cloudflared_missing", "unauthorized", "token_expired", "invalid_token"].includes(error.code)) {
      if (!active) process.stdout.write(JSON.stringify({
        decision: "block",
        reason: `share-session: sync pending. Call the get_token MCP tool with scope "write" and session_id "${id}", then run SESSION_TOKEN=<token> node cli/client.ts sync ${id}. Keep the token only in the command environment.`,
      }) + "\n");
      return;
    }
    process.stderr.write(`share-session: Stop sync skipped (${error instanceof ClientError ? error.code : "internal_error"})\n`);
  }
}
