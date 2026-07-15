use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::process::Command;

use base64::Engine as _;
use chrono::Utc;
use percent_encoding::percent_decode_str;
use pdfium_render::prelude::*;
use tauri::State;
use url::Url;
use uuid::Uuid;

use crate::db;
use crate::models::{
    AppSettings, BulkMetadataEnrichResult, Category, CreateNoteInput, ImportFailedItem, ImportResult,
    MetadataEnrichResult, NoteItem, Paper,
};
use crate::services::classifier::classify;
use crate::services::dedupe::{compute_file_hash, detect_duplicate};
use crate::services::external_reader::open_pdf_with_settings;
use crate::services::file_ops::{copy_into_library, ensure_dir, rename_managed_file};
use crate::services::metadata::parse_metadata;
use crate::services::metadata_enrichment::{enrich_metadata, EnrichedMetadata};
use crate::services::rename::suggestion;
use crate::AppState;

fn safe_extract_text_for_import(pdf_path: &Path) -> String {
    let path_display = pdf_path.display().to_string();
    log::info!("[import] fulltext_extract_start path={path_display}");
    let started = std::time::Instant::now();

    let extracted = catch_unwind(AssertUnwindSafe(|| pdf_extract::extract_text(pdf_path)));
    match extracted {
        Ok(Ok(text)) => {
            log::info!(
                "[import] fulltext_extract_success path={} elapsed_ms={} text_len={}",
                path_display,
                started.elapsed().as_millis(),
                text.len()
            );
            text
        }
        Ok(Err(err)) => {
            log::warn!(
                "[import] fulltext_extract_failed path={} elapsed_ms={} err={}",
                path_display,
                started.elapsed().as_millis(),
                err
            );
            String::new()
        }
        Err(_) => {
            log::error!(
                "[import] fulltext_extract_panic_caught path={} elapsed_ms={} (fallback to empty text)",
                path_display,
                started.elapsed().as_millis()
            );
            String::new()
        }
    }
}

fn normalize_user_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if trimmed.starts_with("file://") {
        if let Ok(url) = Url::parse(trimmed) {
            if let Ok(path) = url.to_file_path() {
                return path.to_string_lossy().to_string();
            }
        }
    }

    // Some environments may pass plain paths with percent-encoding
    // (for example "/Users/me/My%20Paper.pdf"). Decode as a safe fallback.
    if trimmed.contains('%') {
        let decoded = percent_decode_str(trimmed).decode_utf8_lossy().to_string();
        if !decoded.trim().is_empty() {
            return decoded;
        }
    }

    trimmed.to_string()
}

fn metadata_preview(text: &str) -> String {
    text.chars().take(1600).collect::<String>().replace('\n', "\\n")
}

fn bind_pdfium_for_import() -> Result<Box<dyn PdfiumLibraryBindings>, String> {
    if let Ok(bindings) = Pdfium::bind_to_system_library() {
        log::info!("[import] pdfium_bind source=system");
        return Ok(bindings);
    }

    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            dirs.push(exe_dir.join("pdfium"));
            dirs.push(exe_dir.join("../Resources/pdfium"));
            dirs.push(exe_dir.join("../../Resources/pdfium"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.join("src-tauri/target/debug/pdfium"));
        dirs.push(cwd.join("src-tauri/target/release/pdfium"));
    }

    let mut last_err: Option<String> = None;
    for dir in dirs {
        let lib_path = Pdfium::pdfium_platform_library_name_at_path(&dir);
        if !Path::new(&lib_path).exists() {
            continue;
        }
        match Pdfium::bind_to_library(&lib_path) {
            Ok(bindings) => {
                log::info!(
                    "[import] pdfium_bind source=local path={}",
                    Path::new(&lib_path).display()
                );
                return Ok(bindings);
            }
            Err(err) => {
                last_err = Some(format!("{} ({})", err, Path::new(&lib_path).display()));
            }
        }
    }

    Err(last_err.unwrap_or_else(|| "no usable pdfium library found".to_string()))
}

fn extract_metadata_text_pdfium(pdf_path: &Path) -> Result<String, String> {
    let bindings = bind_pdfium_for_import()?;
    let pdfium = Pdfium::new(bindings);
    let doc = pdfium
        .load_pdf_from_file(pdf_path, None)
        .map_err(|e| format!("load pdf failed: {e}"))?;
    let page_count = doc.pages().len();
    let max_pages = page_count.min(2);
    let mut out = String::new();
    for idx in 0..max_pages {
        let page = doc
            .pages()
            .get(idx)
            .map_err(|e| format!("get page {} failed: {e}", idx + 1))?;
        let text = page
            .text()
            .map_err(|e| format!("extract page {} text failed: {e}", idx + 1))?
            .all();
        if !text.trim().is_empty() {
            out.push_str(&text);
            out.push('\n');
        }
    }
    Ok(out)
}

