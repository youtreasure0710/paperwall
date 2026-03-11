import { describe, expect, test } from 'vitest';
import { matchSmartShelf } from '@/lib/smartShelfSelector';
import type { Paper } from '@/types/paper';

const now = new Date().toISOString();

const paper: Paper = {
  id: 'p1',
  title: 'Test',
  authors: ['A B'],
  year: 2024,
  venue: 'TestConf',
  doi: '',
  arxiv_id: '',
  abstract: 'abc',
  summary: 'abc',
  category: 'Other',
  tags: [],
  file_name: 'test.pdf',
  original_path: '/tmp/test.pdf',
  managed_path: '/tmp/test.pdf',
  thumbnail_path: '',
  is_favorite: true,
  read_status: 'reading',
  notes: 'note',
  file_hash: 'hash',
  last_opened_at: now,
  last_read_page: 2,
  last_read_at: now,
  metadata_completed_at: now,
  is_metadata_incomplete: true,
  duplicate_key: 'doi:1',
  duplicate_reason: 'DOI 相同',
  created_at: now,
  updated_at: now,
};

describe('smart shelf selector', () => {
  test('matches favorite shelf', () => {
    expect(matchSmartShelf(paper, 'favorite')).toBe(true);
  });

  test('matches duplicate shelf', () => {
    expect(matchSmartShelf(paper, 'duplicates')).toBe(true);
  });

  test('matches metadata incomplete shelf', () => {
    expect(matchSmartShelf(paper, 'metadata_incomplete')).toBe(true);
  });
});
