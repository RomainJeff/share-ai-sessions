-- Manual status, whatever produced the session: NULL while active, the time it was marked done (ms) otherwise.
ALTER TABLE sessions ADD COLUMN done_at INTEGER;
