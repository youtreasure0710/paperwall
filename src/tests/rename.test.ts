import { describe, expect, it } from 'vitest';
import { renameSuggestion } from '@/lib/rename';
import type { Paper } from '@/types/paper';

const basePaper: Paper = {
  id: '1',
  title: 'Agent / Planning: A <Case>',
  authors: ['Zhang'],
  year: 2024,
  venue: '',
  doi: '',
  arxiv_id: '',
  abstract: '',
  summary: '',
  category: 'Agent',
  tags: [],
  file_name: 'raw.pdf',
  original_path: '',
  managed_path: '',
  thumbnail_path: '',
  is_favorite: false,
  read_status: 'unread',
  notes: '',
  file_hash: '',
  last_opened_at: '',
  last_read_page: 1,
  last_read_at: '',
  metadata_completed_at: '',
  is_metadata_incomplete: false,
  duplicate_key: '',
  duplicate_reason: '',
  created_at: '',
  updated_at: '',
};

describe('renameSuggestion', () => {
  it('sanitizes invalid characters', () => {
    expect(renameSuggestion(basePaper)).toBe('2024 - Zhang - Agent Planning A Case .pdf');
  });

  it('degrades gracefully on missing metadata', () => {
    expect(renameSuggestion({ ...basePaper, year: undefined, authors: [], title: '' })).toContain('UnknownYear');
  });
});