fn extract_metadata_text_lopdf(pdf_path: &Path) -> Result<String, String> {
    let doc = lopdf::Document::load(pdf_path).map_err(|e| format!("load with lopdf failed: {e}"))?;
    let mut pages: Vec<u32> = doc.get_pages().keys().copied().collect();
    pages.sort_unstable();
    pages.truncate(2);
    if pages.is_empty() {
        return Ok(String::new());
    }
    doc.extract_text(&pages)
        .map_err(|e| format!("lopdf extract_text failed: {e}"))
}

fn extract_metadata_text_for_import(pdf_path: &Path) -> (String, &'static str) {
    let path_display = pdf_path.display().to_string();

    log::info!(
        "[import] metadata extraction start source=pdfium-metadata path={}",
        path_display
    );
    let pdfium_started = std::time::Instant::now();
    match extract_metadata_text_pdfium(pdf_path) {
        Ok(text) if !text.trim().is_empty() => {
            log::info!(
                "[import] metadata extraction success source=pdfium-metadata path={} elapsed_ms={} chars={}",
                path_display,
                pdfium_started.elapsed().as_millis(),
                text.chars().count()
            );
            log::info!(
                "[import] metadata extraction preview source=pdfium-metadata path={} text={}",
                path_display,
                metadata_preview(&text)
            );
            return (text, "pdfium-metadata");
        }
        Ok(_) => {
            log::warn!(
                "[import] metadata extraction empty source=pdfium-metadata path={} elapsed_ms={}",
                path_display,
                pdfium_started.elapsed().as_millis()
            );
        }
        Err(err) => {
            log::warn!(
                "[import] metadata extraction failed source=pdfium-metadata path={} elapsed_ms={} err={}",
                path_display,
                pdfium_started.elapsed().as_millis(),
                err
            );
        }
    }

    log::info!(
        "[import] metadata extraction start source=lopdf-fallback path={}",
        path_display
    );
    let lopdf_started = std::time::Instant::now();
    match extract_metadata_text_lopdf(pdf_path) {
        Ok(text) if !text.trim().is_empty() => {
            log::warn!(
                "[import] metadata extraction success source=lopdf-fallback path={} elapsed_ms={} chars={}",
                path_display,
                lopdf_started.elapsed().as_millis(),
                text.chars().count()
            );
            log::warn!(
                "[import] metadata extraction preview source=lopdf-fallback path={} text={}",
                path_display,
                metadata_preview(&text)
            );
            return (text, "lopdf-fallback");
        }
        Ok(_) => {
            log::warn!(
                "[import] metadata extraction empty source=lopdf-fallback path={} elapsed_ms={}",
                path_display,
                lopdf_started.elapsed().as_millis()
            );
        }
        Err(err) => {
            log::warn!(
                "[import] metadata extraction failed source=lopdf-fallback path={} elapsed_ms={} err={}",
                path_display,
                lopdf_started.elapsed().as_millis(),
                err
            );
        }
    }

    let text = safe_extract_text_for_import(pdf_path);
    if !text.trim().is_empty() {
        log::warn!(
            "[import] metadata extraction success source=pdf_extract-fulltext-fallback path={} chars={}",
            path_display,
            text.chars().count()
        );
        log::warn!(
            "[import] metadata extraction preview source=pdf_extract-fulltext-fallback path={} text={}",
            path_display,
            metadata_preview(&text)
        );
        return (text, "pdf_extract-fulltext-fallback");
    }

    log::warn!(
        "[import] metadata extraction failed source=empty path={} (all strategies exhausted)",
        path_display
    );
    (String::new(), "empty")
}

#[tauri::command]
pub fn init_app(state: State<'_, AppState>) -> Result<(), String> {
    ensure_dir(&state.app_dir)?;
    ensure_dir(&state.library_dir)?;
    ensure_dir(&state.app_dir.join("thumbnails"))?;
    log::info!("paperwall init app_dir={}", state.app_dir.display());
    log::info!("paperwall init library_dir={}", state.library_dir.display());
    log::info!("paperwall init db_path={}", state.db_path.display());
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::ensure_default_categories(&conn)?;
    Ok(())
}

#[tauri::command]
pub fn list_papers(state: State<'_, AppState>) -> Result<Vec<Paper>, String> {
    let conn = db::open(&state.db_path)?;
    db::list_papers(&conn)
}

#[tauri::command]
pub fn list_categories(state: State<'_, AppState>) -> Result<Vec<Category>, String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::ensure_other_category(&conn)?;
    db::list_categories(&conn)
}

#[tauri::command]
pub fn create_category(state: State<'_, AppState>, name: String) -> Result<Category, String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::create_category(&conn, &name)
}

#[tauri::command]
pub fn rename_category(
    state: State<'_, AppState>,
    old_name: String,
    new_name: String,
) -> Result<Category, String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::rename_category(&conn, &old_name, &new_name)
}

#[tauri::command]
pub fn delete_category(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::delete_category(&conn, &name)
}

