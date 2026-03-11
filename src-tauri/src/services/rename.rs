use sanitize_filename::sanitize;

use crate::models::Paper;

pub fn suggestion(paper: &Paper) -> String {
    let year = paper
        .year
        .map(|v| v.to_string())
        .unwrap_or_else(|| "UnknownYear".to_string());
    let first_author = paper
        .authors
        .first()
        .cloned()
        .unwrap_or_else(|| "UnknownAuthor".to_string());
    let title = if paper.title.is_empty() {
        paper.file_name.trim_end_matches(".pdf").to_string()
    } else {
        paper.title.clone()
    };
    let raw = format!("{} - {} - {}.pdf", year, first_author, title);
    sanitize(raw).replace('_', " ")
}
