use std::path::Path;

use chrono::Utc;
use rusqlite::{params, Connection};

use crate::models::{AppSettings, Category, CreateNoteInput, NoteItem, Paper};

const MIGRATION_001: &str = include_str!("../migrations/001_init.sql");
const MIGRATION_002: &str = include_str!("../migrations/002_categories.sql");
const MIGRATION_003: &str = include_str!("../migrations/003_v02.sql");
const MIGRATION_004: &str = include_str!("../migrations/004_reading_notes.sql");
const MIGRATION_005: &str = include_str!("../migrations/005_title_quality.sql");
const DEFAULT_CATEGORIES: [&str; 10] = [
    "LLM",
    "NLP",
    "CV",
    "Multimodal",
    "Agent",
    "RAG",
    "RL",
    "Survey",
    "Systems",
    "Other",
];

pub fn open(db_path: &Path) -> Result<Connection, String> {
    Connection::open(db_path).map_err(|e| format!("open db failed: {e}"))
}

pub fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(MIGRATION_001)
        .map_err(|e| format!("migrate failed: {e}"))?;
    conn.execute_batch(MIGRATION_002)
        .map_err(|e| format!("migrate failed: {e}"))?;
    for stmt in MIGRATION_003.split(';') {
        let sql = stmt.trim();
        if sql.is_empty() {
            continue;
        }
        if let Err(e) = conn.execute_batch(sql) {
            let msg = e.to_string().to_lowercase();
            if msg.contains("duplicate column name") {
                continue;
            }
            return Err(format!("migrate failed: {e}"));
        }
    }
    for stmt in MIGRATION_004.split(';') {
        let sql = stmt.trim();
        if sql.is_empty() {
            continue;
        }
        if let Err(e) = conn.execute_batch(sql) {
            let msg = e.to_string().to_lowercase();
            if msg.contains("duplicate column name") {
                continue;
            }
            return Err(format!("migrate failed: {e}"));
        }
    }
    for stmt in MIGRATION_005.split(';') {
        let sql = stmt.trim();
        if sql.is_empty() {
            continue;
        }
        if let Err(e) = conn.execute_batch(sql) {
            let msg = e.to_string().to_lowercase();
            if msg.contains("duplicate column name") {
                continue;
            }
            return Err(format!("migrate failed: {e}"));
        }
    }
    Ok(())
}

pub fn ensure_default_categories(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))
        .map_err(|e| format!("count categories failed: {e}"))?;
    if count > 0 {
        return Ok(());
    }

    let now = Utc::now().to_rfc3339();
    for name in DEFAULT_CATEGORIES {
        conn.execute(
            "INSERT OR IGNORE INTO categories (name, created_at) VALUES (?1, ?2)",
            params![name, now],
        )
        .map_err(|e| format!("seed categories failed: {e}"))?;
    }
    Ok(())
}

pub fn ensure_other_category(conn: &Connection) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO categories (name, created_at) VALUES ('Other', ?1)",
        params![now],
    )
    .map_err(|e| format!("ensure Other category failed: {e}"))?;
    Ok(())
}

pub fn list_papers(conn: &Connection) -> Result<Vec<Paper>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT
                p.*,
                CASE
                    WHEN TRIM(COALESCE(p.notes, '')) <> '' THEN 1
                    WHEN EXISTS (SELECT 1 FROM notes n WHERE n.paper_id = p.id LIMIT 1) THEN 1
                    ELSE 0
                END AS has_notes
            FROM papers p
            ORDER BY datetime(p.created_at) DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], Paper::from_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_paper(conn: &Connection, id: &str) -> Result<Paper, String> {
    let mut stmt = conn
        .prepare(
            "SELECT
                p.*,
                CASE
                    WHEN TRIM(COALESCE(p.notes, '')) <> '' THEN 1
                    WHEN EXISTS (SELECT 1 FROM notes n WHERE n.paper_id = p.id LIMIT 1) THEN 1
                    ELSE 0
                END AS has_notes
            FROM papers p
            WHERE p.id = ?1",
        )
        .map_err(|e| e.to_string())?;
    stmt.query_row([id], Paper::from_row)
        .map_err(|e| format!("paper not found: {e}"))
}