#[tauri::command]
pub fn import_pdfs(
    state: State<'_, AppState>,
    paths: Vec<String>,
    duplicate_policy: Option<String>,
    import_mode: Option<String>,
) -> Result<ImportResult, String> {
    if paths.is_empty() {
        return Err("no input files".to_string());
    }
    ensure_dir(&state.app_dir)?;
    ensure_dir(&state.library_dir)?;
    let thumbnails_dir = state.app_dir.join("thumbnails");
    ensure_dir(&thumbnails_dir)?;

    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::ensure_other_category(&conn)?;

    let duplicate_policy = duplicate_policy.unwrap_or_else(|| "skip".to_string());
    let import_mode = import_mode.unwrap_or_else(|| "reference".to_string());

    let mut imported = Vec::new();
    let mut skipped = Vec::new();
    let mut failed = Vec::new();

    for raw_path in paths {
        let path = normalize_user_path(&raw_path);
        log::info!(
            "[import] input_path raw={} normalized={} mode={}",
            raw_path, path, import_mode
        );
        let original = PathBuf::from(&path);
        if !original.exists() || !path.to_lowercase().ends_with(".pdf") {
            failed.push(ImportFailedItem {
                path: raw_path,
                reason: "not a valid pdf".to_string(),
            });
            continue;
        }

        let Some(file_name_os) = original.file_name() else {
            failed.push(ImportFailedItem {
                path,
                reason: "invalid filename".to_string(),
            });
            continue;
        };
        let file_name = file_name_os.to_string_lossy().to_string();
        let id = Uuid::new_v4().to_string();

        let (metadata_text, metadata_source) = extract_metadata_text_for_import(&original);
        let first_page_text = metadata_text
            .chars()
            .take(12000)
            .collect::<String>();
        log::info!(
            "[import] metadata_text_ready source={} path={} len={}",
            metadata_source,
            original.display(),
            first_page_text.len()
        );

        let parsed = parse_metadata(&file_name, &first_page_text);
        log::info!(
            "[import] metadata parsed source={} path={} title={} authors={} year={:?} doi={:?} arxiv={:?}",
            metadata_source,
            original.display(),
            parsed.title,
            parsed.authors.len(),
            parsed.year,
            parsed.doi,
            parsed.arxiv_id
        );
        let mut final_title = parsed.title.clone();
        let mut final_title_source = parsed.title_source.clone();
        let mut final_title_confidence = parsed.title_confidence;
        let mut final_title_pending = parsed.title_pending_confirmation;
        let mut final_authors = parsed.authors.clone();
        let mut final_year = parsed.year;
        let mut final_venue: Option<String> = None;
        let mut final_abstract = parsed.abstract_text.clone();
        let mut final_summary = parsed.summary.clone();
        let mut final_doi = parsed.doi.clone();
        let mut final_arxiv = parsed.arxiv_id.clone();

        if parsed
            .doi
            .as_deref()
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false)
            || parsed
                .arxiv_id
                .as_deref()
                .map(|v| !v.trim().is_empty())
                .unwrap_or(false)
        {
            if let Ok(enriched) = enrich_metadata(parsed.doi.as_deref(), parsed.arxiv_id.as_deref(), None) {
                if let Some(enriched_title) = enriched.title.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
                    final_title = enriched_title.to_string();
                    final_title_source = map_title_source(enriched.source.as_deref(), parsed.doi.as_deref(), parsed.arxiv_id.as_deref());
                    final_title_confidence = 98;
                    final_title_pending = false;
                }
                if let Some(authors) = enriched.authors.filter(|a| !a.is_empty()) {
                    final_authors = authors;
                }
                if enriched.year.is_some() {
                    final_year = enriched.year;
                }
                if enriched.venue.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_some() {
                    final_venue = enriched.venue;
                }
                if let Some(abs) = enriched.abstract_text.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
                    final_abstract = abs.to_string();
                    final_summary = abs.chars().take(280).collect();
                }
                if enriched.doi.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_some() {
                    final_doi = enriched.doi;
                }
                if enriched.arxiv_id.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_some() {
                    final_arxiv = enriched.arxiv_id;
                }
            }
        }
        let file_hash = match compute_file_hash(&original) {
            Ok(hash) => Some(hash),
            Err(err) => {
                failed.push(ImportFailedItem {
                    path: original.to_string_lossy().to_string(),
                    reason: format!("计算文件哈希失败，无法安全去重：{err}"),
                });
                continue;
            }
        };
        let duplicate = detect_duplicate(
            &conn,
            file_hash.as_deref(),
            final_doi.as_deref(),
            final_arxiv.as_deref(),
            Some(&final_title),
        )?;

        if let Some(dup) = &duplicate {
            if duplicate_policy != "keep" {
                skipped.push(ImportFailedItem {
                    path: original.to_string_lossy().to_string(),
                    reason: format!(
                        "检测到重复（{}，已存在论文 ID={}），已跳过",
                        dup.reason, dup.matched_paper_id
                    ),
                });
                continue;
            }
        }

        let (managed_path, source_path_for_thumbnail) = if import_mode == "managed" {
            match copy_into_library(&original, &state.library_dir, &id, &file_name) {
                Ok(p) => (p.clone(), p),
                Err(reason) => {
                    failed.push(ImportFailedItem {
                        path: raw_path.clone(),
                        reason: format!("copy into {} failed: {reason}", state.library_dir.display()),
                    });
                    continue;
                }
            }
        } else {
            (
                PathBuf::from(format!("reference://{id}")),
                original.clone(),
            )
        };

        // Copy completed; run duplicate guard again before insert to prevent any inconsistent insertion.
        let duplicate_guard = detect_duplicate(
            &conn,
            file_hash.as_deref(),
            final_doi.as_deref(),
            final_arxiv.as_deref(),
            Some(&final_title),
        )?;
        if let Some(dup) = &duplicate_guard {
            if duplicate_policy != "keep" {
                if import_mode == "managed" {
                    let _ = std::fs::remove_file(&managed_path);
                }
                skipped.push(ImportFailedItem {
                    path: original.to_string_lossy().to_string(),
                    reason: format!(
                        "检测到重复（{}，已存在论文 ID={}），已跳过",
                        dup.reason, dup.matched_paper_id
                    ),
                });
                continue;
            }
        }

        db::upsert_category(&conn, &parsed.category)?;
        let now = Utc::now().to_rfc3339();

        let thumbnail_path = match generate_thumbnail_file(&source_path_for_thumbnail, &id, &thumbnails_dir) {
            Ok(thumbnail) => Some(thumbnail.to_string_lossy().to_string()),
            Err(err) => {
                failed.push(ImportFailedItem {
                    path: original.to_string_lossy().to_string(),
                    reason: format!("缩略图生成失败: {err}"),
                });
                None
            }
        };

        let is_metadata_incomplete = compute_metadata_incomplete(
            &final_title,
            &final_authors,
            final_year,
            &final_abstract,
            final_venue.as_deref(),
        ) || final_title_pending;

        let paper = Paper {
            id,
            title: final_title,
            authors: final_authors,
            year: final_year,
            venue: final_venue,
            doi: final_doi,
            arxiv_id: final_arxiv,
            abstract_text: final_abstract,
            summary: final_summary,
            category: parsed.category,
            tags: vec![],
            file_name,
            original_path: original.to_string_lossy().to_string(),
            managed_path: managed_path.to_string_lossy().to_string(),
            thumbnail_path,
            is_favorite: false,
            read_status: "unread".to_string(),
            notes: String::new(),
            has_notes: false,
            file_hash,
            last_opened_at: None,
            last_read_page: None,
            last_read_at: None,
            metadata_completed_at: None,
            is_metadata_incomplete,
            duplicate_key: duplicate.as_ref().map(|d| d.key.clone()),
            duplicate_reason: duplicate.as_ref().map(|d| d.reason.clone()),
            title_source: final_title_source,
            title_confidence: final_title_confidence,
            title_pending_confirmation: final_title_pending,
            created_at: now.clone(),
            updated_at: now,
        };

        if let Err(reason) = db::insert_paper(&conn, &paper) {
            log::warn!(
                "[import] insert_failed path={} reason={}",
                original.display(),
                reason
            );
            failed.push(ImportFailedItem {
                path: original.to_string_lossy().to_string(),
                reason,
            });
            continue;
        }

        log::info!(
            "import success mode={} original={} managed={} thumbnail={} hash={} duplicate={:?}",
            import_mode,
            paper.original_path,
            paper.managed_path,
            paper
                .thumbnail_path
                .clone()
                .unwrap_or_else(|| "<none>".to_string()),
            paper.file_hash.clone().unwrap_or_else(|| "<none>".to_string()),
            paper.duplicate_reason
        );
        imported.push(paper);
    }

    log::info!(
        "import done imported={} failed={} library={} thumb_dir={}",
        imported.len(),
        failed.len(),
        state.library_dir.display(),
        thumbnails_dir.display()
    );
    Ok(ImportResult {
        imported,
        skipped,
        failed,
    })
}

