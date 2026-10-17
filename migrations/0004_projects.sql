-- Projects group sessions by user choice, independent of the working directory, and carry access rights.
-- The git `owner/repo` the session came from stays as metadata, in `repo`.
ALTER TABLE sessions RENAME COLUMN project TO repo;
ALTER TABLE sessions ADD COLUMN project TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX IF NOT EXISTS sessions_project ON sessions (project, updated_at);
CREATE TABLE IF NOT EXISTS projects (
  slug       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- owner manages members, writer uploads and syncs own sessions, reader lists, reads and pulls.
CREATE TABLE IF NOT EXISTS project_members (
  project  TEXT NOT NULL REFERENCES projects (slug),
  email    TEXT NOT NULL,
  role     TEXT NOT NULL CHECK (role IN ('owner', 'writer', 'reader')),
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (project, email)
);
CREATE INDEX IF NOT EXISTS project_members_email ON project_members (email);
-- Sessions shared before projects existed, everyone who uploaded keeps seeing them, as owner.
INSERT OR IGNORE INTO projects (slug, name, created_by, created_at)
  SELECT 'legacy', 'Sessions d''avant les projets', lower(MIN(owner_email)), CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM sessions HAVING COUNT(*) > 0;
INSERT OR IGNORE INTO project_members (project, email, role, added_by, added_at)
  SELECT DISTINCT 'legacy', lower(owner_email), 'owner', 'migration', CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM sessions
