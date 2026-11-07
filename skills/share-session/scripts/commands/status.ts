import { api, ClientError } from "../lib.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Mark a shared session done, or active again. Manual, or set by a tool that mirrors another app's status. */
export async function status(args: string[]): Promise<unknown> {
  const [rawId, value] = args;
  const id = rawId?.toLowerCase();
  if (args.length !== 2 || !id || !UUID.test(id) || (value !== "done" && value !== "active")) {
    throw new ClientError("usage", "Usage: client.ts status <session UUID> done|active");
  }
  const result = await api(`/api/sessions/${id}/status`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: value }),
  }) as { id: string; status: string; done_at: number | null };
  return { ...result, done_at: result.done_at === null ? null : new Date(result.done_at).toISOString() };
}