#[tauri::command]
pub fn ensure_thumbnail(state: State<'_, AppState>, id: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    let paper = db::get_paper(&conn, &id)?;
    let thumbnails_dir = state.app_dir.join("thumbnails");
    ensure_dir(&thumbnails_dir)?;

    let source_path = resolve_paper_source_path(&paper)?;
    let thumbnail = generate_thumbnail_file(&source_path, &paper.id, &thumbnails_dir)?;
    let thumbnail_str = thumbnail.to_string_lossy().to_string();
    log::info!(
        "ensure_thumbnail success id={} source={} thumbnail={}",
        paper.id,
        source_path.display(),
        thumbnail_str
    );
    db::update_partial(&conn, &paper.id, "UPDATE papers SET thumbnail_path = ?2", &thumbnail_str)
}

#[tauri::command]
pub fn update_paper(state: State<'_, AppState>, mut paper: Paper) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    let existing = db::get_paper(&conn, &paper.id)?;
    if paper.title.trim() != existing.title.trim() {
        paper.title_source = "manual".to_string();
        paper.title_confidence = 100;
        paper.title_pending_confirmation = false;
    }
    paper.is_metadata_incomplete = compute_metadata_incomplete(
        &paper.title,
        &paper.authors,
        paper.year,
        &paper.abstract_text,
        paper.venue.as_deref(),
    ) || paper.title_pending_confirmation;
    db::update_paper(&conn, &paper)
}