pub fn insert_paper(conn: &Connection, paper: &Paper) -> Result<(), String> {
    conn.execute(
        "INSERT INTO papers (
            id, title, authors, year, venue, doi, arxiv_id, abstract_text, summary,
            category, tags, file_name, original_path, managed_path, thumbnail_path,
            is_favorite, read_status, notes, file_hash, last_opened_at,
            last_read_page, last_read_at, metadata_completed_at, is_metadata_incomplete, duplicate_key, duplicate_reason,
            title_source, title_confidence, title_pending_confirmation, created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
            ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31
        )",
        params![
            paper.id,
            paper.title,
            serde_json::to_string(&paper.authors).unwrap_or_else(|_| "[]".to_string()),
            paper.year,
            paper.venue,
            paper.doi,
            paper.arxiv_id,
            paper.abstract_text,
            paper.summary,
            paper.category,
            serde_json::to_string(&paper.tags).unwrap_or_else(|_| "[]".to_string()),
            paper.file_name,
            paper.original_path,
            paper.managed_path,
            paper.thumbnail_path,
            i64::from(paper.is_favorite),
            paper.read_status,
            paper.notes,
            paper.file_hash,
            paper.last_opened_at,
            paper.last_read_page,
            paper.last_read_at,
            paper.metadata_completed_at,
            i64::from(paper.is_metadata_incomplete),
            paper.duplicate_key,
            paper.duplicate_reason,
            paper.title_source,
            paper.title_confidence,
            i64::from(paper.title_pending_confirmation),
            paper.created_at,
            paper.updated_at
        ],
    )
    .map_err(|e| format!("insert failed: {e}"))?;
    Ok(())
}

pub fn update_paper(conn: &Connection, paper: &Paper) -> Result<Paper, String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE papers SET
            title = ?2,
            authors = ?3,
            year = ?4,
            venue = ?5,
            doi = ?6,
            arxiv_id = ?7,
            abstract_text = ?8,
            summary = ?9,
            category = ?10,
            tags = ?11,
            is_favorite = ?12,
            read_status = ?13,
            notes = ?14,
            file_hash = ?15,
            last_opened_at = ?16,
            last_read_page = ?17,
            last_read_at = ?18,
            metadata_completed_at = ?19,
            is_metadata_incomplete = ?20,
            duplicate_key = ?21,
            duplicate_reason = ?22,
            title_source = ?23,
            title_confidence = ?24,
            title_pending_confirmation = ?25,
            updated_at = ?26
        WHERE id = ?1",
        params![
            paper.id,
            paper.title,
            serde_json::to_string(&paper.authors).unwrap_or_else(|_| "[]".to_string()),
            paper.year,
            paper.venue,
            paper.doi,
            paper.arxiv_id,
            paper.abstract_text,
            paper.summary,
            paper.category,
            serde_json::to_string(&paper.tags).unwrap_or_else(|_| "[]".to_string()),
            i64::from(paper.is_favorite),
            paper.read_status,
            paper.notes,
            paper.file_hash,
            paper.last_opened_at,
            paper.last_read_page,
            paper.last_read_at,
            paper.metadata_completed_at,
            i64::from(paper.is_metadata_incomplete),
            paper.duplicate_key,
            paper.duplicate_reason,
            paper.title_source,
            paper.title_confidence,
            i64::from(paper.title_pending_confirmation),
            now
        ],
    )
    .map_err(|e| format!("update failed: {e}"))?;
    get_paper(conn, &paper.id)
}

pub fn update_partial(conn: &Connection, id: &str, sql: &str, value: &str) -> Result<Paper, String> {
    let now = Utc::now().to_rfc3339();
    let merged = format!("{sql}, updated_at = ?3 WHERE id = ?1");
    conn.execute(&merged, params![id, value, now])
        .map_err(|e| format!("update partial failed: {e}"))?;
    get_paper(conn, id)
}

pub fn update_partial_bool(conn: &Connection, id: &str, sql: &str, value: bool) -> Result<Paper, String> {
    let now = Utc::now().to_rfc3339();
    let merged = format!("{sql}, updated_at = ?3 WHERE id = ?1");
    conn.execute(&merged, params![id, i64::from(value), now])
        .map_err(|e| format!("update partial failed: {e}"))?;
    get_paper(conn, id)
}

