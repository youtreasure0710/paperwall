ALTER TABLE papers ADD COLUMN title_source TEXT NOT NULL DEFAULT 'filename';
ALTER TABLE papers ADD COLUMN title_confidence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE papers ADD COLUMN title_pending_confirmation INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_papers_title_source ON papers(title_source);
CREATE INDEX IF NOT EXISTS idx_papers_title_pending ON papers(title_pending_confirmation);
