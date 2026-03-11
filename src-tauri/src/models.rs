use rusqlite::Row;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Paper {
    pub id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    #[serde(rename = "abstract")]
    pub abstract_text: String,
    pub summary: String,
    pub category: String,
    pub tags: Vec<String>,
    pub file_name: String,
    pub original_path: String,
    pub managed_path: String,
    pub thumbnail_path: Option<String>,
    pub is_favorite: bool,
    pub read_status: String,
    pub notes: String,
    pub has_notes: bool,
    pub file_hash: Option<String>,
    pub last_opened_at: Option<String>,
    pub last_read_page: Option<i32>,
    pub last_read_at: Option<String>,
    pub metadata_completed_at: Option<String>,
    pub is_metadata_incomplete: bool,
    pub duplicate_key: Option<String>,
    pub duplicate_reason: Option<String>,
    pub title_source: String,
    pub title_confidence: i32,
    pub title_pending_confirmation: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl Paper {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        let authors_json: String = row.get("authors")?;
        let tags_json: String = row.get("tags")?;
        let notes: String = row.get("notes")?;
        let has_notes = match row.as_ref().column_index("has_notes") {
            Ok(idx) => row.get::<_, i64>(idx).unwrap_or(0) == 1,
            Err(_) => !notes.trim().is_empty(),
        };
        let title_source = match row.as_ref().column_index("title_source") {
            Ok(idx) => row
                .get::<_, String>(idx)
                .unwrap_or_else(|_| "filename".to_string()),
            Err(_) => "filename".to_string(),
        };
        let title_confidence = match row.as_ref().column_index("title_confidence") {
            Ok(idx) => row.get::<_, i32>(idx).unwrap_or(0),
            Err(_) => 0,
        };
        let title_pending_confirmation = match row.as_ref().column_index("title_pending_confirmation") {
            Ok(idx) => row.get::<_, i64>(idx).unwrap_or(1) == 1,
            Err(_) => true,
        };
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            authors: serde_json::from_str(&authors_json).unwrap_or_default(),
            year: row.get("year")?,
            venue: row.get("venue")?,
            doi: row.get("doi")?,
            arxiv_id: row.get("arxiv_id")?,
            abstract_text: row.get("abstract_text")?,
            summary: row.get("summary")?,
            category: row.get("category")?,
            tags: serde_json::from_str(&tags_json).unwrap_or_default(),
            file_name: row.get("file_name")?,
            original_path: row.get("original_path")?,
            managed_path: row.get("managed_path")?,
            thumbnail_path: row.get("thumbnail_path")?,
            is_favorite: row.get::<_, i64>("is_favorite")? == 1,
            read_status: row.get("read_status")?,
            notes,
            has_notes,
            file_hash: row.get("file_hash")?,
            last_opened_at: row.get("last_opened_at")?,
            last_read_page: row.get("last_read_page")?,
            last_read_at: row.get("last_read_at")?,
            metadata_completed_at: row.get("metadata_completed_at")?,
            is_metadata_incomplete: row.get::<_, i64>("is_metadata_incomplete")? == 1,
            duplicate_key: row.get("duplicate_key")?,
            duplicate_reason: row.get("duplicate_reason")?,
            title_source,
            title_confidence,
            title_pending_confirmation,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportFailedItem {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: Vec<Paper>,
    pub skipped: Vec<ImportFailedItem>,
    pub failed: Vec<ImportFailedItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub reader_mode: String,
    pub external_reader_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataEnrichResult {
    pub updated: Option<Paper>,
    pub source: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkMetadataEnrichResult {
    pub success_count: usize,
    pub failed: Vec<ImportFailedItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteItem {
    pub id: String,
    pub paper_id: String,
    pub note_type: String,
    pub content: String,
    pub selected_text: Option<String>,
    pub page_number: Option<i32>,
    pub comment: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl NoteItem {
    pub fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            paper_id: row.get("paper_id")?,
            note_type: row.get("note_type")?,
            content: row.get("content")?,
            selected_text: row.get("selected_text")?,
            page_number: row.get("page_number")?,
            comment: row.get("comment")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateNoteInput {
    pub paper_id: String,
    pub note_type: String,
    pub content: String,
    pub selected_text: Option<String>,
    pub page_number: Option<i32>,
    pub comment: Option<String>,
}
