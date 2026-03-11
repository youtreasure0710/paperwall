CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  authors TEXT NOT NULL DEFAULT '[]',
  year INTEGER,
  venue TEXT,
  doi TEXT,
  arxiv_id TEXT,
  abstract_text TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other',
  tags TEXT NOT NULL DEFAULT '[]',
  file_name TEXT NOT NULL,
  original_path TEXT NOT NULL,
  managed_path TEXT NOT NULL UNIQUE,
  thumbnail_path TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  read_status TEXT NOT NULL DEFAULT 'unread',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_papers_category ON papers(category);
CREATE INDEX IF NOT EXISTS idx_papers_read_status ON papers(read_status);
CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_created_at ON papers(created_at);
