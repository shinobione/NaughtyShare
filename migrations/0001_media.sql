CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (
    content_type LIKE 'image/%' OR content_type LIKE 'video/%'
  ),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_created_at
  ON media(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_uploaded_by
  ON media(uploaded_by);
