-- Index of shared sessions. The JSONL itself lives in R2 under sessions/<id>/.
-- Timestamps are epoch milliseconds.
CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  owner_email       TEXT NOT NULL,
  owner_name        TEXT NOT NULL,
  project           TEXT NOT NULL,
  branch            TEXT,
  title             TEXT,
  summary           TEXT,
  cwd_base          TEXT,
  model             TEXT,
  cc_version        TEXT,
  msg_count         INTEGER NOT NULL DEFAULT 0,
  tokens            INTEGER NOT NULL DEFAULT 0,
  bytes             INTEGER NOT NULL DEFAULT 0,
  tags              TEXT,
  forked_from       TEXT,
  forked_from_owner TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  last_synced_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_updated ON sessions (last_synced_at, updated_at);
