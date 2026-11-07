-- A relayed session is hosted by another app (e.g. T3 Code): Session Share keeps its metadata and a link,
-- never a transcript. Such rows have bytes = 0, segment_count = 0 and no R2 object.
ALTER TABLE sessions ADD COLUMN external_app TEXT;
ALTER TABLE sessions ADD COLUMN external_url TEXT;
ALTER TABLE sessions ADD COLUMN external_expires_at INTEGER;