#[tauri::command]
pub fn apply_rename(state: State<'_, AppState>, id: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    let paper = db::get_paper(&conn, &id)?;
    let suggested = suggestion(&paper);
    let old_path = Path::new(&paper.managed_path);
    let new_path = rename_managed_file(old_path, &suggested)?;
    db::set_managed_path(&conn, &id, &suggested, &new_path.to_string_lossy())
}

#[tauri::command]
pub fn set_favorite(state: State<'_, AppState>, id: String, value: bool) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    db::update_partial_bool(&conn, &id, "UPDATE papers SET is_favorite = ?2", value)
}

#[tauri::command]
pub fn set_read_status(state: State<'_, AppState>, id: String, value: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    db::update_partial(&conn, &id, "UPDATE papers SET read_status = ?2", &value)
}

#[tauri::command]
pub fn set_read_progress(state: State<'_, AppState>, id: String, page: i32) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    db::update_read_progress(&conn, &id, page)
}

#[tauri::command]
pub fn update_notes(state: State<'_, AppState>, id: String, notes: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    db::update_partial(&conn, &id, "UPDATE papers SET notes = ?2", &notes)
}

#[tauri::command]
pub fn reclassify_paper(state: State<'_, AppState>, id: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    let paper = db::get_paper(&conn, &id)?;
    let category = classify(&paper.title, &paper.abstract_text);
    db::update_partial(&conn, &id, "UPDATE papers SET category = ?2", &category)
}

#[tauri::command]
pub fn update_thumbnail(state: State<'_, AppState>, id: String, thumbnail_path: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    db::update_partial(&conn, &id, "UPDATE papers SET thumbnail_path = ?2", &thumbnail_path)
}

#[tauri::command]
pub fn set_category(state: State<'_, AppState>, id: String, category: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    db::upsert_category(&conn, &category)?;
    db::update_partial(&conn, &id, "UPDATE papers SET category = ?2", &category)
}

#[tauri::command]
pub fn add_tag_to_paper(state: State<'_, AppState>, id: String, tag: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::add_tag_to_paper(&conn, &id, &tag)
}

#[tauri::command]
pub fn remove_tag_from_paper(state: State<'_, AppState>, id: String, tag: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::remove_tag_from_paper(&conn, &id, &tag)
}

