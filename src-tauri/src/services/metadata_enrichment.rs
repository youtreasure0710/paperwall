use std::process::Command;

use regex::Regex;

#[derive(Debug, Clone, Default)]
pub struct EnrichedMetadata {
    pub title: Option<String>,
    pub authors: Option<Vec<String>>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub abstract_text: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub source: Option<String>,
}

pub fn enrich_metadata(doi: Option<&str>, arxiv_id: Option<&str>, title: Option<&str>) -> Result<EnrichedMetadata, String> {
    if let Some(doi_value) = doi {
        let trimmed = doi_value.trim();
        if !trimmed.is_empty() {
            let data = query_crossref_by_doi(trimmed)?;
            if data.title.is_some() || data.authors.is_some() {
                return Ok(data);
            }
        }
    }

    if let Some(arxiv_value) = arxiv_id {
        let trimmed = arxiv_value.trim();
        if !trimmed.is_empty() {
            let data = query_arxiv(trimmed)?;
            if data.title.is_some() || data.authors.is_some() {
                return Ok(data);
            }
        }
    }

    if let Some(title_value) = title {
        let trimmed = title_value.trim();
        if !trimmed.is_empty() {
            return query_crossref_by_title(trimmed);
        }
    }

    Err("缺少可用于补全的 DOI / arXiv / 标题信息".to_string())
}

fn query_crossref_by_doi(doi: &str) -> Result<EnrichedMetadata, String> {
    let encoded = doi.replace(' ', "%20");
    let url = format!("https://api.crossref.org/works/{encoded}");
    let text = fetch_url(&url)?;
    parse_crossref_text(&text, "crossref_doi")
}

fn query_crossref_by_title(title: &str) -> Result<EnrichedMetadata, String> {
    let encoded = title.replace(' ', "%20");
    let url = format!("https://api.crossref.org/works?rows=1&query.title={encoded}");
    let text = fetch_url(&url)?;
    parse_crossref_search_text(&text)
}

fn query_arxiv(arxiv_id: &str) -> Result<EnrichedMetadata, String> {
    let url = format!("https://export.arxiv.org/api/query?id_list={arxiv_id}");
    let text = fetch_url(&url)?;
    parse_arxiv_xml(&text, arxiv_id)
}

fn fetch_url(url: &str) -> Result<String, String> {
    let output = Command::new("curl")
        .arg("-L")
        .arg("--silent")
        .arg("--show-error")
        .arg("--max-time")
        .arg("12")
        .arg(url)
        .output()
        .map_err(|e| format!("请求远端元数据失败: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "请求远端元数据失败: status={} stderr={}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    String::from_utf8(output.stdout).map_err(|e| format!("解析远端响应失败: {e}"))
}

fn parse_crossref_text(text: &str, source: &str) -> Result<EnrichedMetadata, String> {
    let root: serde_json::Value = serde_json::from_str(text).map_err(|e| format!("解析 Crossref 响应失败: {e}"))?;
    let message = root
        .get("message")
        .ok_or_else(|| "Crossref 响应格式错误：缺少 message".to_string())?;

    Ok(parse_crossref_message(message, source))
}

fn parse_crossref_search_text(text: &str) -> Result<EnrichedMetadata, String> {
    let root: serde_json::Value = serde_json::from_str(text).map_err(|e| format!("解析 Crossref 响应失败: {e}"))?;
    let first = root
        .get("message")
        .and_then(|m| m.get("items"))
        .and_then(|items| items.as_array())
        .and_then(|items| items.first())
        .ok_or_else(|| "Crossref 标题检索没有结果".to_string())?;

    Ok(parse_crossref_message(first, "crossref_title"))
}

fn parse_crossref_message(message: &serde_json::Value, source: &str) -> EnrichedMetadata {
    let title = message
        .get("title")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .map(clean_whitespace);

    let authors = message
        .get("author")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let given = item.get("given").and_then(|v| v.as_str()).unwrap_or("");
                    let family = item.get("family").and_then(|v| v.as_str()).unwrap_or("");
                    let name = format!("{} {}", given, family).trim().to_string();
                    if name.is_empty() { None } else { Some(name) }
                })
                .collect::<Vec<_>>()
        })
        .filter(|arr| !arr.is_empty());

    let year = message
        .get("issued")
        .and_then(|issued| issued.get("date-parts"))
        .and_then(|dp| dp.get(0))
        .and_then(|first| first.get(0))
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    let venue = message
        .get("container-title")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .map(clean_whitespace)
        .filter(|v| !v.is_empty());

    let doi = message
        .get("DOI")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    let abstract_text = message
        .get("abstract")
        .and_then(|v| v.as_str())
        .map(strip_xml_tags)
        .filter(|v| !v.is_empty());

    EnrichedMetadata {
        title,
        authors,
        year,
        venue,
        abstract_text,
        doi,
        arxiv_id: None,
        source: Some(source.to_string()),
    }
}

fn parse_arxiv_xml(text: &str, arxiv_id: &str) -> Result<EnrichedMetadata, String> {
    let entry = capture_block(text, "entry").ok_or_else(|| "arXiv 返回为空".to_string())?;
    let title = capture_text(entry, "title").as_deref().map(clean_whitespace);
    let summary = capture_text(entry, "summary").as_deref().map(clean_whitespace);
    let published = capture_text(entry, "published");
    let year = published
        .as_deref()
        .and_then(|value| value.get(0..4))
        .and_then(|value| value.parse::<i32>().ok());

    let author_re = Regex::new(r"(?s)<author>\s*<name>(.*?)</name>\s*</author>").map_err(|e| e.to_string())?;
    let authors = author_re
        .captures_iter(entry)
        .filter_map(|caps| caps.get(1).map(|m| clean_whitespace(m.as_str())))
        .filter(|v| !v.is_empty())
        .collect::<Vec<_>>();

    Ok(EnrichedMetadata {
        title,
        authors: if authors.is_empty() { None } else { Some(authors) },
        year,
        venue: Some("arXiv".to_string()),
        abstract_text: summary,
        doi: capture_text(entry, "arxiv:doi").as_deref().map(clean_whitespace),
        arxiv_id: Some(arxiv_id.trim().to_string()),
        source: Some("arxiv".to_string()),
    })
}

fn capture_block<'a>(text: &'a str, tag: &str) -> Option<&'a str> {
    let pattern = format!(r"(?s)<{tag}>(.*?)</{tag}>");
    let re = Regex::new(&pattern).ok()?;
    re.captures(text).and_then(|caps| caps.get(1).map(|m| m.as_str()))
}

fn capture_text(text: &str, tag: &str) -> Option<String> {
    let pattern = format!(r"(?s)<{tag}>(.*?)</{tag}>");
    let re = Regex::new(&pattern).ok()?;
    re.captures(text)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
}

fn clean_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_xml_tags(value: &str) -> String {
    let cleaned = Regex::new(r"<[^>]+>")
        .ok()
        .map(|re| re.replace_all(value, " ").to_string())
        .unwrap_or_else(|| value.to_string());
    clean_whitespace(&cleaned)
}