pub fn set_managed_path(conn: &Connection, id: &str, file_name: &str, managed_path: &str) -> Result<Paper, String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE papers SET file_name = ?2, managed_path = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, file_name, managed_path, now],
    )
    .map_err(|e| format!("update managed path failed: {e}"))?;
    get_paper(conn, id)
}

pub fn delete_paper(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM papers WHERE id = ?1", params![id])
        .map_err(|e| format!("delete paper failed: {e}"))?;
    Ok(())
}

pub fn mark_opened(conn: &Connection, id: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE papers SET last_opened_at = ?2, updated_at = ?2 WHERE id = ?1",
        params![id, now],
    )
    .map_err(|e| format!("mark opened failed: {e}"))?;
    Ok(())
}

pub fn update_read_progress(conn: &Connection, id: &str, page: i32) -> Result<Paper, String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE papers SET last_opened_at = ?2, last_read_page = ?3, last_read_at = ?2, updated_at = ?2 WHERE id = ?1",
        params![id, now, page],
    )
    .map_err(|e| format!("update read progress failed: {e}"))?;
    get_paper(conn, id)
}

pub fn list_notes(conn: &Connection, paper_id: &str) -> Result<Vec<NoteItem>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM notes WHERE paper_id = ?1 ORDER BY datetime(created_at) DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([paper_id], NoteItem::from_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn create_note(conn: &Connection, note: &CreateNoteInput) -> Result<NoteItem, String> {
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO notes (id, paper_id, note_type, content, selected_text, page_number, comment, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id,
            note.paper_id,
            note.note_type,
            note.content,
            note.selected_text,
            note.page_number,
            note.comment,
            now,
            now
        ],
    )
    .map_err(|e| format!("create note failed: {e}"))?;
    get_note(conn, &id)
}

pub fn get_note(conn: &Connection, id: &str) -> Result<NoteItem, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM notes WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row([id], NoteItem::from_row)
        .map_err(|e| format!("note not found: {e}"))
}

pub fn delete_note(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|e| format!("delete note failed: {e}"))?;
    Ok(())
}

pub fn update_note_comment(conn: &Connection, id: &str, comment: &str) -> Result<NoteItem, String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE notes SET comment = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, comment, now],
    )
    .map_err(|e| format!("update note comment failed: {e}"))?;
    get_note(conn, id)
}

