mod commands;
mod db;
mod models;
mod services {
    pub mod classifier;
    pub mod dedupe;
    pub mod external_reader;
    pub mod file_ops;
    pub mod metadata;
    pub mod metadata_enrichment;
    pub mod rename;
}

use std::path::PathBuf;

use tauri::Manager;

pub struct AppState {
    pub app_dir: PathBuf,
    pub db_path: PathBuf,
    pub library_dir: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let home_dir = dirs::home_dir().ok_or_else(|| "resolve home dir failed".to_string())?;
            let app_dir = home_dir.join("PaperWall");
            let library_dir = app_dir.join("library");
            let db_path = app_dir.join("paperwall.db");
            app.manage(AppState {
                app_dir,
                db_path,
                library_dir,
            });
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::init_app,
            commands::list_papers,
            commands::list_categories,
            commands::create_category,
            commands::rename_category,
            commands::delete_category,
            commands::import_pdfs,
            commands::ensure_thumbnail,
            commands::update_paper,
            commands::apply_rename,
            commands::set_favorite,
            commands::set_read_status,
            commands::set_read_progress,
            commands::set_category,
            commands::assert_path_exists,
            commands::open_pdf_file,
            commands::delete_paper,
            commands::list_notes,
            commands::create_note,
            commands::delete_note,
            commands::update_note_highlight_color,
            commands::update_notes,
            commands::reclassify_paper,
            commands::update_thumbnail,
            commands::save_thumbnail,
            commands::get_app_settings,
            commands::save_app_settings,
            commands::enrich_paper_metadata,
            commands::enrich_all_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
