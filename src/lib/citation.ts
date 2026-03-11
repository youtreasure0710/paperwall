import type { Paper } from '@/types/paper';
import { formatCitation } from '@/lib/citationFormatter';

export function buildCitation(paper: Paper): string {
  return formatCitation(paper, 'gbt7714');
}