pub fn find_by_file_hash(conn: &Connection, file_hash: &str) -> Result<Option<Paper>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM papers WHERE file_hash = ?1 ORDER BY datetime(created_at) DESC LIMIT 1")
        .map_err(|e| e.to_string())?;
    match stmt.query_row([file_hash], Paper::from_row) {
        Ok(paper) => Ok(Some(paper)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn find_by_doi(conn: &Connection, doi: &str) -> Result<Option<Paper>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM papers WHERE lower(doi) = lower(?1) ORDER BY datetime(created_at) DESC LIMIT 1")
        .map_err(|e| e.to_string())?;
    match stmt.query_row([doi], Paper::from_row) {
        Ok(paper) => Ok(Some(paper)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn find_by_arxiv(conn: &Connection, arxiv_id: &str) -> Result<Option<Paper>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM papers WHERE lower(arxiv_id) = lower(?1) ORDER BY datetime(created_at) DESC LIMIT 1")
        .map_err(|e| e.to_string())?;
    match stmt.query_row([arxiv_id], Paper::from_row) {
        Ok(paper) => Ok(Some(paper)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn find_by_normalized_title(conn: &Connection, normalized_title: &str) -> Result<Option<Paper>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM papers")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], Paper::from_row)
        .map_err(|e| e.to_string())?;
    for row in rows {
        let paper = row.map_err(|e| e.to_string())?;
        let normalized = paper
            .title
            .to_lowercase()
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || c.is_ascii_whitespace())
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if !normalized.is_empty() && normalized == normalized_title {
            return Ok(Some(paper));
        }
    }
    Ok(None)
}

pub fn list_categories(conn: &Connection) -> Result<Vec<Category>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, created_at FROM categories ORDER BY datetime(created_at) ASC, id ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Category {
                id: row.get("id")?,
                name: row.get("name")?,
                created_at: row.get("created_at")?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn create_category(conn: &Connection, name: &str) -> Result<Category, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("分类名称不能为空".to_string());
    }
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO categories (name, created_at) VALUES (?1, ?2)",
        params![trimmed, now],
    )
    .map_err(|e| format!("create category failed: {e}"))?;
    let id = conn.last_insert_rowid();
    Ok(Category {
        id,
        name: trimmed.to_string(),
        created_at: now,
    })
}

pub fn upsert_category(conn: &Connection, name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO categories (name, created_at) VALUES (?1, ?2)",
        params![trimmed, now],
    )
    .map_err(|e| format!("upsert category failed: {e}"))?;
    Ok(())
}

pub fn rename_category(conn: &Connection, old_name: &str, new_name: &str) -> Result<Category, String> {
    let old_trimmed = old_name.trim();
    let new_trimmed = new_name.trim();
    if old_trimmed.is_empty() || new_trimmed.is_empty() {
        return Err("分类名称不能为空".to_string());
    }
    if old_trimmed == "Other" {
        return Err("保底分类 Other 不允许重命名".to_string());
    }
    if old_trimmed == new_trimmed {
        let mut stmt = conn
            .prepare("SELECT id, name, created_at FROM categories WHERE name = ?1 LIMIT 1")
            .map_err(|e| e.to_string())?;
        return stmt
            .query_row([old_trimmed], |row| {
                Ok(Category {
                    id: row.get("id")?,
                    name: row.get("name")?,
                    created_at: row.get("created_at")?,
                })
            })
            .map_err(|e| format!("分类不存在: {e}"));
    }

    let changed = conn
        .execute(
            "UPDATE categories SET name = ?2 WHERE name = ?1",
            params![old_trimmed, new_trimmed],
        )
        .map_err(|e| format!("重命名分类失败: {e}"))?;
    if changed == 0 {
        return Err("分类不存在或未变更".to_string());
    }

    conn.execute(
        "UPDATE papers SET category = ?2 WHERE category = ?1",
        params![old_trimmed, new_trimmed],
    )
    .map_err(|e| format!("同步论文分类失败: {e}"))?;

    let mut stmt = conn
        .prepare("SELECT id, name, created_at FROM categories WHERE name = ?1 LIMIT 1")
        .map_err(|e| e.to_string())?;
    stmt.query_row([new_trimmed], |row| {
        Ok(Category {
            id: row.get("id")?,
            name: row.get("name")?,
            created_at: row.get("created_at")?,
        })
    })
    .map_err(|e| format!("读取分类失败: {e}"))
}

pub fn delete_category(conn: &Connection, name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("分类名称不能为空".to_string());
    }
    if trimmed == "Other" {
        return Err("保底分类 Other 不允许删除".to_string());
    }

    upsert_category(conn, "Other")?;

    conn.execute(
        "UPDATE papers SET category = 'Other' WHERE category = ?1",
        params![trimmed],
    )
    .map_err(|e| format!("回退论文分类失败: {e}"))?;

    let affected = conn
        .execute("DELETE FROM categories WHERE name = ?1", params![trimmed])
        .map_err(|e| format!("删除分类失败: {e}"))?;
    if affected == 0 {
        return Err("分类不存在".to_string());
    }

    Ok(())
}

pub fn get_app_settings(conn: &Connection) -> Result<AppSettings, String> {
    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let mut reader_mode = "system".to_string();
    let mut external_reader_path: Option<String> = None;

    for row in rows {
        let (key, value) = row.map_err(|e| e.to_string())?;
        match key.as_str() {
            "reader_mode" => reader_mode = value,
            "external_reader_path" => {
                if !value.trim().is_empty() {
                    external_reader_path = Some(value);
                }
            }
            _ => {}
        }
    }

    Ok(AppSettings {
        reader_mode,
        external_reader_path,
    })
}

pub fn set_app_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now],
    )
    .map_err(|e| format!("set app setting failed: {e}"))?;
    Ok(())
}

pub fn save_app_settings(conn: &Connection, settings: &AppSettings) -> Result<AppSettings, String> {
    set_app_setting(conn, "reader_mode", &settings.reader_mode)?;
    set_app_setting(
        conn,
        "external_reader_path",
        settings.external_reader_path.as_deref().unwrap_or(""),
    )?;
    get_app_settings(conn)
}
