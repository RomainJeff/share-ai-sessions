import { ClientError } from "../lib.ts";
import { readManifest, writeManifest } from "../manifest.ts";

export async function stop(args: string[]): Promise<unknown> {
  const id = !args.length || args[0] === "current" ? process.env.CLAUDE_SESSION_ID : args[0];
  if (!id || args.length > 1) throw new ClientError("usage", "Usage: client.ts stop <id>|current (current requires CLAUDE_SESSION_ID)");
  const manifest = await readManifest();
  const stopped = Boolean(manifest.sessions[id]);
  delete manifest.sessions[id];
  await writeManifest(manifest);
  return { id, stopped };
}