#[tauri::command]
pub fn assert_path_exists(path: String) -> Result<(), String> {
    let normalized = normalize_user_path(&path);
    log::info!(
        "[open_pdf] assert_path_exists_start raw={} normalized={}",
        path, normalized
    );
    if Path::new(&normalized).exists() {
        log::info!(
            "[open_pdf] assert_path_exists_success normalized={}",
            normalized
        );
        Ok(())
    } else {
        log::warn!(
            "[open_pdf] assert_path_exists_failed raw={} normalized={}",
            path, normalized
        );
        Err(format!("路径不存在: {}", normalized))
    }
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    fs::write(&target, content).map_err(|e| format!("写入文件失败: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn open_pdf_file(state: State<'_, AppState>, paper_id: String, path: String) -> Result<(), String> {
    let conn = db::open(&state.db_path)?;
    let settings = db::get_app_settings(&conn)?;
    let paper = db::get_paper(&conn, &paper_id)?;
    let normalized_path = normalize_user_path(&path);
    let input_target = Path::new(&normalized_path);
    let db_target = resolve_paper_source_path(&paper).ok();

    let chosen: PathBuf = if input_target.exists() {
        input_target.to_path_buf()
    } else if let Some(path_from_db) = db_target.as_ref() {
        path_from_db.clone()
    } else {
        return Err(format!(
            "论文文件不存在（input={}, original_path={}, managed_path={}）",
            normalized_path,
            paper.original_path,
            paper.managed_path
        ));
    };

    log::info!(
        "[open_pdf] open_start paper_id={} raw={} normalized={} input_exists={} db_source={} chosen={} reader_mode={}",
        paper_id,
        path,
        normalized_path,
        input_target.exists(),
        db_target
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<none>".to_string()),
        chosen.display(),
        settings.reader_mode
    );
    open_pdf_with_settings(&chosen, &settings)?;
    db::mark_opened(&conn, &paper_id)?;
    log::info!(
        "[open_pdf] open_success paper_id={} chosen={}",
        paper_id,
        chosen.display()
    );
    Ok(())
}

#[tauri::command]
pub fn relink_paper_file(
    state: State<'_, AppState>,
    id: String,
    original_path: String,
) -> Result<Paper, String> {
    let normalized_original_path = normalize_user_path(&original_path);
    let source = PathBuf::from(&normalized_original_path);
    if !source.exists() {
        return Err(format!("文件不存在: {normalized_original_path}"));
    }
    if !normalized_original_path.to_lowercase().ends_with(".pdf") {
        return Err("请选择 PDF 文件".to_string());
    }
    let file_name = source
        .file_name()
        .map(|v| v.to_string_lossy().to_string())
        .ok_or_else(|| "无法识别文件名".to_string())?;

    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    let updated = db::rebind_original_path(&conn, &id, &normalized_original_path, &file_name)?;

    let use_source = resolve_paper_source_path(&updated)?;
    let thumbnails_dir = state.app_dir.join("thumbnails");
    ensure_dir(&thumbnails_dir)?;
    if let Ok(thumbnail) = generate_thumbnail_file(&use_source, &updated.id, &thumbnails_dir) {
        let thumbnail_str = thumbnail.to_string_lossy().to_string();
        return db::update_partial(&conn, &updated.id, "UPDATE papers SET thumbnail_path = ?2", &thumbnail_str);
    }

    Ok(updated)
}

#[tauri::command]
pub fn delete_paper(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = db::open(&state.db_path)?;
    let paper = db::get_paper(&conn, &id)?;

    if !paper.managed_path.trim().is_empty() {
        let managed = Path::new(&paper.managed_path);
        if managed.exists() {
            std::fs::remove_file(managed)
                .map_err(|e| format!("删除托管 PDF 失败: {} ({e})", managed.display()))?;
        }
    }

    if let Some(thumbnail_path) = &paper.thumbnail_path {
        if !thumbnail_path.trim().is_empty() {
            let thumb = Path::new(thumbnail_path);
            if thumb.exists() {
                std::fs::remove_file(thumb)
                    .map_err(|e| format!("删除缩略图失败: {} ({e})", thumb.display()))?;
            }
        }
    }

    db::delete_paper(&conn, &id)?;
    Ok(())
}

#[tauri::command]
pub fn list_notes(state: State<'_, AppState>, paper_id: String) -> Result<Vec<NoteItem>, String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::list_notes(&conn, &paper_id)
}

#[tauri::command]
pub fn create_note(state: State<'_, AppState>, note: CreateNoteInput) -> Result<NoteItem, String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::create_note(&conn, &note)
}

#[tauri::command]
pub fn delete_note(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::delete_note(&conn, &id)
}

#[tauri::command]
pub fn update_note_highlight_color(
    state: State<'_, AppState>,
    id: String,
    color: String,
) -> Result<NoteItem, String> {
    let normalized = color.trim().to_lowercase();
    if normalized != "yellow" && normalized != "blue" && normalized != "red" {
        return Err("不支持的高亮颜色".to_string());
    }
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    let note = db::get_note(&conn, &id)?;
    if note.note_type != "annotation" {
        return Err("仅支持修改高亮标注颜色".to_string());
    }
    let comment = note.comment.unwrap_or_default();
    let mut value = serde_json::from_str::<serde_json::Value>(&comment)
        .map_err(|_| "高亮数据格式无效，无法改色".to_string())?;
    if value
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        != "highlight"
    {
        return Err("当前标注不是高亮类型".to_string());
    }
    value["color"] = serde_json::Value::String(normalized);
    let payload = serde_json::to_string(&value).map_err(|e| format!("序列化高亮失败: {e}"))?;
    db::update_note_comment(&conn, &id, &payload)
}

#[tauri::command]
pub fn update_note_highlight_remark(
    state: State<'_, AppState>,
    id: String,
    remark: String,
) -> Result<NoteItem, String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    let note = db::get_note(&conn, &id)?;
    if note.note_type != "annotation" {
        return Err("仅支持修改高亮备注".to_string());
    }
    let comment = note.comment.unwrap_or_default();
    let value = serde_json::from_str::<serde_json::Value>(&comment)
        .map_err(|_| "高亮数据格式无效，无法写入备注".to_string())?;
    if value
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        != "highlight"
    {
        return Err("当前标注不是高亮类型".to_string());
    }
    db::update_note_content(&conn, &id, remark.trim())
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::get_app_settings(&conn)
}

#[tauri::command]
pub fn save_app_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<AppSettings, String> {
    if settings.reader_mode == "custom" {
        let path = settings
            .external_reader_path
            .as_deref()
            .ok_or_else(|| "请先填写外部阅读器路径".to_string())?;
        if !Path::new(path).exists() {
            return Err(format!("外部阅读器路径不存在: {path}"));
        }
    }

    let conn = db::open(&state.db_path)?;
    db::migrate(&conn)?;
    db::save_app_settings(&conn, &settings)
}

#[tauri::command]
pub fn enrich_paper_metadata(
    state: State<'_, AppState>,
    id: String,
    force_override: Option<bool>,
) -> Result<MetadataEnrichResult, String> {
    let conn = db::open(&state.db_path)?;
    let paper = db::get_paper(&conn, &id)?;
    let enriched = enrich_metadata(
        paper.doi.as_deref(),
        paper.arxiv_id.as_deref(),
        Some(&paper.title),
    )?;

    let apply_force = force_override.unwrap_or(false);
    let merged = merge_enriched_metadata(&paper, &enriched, apply_force);
    let updated = db::update_paper(&conn, &merged)?;

    Ok(MetadataEnrichResult {
        updated: Some(updated),
        source: enriched.source,
        message: "元数据补全完成".to_string(),
    })
}

#[tauri::command]
pub fn enrich_all_metadata(
    state: State<'_, AppState>,
    force_override: Option<bool>,
) -> Result<BulkMetadataEnrichResult, String> {
    let conn = db::open(&state.db_path)?;
    let papers = db::list_papers(&conn)?;
    let mut success_count = 0usize;
    let mut failed = Vec::new();
    let apply_force = force_override.unwrap_or(false);

    for paper in papers {
        match enrich_metadata(
            paper.doi.as_deref(),
            paper.arxiv_id.as_deref(),
            Some(&paper.title),
        ) {
            Ok(enriched) => {
                let merged = merge_enriched_metadata(&paper, &enriched, apply_force);
                if db::update_paper(&conn, &merged).is_ok() {
                    success_count += 1;
                } else {
                    failed.push(ImportFailedItem {
                        path: paper.file_name.clone(),
                        reason: "写入数据库失败".to_string(),
                    });
                }
            }
            Err(err) => {
                failed.push(ImportFailedItem {
                    path: paper.file_name.clone(),
                    reason: err,
                });
            }
        }
    }

    Ok(BulkMetadataEnrichResult {
        success_count,
        failed,
    })
}

#[tauri::command]
pub fn save_thumbnail(state: State<'_, AppState>, id: String, data_url: String) -> Result<Paper, String> {
    let conn = db::open(&state.db_path)?;
    let thumbnails_dir = state.app_dir.join("thumbnails");
    ensure_dir(&thumbnails_dir)?;

    let payload = data_url
        .split_once(',')
        .map(|(_, body)| body)
        .ok_or_else(|| "invalid thumbnail data url".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| format!("decode thumbnail failed: {e}"))?;

    let thumbnail_path = thumbnails_dir.join(format!("{id}.png"));
    std::fs::write(&thumbnail_path, bytes).map_err(|e| format!("write thumbnail failed: {e}"))?;

    db::update_partial(
        &conn,
        &id,
        "UPDATE papers SET thumbnail_path = ?2",
        &thumbnail_path.to_string_lossy(),
    )
}

fn generate_thumbnail_file(managed_path: &Path, paper_id: &str, thumbnails_dir: &Path) -> Result<PathBuf, String> {
    if !managed_path.exists() {
        return Err(format!("PDF 不存在: {}", managed_path.display()));
    }

    ensure_dir(thumbnails_dir)?;
    let output = Command::new("qlmanage")
        .arg("-t")
        .arg("-s")
        .arg("640")
        .arg("-o")
        .arg(thumbnails_dir)
        .arg(managed_path)
        .output()
        .map_err(|e| format!("调用 qlmanage 失败: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "qlmanage 执行失败: status={} stderr={}",
            output.status,
            stderr
        ));
    }

    let Some(file_name) = managed_path.file_name().map(|s| s.to_string_lossy().to_string()) else {
        return Err("无法读取 PDF 文件名".to_string());
    };
    let stem = managed_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let candidates = [
        thumbnails_dir.join(format!("{file_name}.png")),
        thumbnails_dir.join(format!("{stem}.png")),
    ];

    let generated = candidates
        .iter()
        .find(|path| path.exists())
        .cloned()
        .ok_or_else(|| {
            format!(
                "qlmanage 执行后未找到缩略图输出: {} / {}",
                candidates[0].display(),
                candidates[1].display()
            )
        })?;

    let target = thumbnails_dir.join(format!("{paper_id}.png"));
    if target.exists() {
        std::fs::remove_file(&target)
            .map_err(|e| format!("删除旧缩略图失败: {} ({e})", target.display()))?;
    }
    std::fs::rename(&generated, &target).map_err(|e| {
        format!(
            "缩略图重命名失败: {} -> {} ({e})",
            generated.display(),
            target.display()
        )
    })?;

    if !target.exists() {
        return Err(format!("缩略图未落盘: {}", target.display()));
    }

    log::info!(
        "thumbnail generated managed={} output={} exists={}",
        managed_path.display(),
        target.display(),
        target.exists()
    );

    Ok(target)
}

