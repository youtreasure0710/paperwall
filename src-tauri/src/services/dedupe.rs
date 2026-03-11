use std::path::Path;
use std::process::Command;

use crate::db;
use crate::models::Paper;

#[derive(Debug, Clone)]
pub struct DuplicateMatch {
    pub key: String,
    pub reason: String,
    pub matched_paper_id: String,
}

pub fn compute_file_hash(path: &Path) -> Result<String, String> {
    let output = Command::new("shasum")
        .arg("-a")
        .arg("256")
        .arg(path)
        .output()
        .map_err(|e| format!("计算文件 hash 失败: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "计算文件 hash 失败: status={} stderr={}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let hash = stdout
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string();

    if hash.is_empty() {
        return Err("计算文件 hash 失败：返回为空".to_string());
    }
    Ok(hash)
}

pub fn normalize_title(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || c.is_ascii_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn detect_duplicate(
    conn: &rusqlite::Connection,
    file_hash: Option<&str>,
    doi: Option<&str>,
    arxiv_id: Option<&str>,
    title: Option<&str>,
) -> Result<Option<DuplicateMatch>, String> {
    if let Some(hash) = file_hash {
        if let Some(hit) = db::find_by_file_hash(conn, hash)? {
            return Ok(Some(to_match("hash", "文件内容完全相同", &hit)));
        }
    }

    if let Some(doi_value) = doi {
        if !doi_value.trim().is_empty() {
            if let Some(hit) = db::find_by_doi(conn, doi_value.trim())? {
                return Ok(Some(to_match("doi", "DOI 相同", &hit)));
            }
        }
    }

    if let Some(arxiv_value) = arxiv_id {
        if !arxiv_value.trim().is_empty() {
            if let Some(hit) = db::find_by_arxiv(conn, arxiv_value.trim())? {
                return Ok(Some(to_match("arxiv", "arXiv 编号相同", &hit)));
            }
        }
    }

    if let Some(title_value) = title {
        let normalized = normalize_title(title_value);
        if normalized.len() > 10 {
            if let Some(hit) = db::find_by_normalized_title(conn, &normalized)? {
                return Ok(Some(to_match("title", "标题高度相似", &hit)));
            }
        }
    }

    Ok(None)
}

fn to_match(key_prefix: &str, reason: &str, paper: &Paper) -> DuplicateMatch {
    DuplicateMatch {
        key: format!("{key_prefix}:{}", paper.id),
        reason: reason.to_string(),
        matched_paper_id: paper.id.clone(),
    }
}
