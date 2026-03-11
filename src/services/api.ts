import { invoke } from '@tauri-apps/api/core';
import type { Category } from '@/types/category';
import type { CreateNoteInput, NoteItem } from '@/types/note';
import type { AppSettings } from '@/types/settings';
import type { Paper, ReadStatus } from '@/types/paper';

export interface ImportResult {
  imported: Paper[];
  skipped: Array<{ path: string; reason: string }>;
  failed: Array<{ path: string; reason: string }>;
}

export interface MetadataEnrichResult {
  updated?: Paper;
  source?: string;
  message: string;
}

export interface BulkMetadataEnrichResult {
  success_count: number;
  failed: Array<{ path: string; reason: string }>;
}

export async function initApp() {
  return invoke<void>('init_app');
}

export async function listPapers() {
  return invoke<Paper[]>('list_papers');
}

export async function listCategories() {
  return invoke<Category[]>('list_categories');
}

export async function createCategory(name: string) {
  return invoke<Category>('create_category', { name });
}

export async function renameCategory(oldName: string, newName: string) {
  return invoke<Category>('rename_category', { oldName, newName });
}

export async function deleteCategory(name: string) {
  return invoke<void>('delete_category', { name });
}

export async function importPdfs(paths: string[], duplicatePolicy: 'skip' | 'keep' = 'skip') {
  return invoke<ImportResult>('import_pdfs', { paths, duplicatePolicy });
}

export async function updatePaper(paper: Paper) {
  return invoke<Paper>('update_paper', { paper });
}

export async function applyRename(id: string) {
  return invoke<Paper>('apply_rename', { id });
}

export async function setFavorite(id: string, value: boolean) {
  return invoke<Paper>('set_favorite', { id, value });
}

export async function setReadStatus(id: string, value: ReadStatus) {
  return invoke<Paper>('set_read_status', { id, value });
}

export async function setReadProgress(id: string, page: number) {
  return invoke<Paper>('set_read_progress', { id, page });
}

export async function setCategory(id: string, category: string) {
  return invoke<Paper>('set_category', { id, category });
}

export async function updateNotes(id: string, notes: string) {
  return invoke<Paper>('update_notes', { id, notes });
}

export async function reclassifyPaper(id: string) {
  return invoke<Paper>('reclassify_paper', { id });
}

export async function updateThumbnail(id: string, thumbnailPath: string) {
  return invoke<Paper>('update_thumbnail', { id, thumbnailPath });
}

export async function saveThumbnail(id: string, dataUrl: string) {
  return invoke<Paper>('save_thumbnail', { id, dataUrl });
}

export async function ensureThumbnail(id: string) {
  return invoke<Paper>('ensure_thumbnail', { id });
}

export async function assertPathExists(path: string) {
  return invoke<void>('assert_path_exists', { path });
}

export async function openPdfFile(paperId: string, path: string) {
  return invoke<void>('open_pdf_file', { paperId, path });
}

export async function deletePaper(id: string) {
  return invoke<void>('delete_paper', { id });
}

export async function listNotes(paperId: string) {
  return invoke<NoteItem[]>('list_notes', { paperId });
}

export async function createNote(note: CreateNoteInput) {
  return invoke<NoteItem>('create_note', { note });
}

export async function deleteNote(id: string) {
  return invoke<void>('delete_note', { id });
}

export async function updateNoteHighlightColor(id: string, color: 'yellow' | 'blue' | 'red') {
  return invoke<NoteItem>('update_note_highlight_color', { id, color });
}

export async function getAppSettings() {
  return invoke<AppSettings>('get_app_settings');
}

export async function saveAppSettings(settings: AppSettings) {
  return invoke<AppSettings>('save_app_settings', { settings });
}

export async function enrichPaperMetadata(id: string, forceOverride = false) {
  return invoke<MetadataEnrichResult>('enrich_paper_metadata', { id, forceOverride });
}

export async function enrichAllMetadata(forceOverride = false) {
  return invoke<BulkMetadataEnrichResult>('enrich_all_metadata', { forceOverride });
}