fn resolve_paper_source_path(paper: &Paper) -> Result<PathBuf, String> {
    if !paper.managed_path.trim().is_empty() && !paper.managed_path.starts_with("reference://") {
        let managed = PathBuf::from(normalize_user_path(&paper.managed_path));
        if managed.exists() {
            return Ok(managed);
        }
    }
    if !paper.original_path.trim().is_empty() {
        let original = PathBuf::from(normalize_user_path(&paper.original_path));
        if original.exists() {
            return Ok(original);
        }
    }
    Err(format!(
        "论文文件不存在（managed_path={}, original_path={}）",
        paper.managed_path, paper.original_path
    ))
}

fn compute_metadata_incomplete(
    title: &str,
    authors: &[String],
    year: Option<i32>,
    abstract_text: &str,
    venue: Option<&str>,
) -> bool {
    let title_missing = title.trim().is_empty();
    let author_missing = authors.is_empty() || (authors.len() == 1 && authors[0] == "未知作者");
    let year_missing = year.is_none();
    let abstract_missing = abstract_text.trim().len() < 20;
    let venue_missing = venue.unwrap_or_default().trim().is_empty();
    title_missing || author_missing || year_missing || (abstract_missing && venue_missing)
}

fn map_title_source(source: Option<&str>, doi: Option<&str>, arxiv_id: Option<&str>) -> String {
    match source.unwrap_or_default() {
        "crossref_doi" => "doi".to_string(),
        "arxiv" => "arxiv".to_string(),
        "crossref_title" => {
            if doi.map(|v| !v.trim().is_empty()).unwrap_or(false) {
                "doi".to_string()
            } else if arxiv_id.map(|v| !v.trim().is_empty()).unwrap_or(false) {
                "arxiv".to_string()
            } else {
                "metadata".to_string()
            }
        }
        _ => "metadata".to_string(),
    }
}

