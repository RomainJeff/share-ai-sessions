-- A session continued after compaction gets a new id: continued_from links it to its parent (same owner).
ALTER TABLE sessions ADD COLUMN continued_from TEXT;
