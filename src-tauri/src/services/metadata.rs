use regex::Regex;

use crate::services::classifier::classify;

#[derive(Debug)]
pub struct ParsedMetadata {
    pub title: String,
    pub title_source: String,
    pub title_confidence: i32,
    pub title_pending_confirmation: bool,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub abstract_text: String,
    pub summary: String,
    pub category: String,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
}

pub fn parse_metadata(file_name: &str, first_page_text: &str) -> ParsedMetadata {
    let stem = file_name.trim_end_matches(".pdf");
    let file_title_fallback = clean_file_title(stem);
    let extracted_title = extract_title_from_first_page(first_page_text);
    let mut title = file_title_fallback.clone();
    let mut title_source = "filename".to_string();
    let mut title_confidence = 25;
    let mut title_pending_confirmation = true;
    if let Some((candidate, score)) = extracted_title.clone() {
        title = candidate;
        title_source = "pdf_header".to_string();
        title_confidence = score.clamp(35, 90);
        title_pending_confirmation = score < 125;
    }
    let mut authors = Vec::new();
    let mut year = extract_year(stem).or_else(|| extract_year(first_page_text));

    if let Some((left, right)) = split_author_title(stem) {
        if authors.is_empty() {
            authors = left
                .split(['_', ',', '&'])
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        }
        if extracted_title.is_none() {
            let candidate = clean_file_title(right);
            if candidate.len() >= 8 {
                title = candidate;
                title_source = "filename".to_string();
                title_confidence = 30;
                title_pending_confirmation = true;
            }
        }
    }

    if title.trim().len() < 8 {
        title = file_title_fallback;
        title_source = "filename".to_string();
        title_confidence = 20;
        title_pending_confirmation = true;
    }

    let extracted_authors = extract_authors(first_page_text, &title).unwrap_or_default();
    if !extracted_authors.is_empty() {
        authors = extracted_authors;
    }
    if authors.is_empty() {
        authors = vec!["未知作者".to_string()];
    }

    let abstract_text = extract_abstract(first_page_text).unwrap_or_default();
    let summary = if abstract_text.is_empty() {
        String::new()
    } else {
        abstract_text.chars().take(280).collect()
    };
    let category = classify(&title, &abstract_text);
    let doi = extract_doi(stem).or_else(|| extract_doi(first_page_text));
    let arxiv_id = extract_arxiv(stem).or_else(|| extract_arxiv(first_page_text));

    if year.is_none() {
        year = extract_year(&title);
    }

    ParsedMetadata {
        title,
        title_source,
        title_confidence,
        title_pending_confirmation,
        authors,
        year,
        abstract_text,
        summary,
        category,
        doi,
        arxiv_id,
    }
}

fn extract_doi(text: &str) -> Option<String> {
    let re = Regex::new(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+\b").ok()?;
    re.find(text).map(|m| m.as_str().trim_end_matches('.').to_string())
}

fn extract_abstract(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    if let Some(start) = lower.find("abstract") {
        let remain = &text[start..];
        let sliced: String = remain
            .lines()
            .skip(1)
            .take_while(|line| !line.to_lowercase().contains("introduction"))
            .collect::<Vec<_>>()
            .join(" ");
        let normalized = sliced.split_whitespace().collect::<Vec<_>>().join(" ");
        if normalized.len() > 40 {
            return Some(normalized.chars().take(2000).collect());
        }
    }
    None
}

fn extract_year(text: &str) -> Option<i32> {
    let re = Regex::new(r"(19|20)\d{2}").ok()?;
    re.find(text)
        .and_then(|m| m.as_str().parse::<i32>().ok())
        .filter(|year| (1900..=2100).contains(year))
}

fn extract_arxiv(text: &str) -> Option<String> {
    let re = Regex::new(r"\b\d{4}\.\d{4,5}(v\d+)?\b").ok()?;
    re.find(text).map(|m| m.as_str().to_string())
}

fn split_author_title(stem: &str) -> Option<(&str, &str)> {
    let (left, right) = stem.split_once('-')?;
    if left.chars().all(|c| c.is_alphabetic() || c == ' ' || c == '_' || c == ',' || c == '&') {
        Some((left, right))
    } else {
        None
    }
}

fn clean_file_title(stem: &str) -> String {
    let normalized = stem
        .replace(['_', '-'], " ")
        .split_whitespace()
        .filter(|part| {
            let lower = part.to_lowercase();
            !(lower.starts_with('v') && lower[1..].chars().all(|c| c.is_ascii_digit()))
                && lower != "final"
                && lower != "camera"
                && lower != "ready"
        })
        .collect::<Vec<_>>()
        .join(" ");
    normalized.trim().to_string()
}

fn extract_title_from_first_page(first_page_text: &str) -> Option<(String, i32)> {
    let lines = first_page_text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(normalize_line)
        .filter(|line| !line.is_empty())
        .take(40)
        .collect::<Vec<_>>();

    if lines.is_empty() {
        return None;
    }

    let mut candidates: Vec<(i32, String)> = Vec::new();
    for (idx, line) in lines.iter().enumerate() {
        if idx > 20 {
            break;
        }
        if has_blocked_title_marker(line) {
            continue;
        }
        if !is_title_like(line) {
            continue;
        }
        let mut candidate = line.to_string();
        if idx + 1 < lines.len() {
            let next = lines[idx + 1].trim();
            if is_title_like(next)
                && !has_blocked_title_marker(next)
                && !looks_like_author_line(next)
                && !looks_like_paragraph(next)
                && next.len() < 100
            {
                candidate = format!("{candidate} {next}");
            }
        }
        let score = score_title_candidate(&candidate, idx);
        if score > 0 {
            candidates.push((score, candidate));
        }
    }

    candidates
        .into_iter()
        .max_by_key(|(score, _)| *score)
        .map(|(score, title)| (title, score))
}

fn is_title_like(line: &str) -> bool {
    let len = line.chars().count();
    if !(12..=220).contains(&len) {
        return false;
    }
    let digit_count = line.chars().filter(|c| c.is_ascii_digit()).count();
    if digit_count > len / 4 {
        return false;
    }
    if looks_like_paragraph(line) {
        return false;
    }
    let words = line.split_whitespace().collect::<Vec<_>>();
    (3..=24).contains(&words.len())
}

fn looks_like_author_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    if lower.contains("university")
        || lower.contains("institute")
        || lower.contains("department")
        || lower.contains("school")
        || lower.contains("laboratory")
    {
        return true;
    }
    let author_like_tokens = split_author_candidates(line)
        .into_iter()
        .filter(|token| is_human_name(token))
        .count();
    author_like_tokens >= 2
}

