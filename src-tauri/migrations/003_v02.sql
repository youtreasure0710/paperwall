ALTER TABLE papers ADD COLUMN file_hash TEXT;
ALTER TABLE papers ADD COLUMN last_opened_at TEXT;
ALTER TABLE papers ADD COLUMN metadata_completed_at TEXT;
ALTER TABLE papers ADD COLUMN is_metadata_incomplete INTEGER NOT NULL DEFAULT 1;
ALTER TABLE papers ADD COLUMN duplicate_key TEXT;
ALTER TABLE papers ADD COLUMN duplicate_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_papers_file_hash ON papers(file_hash);
CREATE INDEX IF NOT EXISTS idx_papers_doi ON papers(doi);
CREATE INDEX IF NOT EXISTS idx_papers_arxiv ON papers(arxiv_id);
CREATE INDEX IF NOT EXISTS idx_papers_duplicate_key ON papers(duplicate_key);
CREATE INDEX IF NOT EXISTS idx_papers_last_opened_at ON papers(last_opened_at);
CREATE INDEX IF NOT EXISTS idx_papers_metadata_incomplete ON papers(is_metadata_incomplete);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
