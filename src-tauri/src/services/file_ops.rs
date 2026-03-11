use std::fs;
use std::path::{Path, PathBuf};

pub fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| format!("create dir failed: {e}"))
}

pub fn copy_into_library(original_path: &Path, library_dir: &Path, id: &str, source_name: &str) -> Result<PathBuf, String> {
    let ext = original_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("pdf");
    let base = source_name.trim_end_matches(".pdf");
    let managed_name = sanitize_filename::sanitize(format!("{}-{}.{}", id, base, ext));
    let managed_path = library_dir.join(managed_name);
    fs::copy(original_path, &managed_path).map_err(|e| format!("copy file failed: {e}"))?;
    Ok(managed_path)
}

pub fn rename_managed_file(old_path: &Path, new_name: &str) -> Result<PathBuf, String> {
    let parent = old_path
        .parent()
        .ok_or_else(|| "invalid managed path".to_string())?;
    let mut target = parent.join(new_name);
    if target.exists() {
        let stem = new_name.trim_end_matches(".pdf");
        target = parent.join(format!("{}-1.pdf", stem));
    }
    fs::rename(old_path, &target).map_err(|e| format!("rename failed: {e}"))?;
    Ok(target)
}
