import { describe, expect, test } from 'vitest';
import { formatCitation } from '@/lib/citationFormatter';
import type { Paper } from '@/types/paper';

const basePaper: Paper = {
  id: '1',
  title: 'Attention Is All You Need',
  authors: ['Ashish Vaswani', 'Noam Shazeer'],
  year: 2017,
  venue: 'NeurIPS',
  doi: '10.5555/3295222.3295349',
  arxiv_id: '1706.03762',
  abstract: 'Test abstract',
  summary: 'Test summary',
  category: 'NLP',
  tags: [],
  file_name: 'a.pdf',
  original_path: '/tmp/a.pdf',
  managed_path: '/tmp/a.pdf',
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
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('citation formatter', () => {
  test('formats endnote ris', () => {
    const citation = formatCitation(basePaper, 'endnote_ris');
    expect(citation).toContain('Attention Is All You Need');
    expect(citation).toContain('TY  - JOUR');
    expect(citation).toContain('AU  - Ashish Vaswani');
  });

  test('formats gbt7714', () => {
    const citation = formatCitation(basePaper, 'gbt7714');
    expect(citation).toContain('Attention Is All You Need');
    expect(citation).toContain('[J]');
  });
});
