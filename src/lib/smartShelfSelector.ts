import type { Paper, SmartShelfKey } from '@/types/paper';

const RECENT_DAYS = 14;

function isRecent(date?: string, days = RECENT_DAYS) {
  if (!date) return false;
  const ms = new Date(date).getTime();
  if (Number.isNaN(ms)) return false;
  const diff = Date.now() - ms;
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

export function matchSmartShelf(paper: Paper, shelf: SmartShelfKey): boolean {
  switch (shelf) {
    case 'all':
      return true;
    case 'recent_imported':
      return isRecent(paper.created_at);
    case 'recent_read':
      return isRecent(paper.last_opened_at);
    case 'favorite':
      return paper.is_favorite;
    case 'unread':
      return paper.read_status === 'unread';
    case 'reading':
      return paper.read_status === 'reading';
    case 'read':
      return paper.read_status === 'read';
    case 'duplicates':
      return Boolean(paper.duplicate_key);
    case 'has_notes':
      return Boolean(paper.has_notes) || paper.notes.trim().length > 0;
    case 'metadata_incomplete':
      return paper.is_metadata_incomplete;
    default:
      return true;
  }
}

export function smartShelfCount(papers: Paper[], shelf: SmartShelfKey): number {
  return papers.filter((paper) => matchSmartShelf(paper, shelf)).length;
}
