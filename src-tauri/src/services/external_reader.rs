use std::path::Path;
use std::process::Command;

use crate::models::AppSettings;

pub fn open_pdf_with_settings(path: &Path, settings: &AppSettings) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("PDF 文件不存在: {}", path.display()));
    }

    let is_pdf = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err("目标文件不是 PDF。".to_string());
    }

    match settings.reader_mode.as_str() {
        "custom" => {
            let reader = settings
                .external_reader_path
                .as_deref()
                .ok_or_else(|| "未配置外部阅读器路径".to_string())?;
            let reader_path = Path::new(reader);
            if !reader_path.exists() {
                return Err(format!("外部阅读器不存在: {}", reader_path.display()));
            }
            let status = Command::new(reader_path)
                .arg(path)
                .status()
                .map_err(|e| format!("调用外部阅读器失败: {e}"))?;
            if !status.success() {
                return Err(format!("外部阅读器打开失败，退出码: {status}"));
            }
            Ok(())
        }
        _ => {
            let status = Command::new("open")
                .arg(path)
                .status()
                .map_err(|e| format!("调用系统 open 命令失败: {e}"))?;
            if !status.success() {
                return Err(format!("系统打开 PDF 失败，退出码: {status}"));
            }
            Ok(())
        }
    }
}
