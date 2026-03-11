import { matchSmartShelf } from '@/lib/smartShelfSelector';
import type { Paper, PaperFilters } from '@/types/paper';

export function applyFilters(papers: Paper[], filters: PaperFilters): Paper[] {
  let result = papers.filter((paper) => {
    if (!matchSmartShelf(paper, filters.smartShelf)) {
      return false;
    }

    const query = filters.query.trim().toLowerCase();
    const hitQuery =
      !query ||
      paper.title.toLowerCase().includes(query) ||
      paper.authors.join(' ').toLowerCase().includes(query) ||
      paper.abstract.toLowerCase().includes(query) ||
      paper.category.toLowerCase().includes(query) ||
      `${paper.year ?? ''}`.includes(query);

    const hitCategory = filters.category === 'all' || paper.category === filters.category;
    const hitRead = filters.readStatus === 'all' || paper.read_status === filters.readStatus;
    const hitFavorite = !filters.onlyFavorite || paper.is_favorite;
    const hitYear = !filters.year || paper.year === filters.year;
    return hitQuery && hitCategory && hitRead && hitFavorite && hitYear;
  });

  result = [...result].sort((a, b) => {
    if (filters.sortBy === 'title') return a.title.localeCompare(b.title, 'zh-Hans-CN');
    if (filters.sortBy === 'year') return (b.year ?? 0) - (a.year ?? 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return result;
}
