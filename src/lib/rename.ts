import type { Paper } from '@/types/paper';

const INVALID_FILENAME = /[<>:"/\\|?*]/g;

function cleanSegment(value: string): string {
  return value.replace(INVALID_FILENAME, ' ').replace(/\s+/g, ' ').trim();
}

export function renameSuggestion(paper: Paper): string {
  const firstAuthor = paper.authors[0] ?? 'UnknownAuthor';
  const title = paper.title || paper.file_name.replace(/\.pdf$/i, '');
  const year = paper.year ? `${paper.year}` : 'UnknownYear';
  const suggestion = `${year} - ${firstAuthor} - ${title}.pdf`;
  return cleanSegment(suggestion);
}