fn score_title_candidate(title: &str, idx: usize) -> i32 {
    let lower = title.to_lowercase();
    if has_blocked_title_marker(title) {
        return -1000;
    }

    let mut score = 100i32;
    score += (60 - (idx as i32 * 4)).max(0);

    let len = title.chars().count() as i32;
    let words = title.split_whitespace().count() as i32;

    let length_score = if (35..=130).contains(&len) {
        24
    } else if (20..=160).contains(&len) {
        10
    } else {
        -20
    };
    score += length_score;

    let word_score = if (5..=18).contains(&words) {
        20
    } else if (3..=22).contains(&words) {
        6
    } else {
        -25
    };
    score += word_score;

    if title.contains(':') || title.contains('-') {
        score += 6;
    }
    if title.ends_with('.') {
        score -= 15;
    }
    if title.matches(',').count() >= 3 {
        score -= 15;
    }
    if looks_like_author_line(title) {
        score -= 70;
    }
    if looks_like_paragraph(title) {
        score -= 80;
    }
    if lower.starts_with("we ")
        || lower.starts_with("in this paper")
        || lower.starts_with("this paper")
        || lower.starts_with("our ")
    {
        score -= 70;
    }
    score
}

fn has_blocked_title_marker(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("abstract")
        || lower.contains("摘要")
        || lower.contains("introduction")
        || lower.contains("arxiv:")
        || lower.contains("doi")
        || lower.contains("proceedings of")
        || lower.contains("copyright")
        || lower.contains("all rights reserved")
        || lower.contains('@')
        || lower.contains("http")
        || lower.contains("www.")
}

fn looks_like_paragraph(line: &str) -> bool {
    let lower = line.to_lowercase();
    let sentence_like = line.matches('.').count() >= 2 || line.matches(';').count() >= 2;
    let long = line.chars().count() > 170;
    let paragraph_starter = lower.starts_with("we ")
        || lower.starts_with("in this paper")
        || lower.starts_with("this paper")
        || lower.starts_with("our ")
        || lower.starts_with("to ");
    sentence_like || long || paragraph_starter
}

fn extract_authors(first_page_text: &str, title: &str) -> Option<Vec<String>> {
    let lines = first_page_text
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(normalize_line)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    if lines.is_empty() {
        return None;
    }

    let lower_title = title.to_lowercase();
    let title_index = lines
        .iter()
        .position(|line| line.to_lowercase().contains(&lower_title) || lower_title.contains(&line.to_lowercase()))
        .unwrap_or(0);

    let mut candidates = Vec::new();
    let end = usize::min(title_index + 10, lines.len());
    for line in &lines[(title_index + 1)..end] {
        if should_stop_author_scan(line) {
            break;
        }
        if should_skip_author_line(line) {
            continue;
        }
        candidates.push(line.clone());
    }

    if candidates.is_empty() {
        for line in lines.iter().take(12) {
            if should_stop_author_scan(line) || should_skip_author_line(line) {
                continue;
            }
            candidates.push(line.clone());
        }
    }

    let mut extracted = Vec::new();
    for line in candidates {
        for author in split_author_candidates(&line) {
            if is_human_name(&author) && !extracted.contains(&author) {
                extracted.push(author);
            }
        }
    }

    if extracted.is_empty() {
        None
    } else {
        Some(extracted)
    }
}

fn normalize_line(line: &str) -> String {
    line.replace(['*', '†', '‡', '§'], " ")
        .replace("  ", " ")
        .trim()
        .to_string()
}

fn should_stop_author_scan(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("abstract") || lower.contains("摘要") || lower.contains("introduction")
}

fn should_skip_author_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    let blocked = [
        "university",
        "institute",
        "department",
        "school",
        "laboratory",
        "college",
        "arxiv",
        "proceedings",
        "conference",
        "journal",
        "copyright",
    ];
    if lower.contains('@') || lower.contains("http") || blocked.iter().any(|kw| lower.contains(kw)) {
        return true;
    }
    let digit_count = line.chars().filter(|c| c.is_ascii_digit()).count();
    digit_count > line.chars().count() / 3
}

fn split_author_candidates(line: &str) -> Vec<String> {
    line.replace(" and ", ",")
        .replace(';', ",")
        .replace('|', ",")
        .split(',')
        .map(clean_author_token)
        .filter(|part| !part.is_empty())
        .collect()
}

fn clean_author_token(token: &str) -> String {
    token
        .chars()
        .filter(|ch| ch.is_ascii_alphabetic() || *ch == ' ' || *ch == '-' || *ch == '.')
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_human_name(value: &str) -> bool {
    let words = value.split_whitespace().collect::<Vec<_>>();
    if words.len() < 2 || words.len() > 5 {
        return false;
    }
    words.iter().all(|word| {
        let first = word.chars().next().unwrap_or('a');
        first.is_ascii_uppercase() || word.len() <= 2
    })
}
