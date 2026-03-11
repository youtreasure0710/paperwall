import { create } from 'zustand';
import { applyFilters } from '@/lib/filter';
import type { Paper, PaperFilters, ReadStatus, ViewMode } from '@/types/paper';

interface PaperState {
  papers: Paper[];
  selectedId?: string;
  filters: PaperFilters;
  viewMode: ViewMode;
  loading: boolean;
  error?: string;
  categories: string[];
  setCategories: (categories: string[]) => void;
  setPapers: (papers: Paper[]) => void;
  patchPaper: (paper: Paper) => void;
  setSelectedId: (id?: string) => void;
  setFilters: (next: Partial<PaperFilters>) => void;
  setViewMode: (mode: ViewMode) => void;
  setLoading: (loading: boolean) => void;
  setError: (error?: string) => void;
  updateReadStatusLocal: (id: string, status: ReadStatus) => void;
}

const defaultFilters: PaperFilters = {
  query: '',
  category: 'all',
  readStatus: 'all',
  onlyFavorite: false,
  sortBy: 'recent',
  smartShelf: 'all',
};

export const usePaperStore = create<PaperState>((set, get) => ({
  papers: [],
  selectedId: undefined,
  filters: defaultFilters,
  viewMode: 'grid',
  loading: false,
  error: undefined,
  categories: [],
  setCategories: (categories) => set({ categories }),
  setPapers: (papers) => set({ papers }),
  patchPaper: (paper) =>
    set({
      papers: get().papers.map((it) => (it.id === paper.id ? paper : it)),
    }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setFilters: (next) => set({ filters: { ...get().filters, ...next } }),
  setViewMode: (viewMode) => set({ viewMode }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  updateReadStatusLocal: (id, status) =>
    set({ papers: get().papers.map((p) => (p.id === id ? { ...p, read_status: status } : p)) }),
}));

export function useVisiblePapers() {
  const papers = usePaperStore((s) => s.papers);
  const filters = usePaperStore((s) => s.filters);
  return applyFilters(papers, filters);
}
