export type ReadStatus = 'unread' | 'reading' | 'read';
export type ViewMode = 'grid' | 'list';

export type SmartShelfKey =
  | 'all'
  | 'recent_imported'
  | 'recent_read'
  | 'favorite'
  | 'unread'
  | 'reading'
  | 'read'
  | 'duplicates'
  | 'has_notes'
  | 'metadata_incomplete';

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  arxiv_id?: string;
  abstract: string;
  summary: string;
  category: string;
  tags: string[];
  file_name: string;
  original_path: string;
  managed_path: string;
  thumbnail_path?: string;
  is_favorite: boolean;
  read_status: ReadStatus;
  notes: string;
  has_notes?: boolean;
  file_hash?: string;
  last_opened_at?: string;
  last_read_page?: number;
  last_read_at?: string;
  metadata_completed_at?: string;
  is_metadata_incomplete: boolean;
  duplicate_key?: string;
  duplicate_reason?: string;
  title_source?: 'doi' | 'arxiv' | 'pdf_header' | 'filename' | 'manual' | 'metadata';
  title_confidence?: number;
  title_pending_confirmation?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaperFilters {
  query: string;
  category: string;
  readStatus: 'all' | ReadStatus;
  onlyFavorite: boolean;
  year?: number;
  sortBy: 'recent' | 'year' | 'title';
  smartShelf: SmartShelfKey;
}
