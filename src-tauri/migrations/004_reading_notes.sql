ALTER TABLE papers ADD COLUMN last_read_page INTEGER;
ALTER TABLE papers ADD COLUMN last_read_at TEXT;

CREATE INDEX IF NOT EXISTS idx_papers_last_read_at ON papers(last_read_at);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  note_type TEXT NOT NULL,
  content TEXT NOT NULL,
  selected_text TEXT,
  page_number INTEGER,
  comment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_paper_id ON notes(paper_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);
