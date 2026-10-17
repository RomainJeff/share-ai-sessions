const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Soft retention: every read adds `last_synced_at > ?` bound to this. Nothing is purged from R2. */
export const VISIBLE = "last_synced_at > ?";
export const visibleSince = (now = Date.now()) => now - RETENTION_MS;

export const segmentKey = (id: string, n: number) => `sessions/${id}/seg-${String(n).padStart(4, "0")}.jsonl`;
