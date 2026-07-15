import type { Paper } from '@/types/paper';

const REFERENCE_PREFIX = 'reference://';

export function isReferenceManagedPath(path?: string | null): boolean {
  if (!path) return false;
  return path.startsWith(REFERENCE_PREFIX);
}

export function resolvePaperFilePath(paper: Pick<Paper, 'managed_path' | 'original_path'>): string {
  const managed = (paper.managed_path || '').trim();
  const original = (paper.original_path || '').trim();
  if (managed && !isReferenceManagedPath(managed)) {
    return managed;
  }
  return original || managed;
}

export const PAPER_REFERENCE_PREFIX = REFERENCE_PREFIX;
