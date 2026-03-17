import type { NoteItem } from '@/types/note';
import type { Paper } from '@/types/paper';

type HighlightColor = 'yellow' | 'blue' | 'red';

interface HighlightMeta {
  kind?: string;
  color?: string;
}

const INVALID_FILENAME = /[<>:"/\\|?*\u0000-\u001f]/g;

function cleanInline(value?: string) {
  return (value ?? '').replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value?: string) {
  return (value ?? '').replace(/\r\n/g, '\n').trim();
}

function parseHighlightMeta(comment?: string): HighlightMeta | null {
  if (!comment) return null;
  try {
    const parsed = JSON.parse(comment) as HighlightMeta;
    if (parsed.kind === 'highlight') return parsed;
  } catch {
    return null;
  }
  return null;
}

function formatListLine(text: string, page?: number) {
  const body = text.trim();
  if (!body) return '';
  if (typeof page === 'number' && Number.isFinite(page)) {
    return `- (p.${page}) ${body}`;
  }
  return `- ${body}`;
}

function buildHighlightSection(title: string, items: NoteItem[]) {
  if (items.length === 0) return '';
  const lines = items
    .map((item) => formatListLine(cleanMultiline(item.selected_text || item.content), item.page_number))
    .filter(Boolean);
  if (lines.length === 0) return '';
  return `### ${title}\n${lines.join('\n')}\n`;
}

export function suggestedMarkdownFileName(paper: Paper) {
  const raw = cleanInline(paper.title) || cleanInline(paper.file_name.replace(/\.pdf$/i, '')) || `paper-${paper.id}`;
  const clean = raw.replace(INVALID_FILENAME, ' ').replace(/\s+/g, ' ').trim();
  return `${(clean || `paper-${paper.id}`).slice(0, 120)}.md`;
}

export function buildPaperMarkdown(paper: Paper, notes: NoteItem[]) {
  const title = cleanInline(paper.title) || cleanInline(paper.file_name.replace(/\.pdf$/i, '')) || 'Untitled Paper';
  const authors = paper.authors.length > 0 ? paper.authors.join(', ') : '';
  const tags = (paper.tags || []).map((t) => cleanInline(t)).filter(Boolean);

  const highlights: Record<HighlightColor, NoteItem[]> = {
    yellow: [],
    blue: [],
    red: [],
  };
  const plainNotes: NoteItem[] = [];
  const excerpts: NoteItem[] = [];

  for (const item of notes) {
    if (item.note_type === 'note') {
      plainNotes.push(item);
      continue;
    }
    if (item.note_type === 'excerpt') {
      excerpts.push(item);
      continue;
    }
    if (item.note_type === 'annotation') {
      const meta = parseHighlightMeta(item.comment);
      if (meta?.color === 'yellow' || meta?.color === 'blue' || meta?.color === 'red') {
        highlights[meta.color].push(item);
      }
    }
  }

  const sections: string[] = [];
  sections.push(`# ${title}`);
  sections.push('## Metadata');
  if (authors) sections.push(`- Authors: ${authors}`);
  if (paper.year) sections.push(`- Year: ${paper.year}`);
  if (paper.venue) sections.push(`- Venue: ${cleanInline(paper.venue)}`);
  if (paper.doi) sections.push(`- DOI: ${cleanInline(paper.doi)}`);
  if (paper.arxiv_id) sections.push(`- arXiv: ${cleanInline(paper.arxiv_id)}`);
  if (paper.category) sections.push(`- Category: ${cleanInline(paper.category)}`);
  if (tags.length > 0) sections.push(`- Tags: ${tags.map((t) => `#${t}`).join(' ')}`);

  const abstractText = cleanMultiline(paper.abstract);
  if (abstractText) {
    sections.push('');
    sections.push('## Abstract');
    sections.push(abstractText);
  }

  const highlightSections = [
    buildHighlightSection('Yellow Highlights', highlights.yellow),
    buildHighlightSection('Blue Highlights', highlights.blue),
    buildHighlightSection('Red Highlights', highlights.red),
  ].filter(Boolean);
  if (highlightSections.length > 0) {
    sections.push('');
    sections.push('## Highlights');
    sections.push(highlightSections.join('\n'));
  }

  const noteLines = plainNotes
    .map((item) => formatListLine(cleanMultiline(item.content || item.selected_text), item.page_number))
    .filter(Boolean);
  if (noteLines.length > 0) {
    sections.push('');
    sections.push('## Notes');
    sections.push(noteLines.join('\n'));
  }

  const excerptLines = excerpts
    .map((item) => formatListLine(cleanMultiline(item.selected_text || item.content), item.page_number))
    .filter(Boolean);
  if (excerptLines.length > 0) {
    sections.push('');
    sections.push('## Excerpts');
    sections.push(excerptLines.join('\n'));
  }

  return `${sections.join('\n')}\n`;
}