fn fill_str(current: &str, incoming: Option<String>, force: bool) -> String {
    if force {
        return incoming.unwrap_or_else(|| current.to_string());
    }
    if current.trim().is_empty() {
        incoming.unwrap_or_else(|| current.to_string())
    } else {
        current.to_string()
    }
}

fn is_filename_like_title(title: &str, file_name: &str) -> bool {
    let stem = file_name.trim_end_matches(".pdf");
    let normalize = |value: &str| {
        value
            .to_lowercase()
            .replace(['_', '-'], " ")
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c.is_ascii_whitespace() { c } else { ' ' })
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    };
    let t = normalize(title);
    let s = normalize(stem);
    !t.is_empty() && !s.is_empty() && t == s
}

fn fill_opt_str(current: Option<String>, incoming: Option<String>, force: bool) -> Option<String> {
    if force {
        return incoming.or(current);
    }
    if current.as_deref().unwrap_or_default().trim().is_empty() {
        incoming.or(current)
    } else {
        current
    }
}

fn fill_authors(current: &[String], incoming: Option<Vec<String>>, force: bool) -> Vec<String> {
    let current_is_empty = current.is_empty() || (current.len() == 1 && current[0] == "未知作者");
    if force {
        incoming.unwrap_or_else(|| current.to_vec())
    } else if current_is_empty {
        incoming.unwrap_or_else(|| current.to_vec())
    } else {
        current.to_vec()
    }
}

fn fill_year(current: Option<i32>, incoming: Option<i32>, force: bool) -> Option<i32> {
    if force {
        incoming.or(current)
    } else {
        current.or(incoming)
    }
}

fn merge_enriched_metadata(original: &Paper, enriched: &EnrichedMetadata, force: bool) -> Paper {
    let merged_abstract = fill_str(&original.abstract_text, enriched.abstract_text.clone(), force);
    let merged_summary = if original.summary.trim().is_empty() || force {
        merged_abstract.chars().take(280).collect()
    } else {
        original.summary.clone()
    };

    let now = Utc::now().to_rfc3339();
    let mut merged = original.clone();
    let force_title = force
        || (original.title_source != "manual"
            && (is_filename_like_title(&original.title, &original.file_name)
                || original.title_pending_confirmation));
    merged.title = fill_str(&original.title, enriched.title.clone(), force_title);
    merged.authors = fill_authors(&original.authors, enriched.authors.clone(), force);
    merged.year = fill_year(original.year, enriched.year, force);
    merged.venue = fill_opt_str(original.venue.clone(), enriched.venue.clone(), force);
    merged.abstract_text = merged_abstract;
    merged.summary = merged_summary;
    merged.doi = fill_opt_str(original.doi.clone(), enriched.doi.clone(), force);
    merged.arxiv_id = fill_opt_str(original.arxiv_id.clone(), enriched.arxiv_id.clone(), force);
    if force_title && enriched.title.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_some() {
        merged.title_source =
            map_title_source(enriched.source.as_deref(), original.doi.as_deref(), original.arxiv_id.as_deref());
        merged.title_confidence = 98;
        merged.title_pending_confirmation = false;
    }
    merged.metadata_completed_at = Some(now);
    merged.is_metadata_incomplete = compute_metadata_incomplete(
        &merged.title,
        &merged.authors,
        merged.year,
        &merged.abstract_text,
        merged.venue.as_deref(),
    ) || merged.title_pending_confirmation;
    merged
}
