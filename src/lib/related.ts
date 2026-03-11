import type { Paper } from '@/types/paper';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((v) => v.length >= 3);
}

function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let hit = 0;
  for (const t of a) {
    if (setB.has(t)) hit += 1;
  }
  return hit;
}

export function findRelatedPapers(target: Paper, papers: Paper[], limit = 5): Paper[] {
  const targetTitleTokens = tokenize(target.title || '');
  const targetAbsTokens = tokenize(target.abstract || '');
  const targetAuthors = new Set(target.authors.map((a) => a.toLowerCase()));

  return papers
    .filter((paper) => paper.id !== target.id)
    .map((paper) => {
      let score = 0;
      if (paper.category === target.category) score += 3;
      const sameAuthors = paper.authors.some((a) => targetAuthors.has(a.toLowerCase()));
      if (sameAuthors) score += 4;
      score += overlapScore(targetTitleTokens, tokenize(paper.title || '')) * 2;
      score += overlapScore(targetAbsTokens, tokenize(paper.abstract || ''));
      return { paper, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.paper);
}
