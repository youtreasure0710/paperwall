import type { Paper } from '@/types/paper';

export type CitationFormat = 'endnote_ris' | 'gbt7714';

function authorsText(paper: Paper) {
  return paper.authors.length > 0 ? paper.authors.join(', ') : '未知作者';
}

function titleText(paper: Paper) {
  return paper.title?.trim() || '未命名论文';
}

function venueText(paper: Paper) {
  return paper.venue?.trim() || '未知刊物';
}

function yearText(paper: Paper) {
  return paper.year ? `${paper.year}` : '';
}

function risValue(value?: string) {
  return value?.trim() || '';
}

function formatEndnoteRis(paper: Paper) {
  const lines: string[] = ['TY  - JOUR'];
  lines.push(`TI  - ${titleText(paper)}`);
  if (paper.authors.length > 0) {
    for (const author of paper.authors) {
      lines.push(`AU  - ${author}`);
    }
  } else {
    lines.push('AU  - 未知作者');
  }
  if (paper.year) lines.push(`PY  - ${paper.year}`);
  if (paper.venue?.trim()) lines.push(`JO  - ${paper.venue.trim()}`);
  if (paper.doi?.trim()) lines.push(`DO  - ${paper.doi.trim()}`);
  if (paper.arxiv_id?.trim()) lines.push(`ID  - arXiv:${paper.arxiv_id.trim()}`);
  if (paper.abstract?.trim()) lines.push(`AB  - ${paper.abstract.trim().replace(/\s+/g, ' ')}`);
  lines.push('ER  -');
  return lines.join('\n');
}

function formatGbt7714(paper: Paper) {
  const authors = authorsText(paper);
  const title = titleText(paper);
  const venue = venueText(paper);
  const year = yearText(paper);
  const doi = risValue(paper.doi);
  const base = `${authors}. ${title}[J]. ${venue}${year ? `, ${year}` : ''}.`;
  return doi ? `${base} DOI:${doi}.` : base;
}

export function formatCitation(paper: Paper, format: CitationFormat): string {
  switch (format) {
    case 'endnote_ris':
      return formatEndnoteRis(paper);
    case 'gbt7714':
      return formatGbt7714(paper);
    default:
      return formatGbt7714(paper);
  }
}
