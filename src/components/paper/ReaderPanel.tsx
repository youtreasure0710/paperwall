import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Maximize2, Minimize2 } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resolvePaperFilePath } from '@/lib/paperPath';
import { toPdfSrc } from '@/services/pdf';
import type { CreateNoteInput, NoteItem } from '@/types/note';
import type { Paper } from '@/types/paper';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface ReaderPanelProps {
  open: boolean;
  paper?: Paper;
  notes: NoteItem[];
  autoResumeReading: boolean;
  focusTarget?: {
    token: number;
    page?: number;
    noteId?: string;
  };
  onClose: () => void;
  onProgress: (paper: Paper, page: number) => Promise<void>;
  onCreateNote: (note: CreateNoteInput) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
  onUpdateHighlightColor: (id: string, color: HighlightColor) => Promise<void>;
  onUpdateHighlightRemark: (id: string, remark: string) => Promise<void>;
}

type HighlightColor = 'yellow' | 'blue' | 'red';

interface PersistedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PersistedHighlight {
  id: string;
  color: HighlightColor;
  pageNumber: number;
  rects: PersistedRect[];
}

type ReaderNoteGroupKey = 'yellow' | 'blue' | 'red' | 'note' | 'excerpt';

interface ReaderNoteItemView {
  id: string;
  page: number | null;
  text: string;
  comment?: string;
  highlightTop?: number;
}

const readerNoteGroupOrder: ReaderNoteGroupKey[] = ['yellow', 'blue', 'red', 'note', 'excerpt'];

function parseHighlightPayload(comment?: string): { kind?: string; color?: string } | null {
  if (!comment) return null;
  try {
    const parsed = JSON.parse(comment) as { kind?: string; color?: string };
    return parsed;
  } catch {
    return null;
  }
}

function readerGroupTitle(key: ReaderNoteGroupKey) {
  if (key === 'yellow') return '黄色高亮';
  if (key === 'blue') return '蓝色高亮';
  if (key === 'red') return '红色高亮';
  if (key === 'note') return '笔记';
  return '摘要';
}

function readerGroupAccent(key: ReaderNoteGroupKey) {
  if (key === 'yellow') return 'border-[rgba(255,214,102,0.5)] pw-hl-yellow-soft';
  if (key === 'blue') return 'border-[rgba(120,160,255,0.45)] pw-hl-blue-soft';
  if (key === 'red') return 'border-[rgba(255,130,130,0.45)] pw-hl-red-soft';
  if (key === 'note') return 'border-[var(--border-default)] bg-[var(--bg-surface-secondary)]';
  return 'border-[rgba(110,198,153,0.45)] bg-[rgba(110,198,153,0.12)]';
}

function readerItemAccent(key: ReaderNoteGroupKey) {
  if (key === 'yellow') return 'border-l-4 border-[rgba(255,214,102,0.8)] pw-hl-yellow-soft';
  if (key === 'blue') return 'border-l-4 border-[rgba(120,160,255,0.75)] pw-hl-blue-soft';
  if (key === 'red') return 'border-l-4 border-[rgba(255,130,130,0.75)] pw-hl-red-soft';
  if (key === 'note') return 'border-l-4 border-[var(--border-strong)] bg-[var(--bg-surface-secondary)]';
  return 'border-l-4 border-[rgba(110,198,153,0.95)] bg-[rgba(110,198,153,0.12)]';
}

function readerItemActiveAccent(key: ReaderNoteGroupKey) {
  if (key === 'yellow') return 'ring-1 ring-[rgba(255,214,102,0.9)]';
  if (key === 'blue') return 'ring-1 ring-[rgba(120,160,255,0.9)]';
  if (key === 'red') return 'ring-1 ring-[rgba(255,130,130,0.9)]';
  if (key === 'note') return 'ring-1 ring-[var(--border-strong)]';
  return 'ring-1 ring-[rgba(110,198,153,0.9)]';
}

function readerItemBorderTone(key: ReaderNoteGroupKey) {
  if (key === 'yellow') return 'border-[rgba(255,214,102,0.55)]';
  if (key === 'blue') return 'border-[rgba(120,160,255,0.5)]';
  if (key === 'red') return 'border-[rgba(255,130,130,0.5)]';
  return 'border-[var(--border-default)]';
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function dedupeNormalizedRects(rects: PersistedRect[]): PersistedRect[] {
  if (rects.length <= 1) return rects;
  const unique = new Map<string, PersistedRect>();
  for (const rect of rects) {
    const normalized = {
      left: round4(rect.left),
      top: round4(rect.top),
      width: round4(rect.width),
      height: round4(rect.height),
    };
    if (normalized.width <= 0.001 || normalized.height <= 0.001) continue;
    const key = `${normalized.left}:${normalized.top}:${normalized.width}:${normalized.height}`;
    if (!unique.has(key)) unique.set(key, normalized);
  }
  return Array.from(unique.values()).sort((a, b) => {
    if (Math.abs(a.top - b.top) > 0.002) return a.top - b.top;
    return a.left - b.left;
  });
}

function mergeNormalizedRectsByLine(rects: PersistedRect[]): PersistedRect[] {
  if (rects.length <= 1) return rects;
  const sorted = [...rects].sort((a, b) => {
    if (Math.abs(a.top - b.top) > 0.002) return a.top - b.top;
    return a.left - b.left;
  });

  const avgHeight = sorted.reduce((sum, item) => sum + item.height, 0) / sorted.length;
  const rowTolerance = Math.max(0.0025, Math.min(0.02, avgHeight * 0.6));
  const gapTolerance = Math.max(0.0035, Math.min(0.015, avgHeight * 0.75));

  const rows: PersistedRect[][] = [];
  for (const rect of sorted) {
    const centerY = rect.top + rect.height / 2;
    let matchedRow: PersistedRect[] | null = null;
    for (const row of rows) {
      const ref = row[0];
      const refCenter = ref.top + ref.height / 2;
      if (Math.abs(centerY - refCenter) <= rowTolerance) {
        matchedRow = row;
        break;
      }
    }
    if (!matchedRow) {
      rows.push([rect]);
    } else {
      matchedRow.push(rect);
    }
  }

  const merged: PersistedRect[] = [];
  for (const row of rows) {
    const line = [...row].sort((a, b) => a.left - b.left);
    let current = { ...line[0] };
    for (let i = 1; i < line.length; i += 1) {
      const next = line[i];
      const currentRight = current.left + current.width;
      const nextRight = next.left + next.width;
      const gap = next.left - currentRight;
      if (gap <= gapTolerance) {
        const mergedLeft = Math.min(current.left, next.left);
        const mergedTop = Math.min(current.top, next.top);
        const mergedRight = Math.max(currentRight, nextRight);
        const mergedBottom = Math.max(current.top + current.height, next.top + next.height);
        current = {
          left: mergedLeft,
          top: mergedTop,
          width: mergedRight - mergedLeft,
          height: mergedBottom - mergedTop,
        };
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  }

  return merged.sort((a, b) => {
    if (Math.abs(a.top - b.top) > 0.002) return a.top - b.top;
    return a.left - b.left;
  });
}

function normalizeRectsForPersist(rects: PersistedRect[]): PersistedRect[] {
  return mergeNormalizedRectsByLine(dedupeNormalizedRects(rects));
}

function buildPageWindow(centerPage: number, totalPages: number): number[] {
  if (totalPages <= 0) return [];
  const center = Math.min(Math.max(centerPage, 1), totalPages);
  const start = center <= 1 ? 1 : Math.max(1, center - 1);
  const end = center <= 1 ? Math.min(2, totalPages) : Math.min(totalPages, center + 1);
  const pages: number[] = [];
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

export function ReaderPanel(props: ReaderPanelProps) {
  const { open, paper } = props;
  const currentPaper = paper ?? null;
  const [showShell, setShowShell] = useState(open);
  const [panelVisible, setPanelVisible] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [selectedText, setSelectedText] = useState('');
  const [comment, setComment] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null);
  const [persistedHighlights, setPersistedHighlights] = useState<PersistedHighlight[]>([]);
  const [highlightMenu, setHighlightMenu] = useState<{
    noteId: string;
    color: HighlightColor;
    x: number;
    y: number;
    remark?: string;
  } | null>(null);
  const [highlightRemarkDraft, setHighlightRemarkDraft] = useState('');
  const [inlineRemarkEditor, setInlineRemarkEditor] = useState<{ noteId: string; draft: string } | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<ReaderNoteGroupKey, boolean>>({
    yellow: false,
    blue: false,
    red: false,
    note: false,
    excerpt: false,
  });
  const [readerToastText, setReaderToastText] = useState('');
  const [readerToastVisible, setReaderToastVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const readerToastTimerRef = useRef<number | null>(null);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const focusAppliedTokenRef = useRef<number | null>(null);
  const didAutoScrollRef = useRef(false);
  const [pageWidth, setPageWidth] = useState(760);
  const [pageRenderTick, setPageRenderTick] = useState(0);
  const [activePages, setActivePages] = useState<Set<number>>(() => new Set([1, 2]));
  const pageHeightCacheRef = useRef<Map<number, number>>(new Map());
  const [fallbackPageHeight, setFallbackPageHeight] = useState<number>(Math.round(760 * 1.414));
  const latestPageRef = useRef(1);
  const latestPaperRef = useRef<Paper | null>(null);
  const wasOpenRef = useRef(false);
  const initStateRef = useRef<{ open: boolean; paperId?: string; focusToken?: number }>({
    open: false,
    paperId: undefined,
    focusToken: undefined,
  });

  useEffect(() => {
    console.info('[ReaderPanel] worker initialized', {
      workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
    });
  }, []);

  useEffect(() => {
    if (!paper) return;
    setCurrentPage(props.autoResumeReading && paper.last_read_page && paper.last_read_page > 0 ? paper.last_read_page : 1);
    setSelectedText('');
    setComment('');
    setLoadError('');
    setSelectionMenu(null);
    setHighlightMenu(null);
    setHighlightRemarkDraft('');
    setInlineRemarkEditor(null);
    setCollapsedGroups({
      yellow: false,
      blue: false,
      red: false,
      note: false,
      excerpt: false,
    });
    setActiveNoteId(null);
    setPersistedHighlights([]);
    setNumPages(0);
    setPageRenderTick(0);
    setActivePages(new Set([1, 2]));
    pageHeightCacheRef.current.clear();
    setFallbackPageHeight(Math.round(760 * 1.414));
    didAutoScrollRef.current = false;
    pageElementsRef.current.clear();
  }, [paper?.id, props.autoResumeReading]);

  useEffect(() => {
    if (open) {
      setShowShell(true);
      setPanelVisible(false);
      const t = window.setTimeout(() => {
        setPanelVisible(true);
      }, 60);
      return () => window.clearTimeout(t);
    }
    setPanelVisible(false);
    setShowShell(false);
    return undefined;
  }, [open]);

  useEffect(() => {
    const focusToken = props.focusTarget?.token;
    const focusPage = props.focusTarget?.page;
    if (!open || !paper) {
      initStateRef.current = { open, paperId: paper?.id, focusToken };
      return;
    }
    const becameOpen = open && !initStateRef.current.open;
    const paperChanged = initStateRef.current.paperId !== paper.id;
    const focusChanged = typeof focusToken === 'number' && focusToken !== initStateRef.current.focusToken;
    if (becameOpen || paperChanged || focusChanged) {
      const targetPage =
        focusPage && focusPage > 0
          ? focusPage
          : props.autoResumeReading && paper.last_read_page && paper.last_read_page > 0
            ? paper.last_read_page
            : 1;
      setCurrentPage(targetPage);
      didAutoScrollRef.current = false;
      focusAppliedTokenRef.current = null;
      setSelectionMenu(null);
      setHighlightMenu(null);
      setHighlightRemarkDraft('');
      setInlineRemarkEditor(null);
      setActiveNoteId(null);
    }
    initStateRef.current = { open, paperId: paper.id, focusToken };
  }, [open, paper?.id, props.focusTarget?.token, props.focusTarget?.page, props.autoResumeReading]);

  useEffect(() => {
    latestPageRef.current = currentPage;
    latestPaperRef.current = currentPaper;
  }, [currentPage, currentPaper]);

  useEffect(() => {
    if (!open && wasOpenRef.current) {
      const paperToFlush = latestPaperRef.current;
      const pageToFlush = latestPageRef.current;
      if (paperToFlush && pageToFlush > 0) {
        void props.onProgress(paperToFlush, pageToFlush);
      }
    }
    wasOpenRef.current = open;
  }, [open, props.onProgress]);

  useEffect(() => {
    if (!currentPaper) {
      setPersistedHighlights([]);
      return;
    }
    const next: PersistedHighlight[] = [];
    for (const item of props.notes) {
      if (item.paper_id !== currentPaper.id || item.note_type !== 'annotation') continue;
      if (!item.comment) continue;
      try {
        const payload = JSON.parse(item.comment) as {
          kind?: string;
          color?: string;
          rects?: PersistedRect[];
          pageNumber?: number;
        };
        if (payload.kind !== 'highlight') continue;
        const color = payload.color;
        if (color !== 'yellow' && color !== 'blue' && color !== 'red') continue;
        const pageNumber = item.page_number ?? payload.pageNumber ?? 0;
        if (!pageNumber || !Array.isArray(payload.rects) || payload.rects.length === 0) continue;
        const rects = payload.rects
          .filter((rect) =>
            Number.isFinite(rect.left)
            && Number.isFinite(rect.top)
            && Number.isFinite(rect.width)
            && Number.isFinite(rect.height)
          )
          .map((rect) => ({
            left: Math.max(0, Math.min(1, rect.left)),
            top: Math.max(0, Math.min(1, rect.top)),
            width: Math.max(0, Math.min(1, rect.width)),
            height: Math.max(0, Math.min(1, rect.height)),
          }));
        const normalizedRects = normalizeRectsForPersist(rects);
        if (normalizedRects.length === 0) continue;
        next.push({
          id: item.id,
          color,
          pageNumber,
          rects: normalizedRects,
        });
      } catch {
        // ignore invalid annotation payload
      }
    }
    setPersistedHighlights(next);
  }, [currentPaper?.id, props.notes]);

  const pdfSrc = useMemo(() => {
    if (!currentPaper) return '';
    const sourcePath = resolvePaperFilePath(currentPaper);
    return sourcePath ? toPdfSrc(sourcePath) : '';
  }, [currentPaper?.managed_path, currentPaper?.original_path, currentPaper?.id]);

  useEffect(() => {
    if (!open || !currentPaper) return;
    const sourcePath = resolvePaperFilePath(currentPaper);
    const sourceUrl = pdfSrc;
    setLoadError('');

    console.info('[ReaderPanel] open', {
      paperId: currentPaper.id,
      managedPath: currentPaper.managed_path,
      originalPath: currentPaper.original_path,
      selectedPath: sourcePath,
      sourceUrl,
      workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
    });

    if (!sourceUrl) {
      setLoadError('PDF 路径为空，无法加载。');
      return;
    }
    console.info('[ReaderPanel] document source ready', {
      paperId: currentPaper.id,
      source: sourceUrl,
    });
  }, [open, currentPaper?.id, pdfSrc]);
  const documentFile = useMemo(() => (pdfSrc ? pdfSrc : null), [pdfSrc]);
  const documentOptions = useMemo(
    () => ({
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
      stopAtErrors: false,
    }),
    [],
  );
  const documentKey = useMemo(() => {
    if (!currentPaper) return 'empty';
    const sourcePath = resolvePaperFilePath(currentPaper);
    return `${currentPaper.id}:${sourcePath}`;
  }, [currentPaper?.id, currentPaper?.managed_path, currentPaper?.original_path]);
  const pageNumbers = useMemo(() => Array.from({ length: numPages }, (_, index) => index + 1), [numPages]);
  const persistedHighlightsByPage = useMemo(() => {
    const grouped = new Map<number, PersistedHighlight[]>();
    for (const item of persistedHighlights) {
      const bucket = grouped.get(item.pageNumber) || [];
      bucket.push(item);
      grouped.set(item.pageNumber, bucket);
    }
    return grouped;
  }, [persistedHighlights]);
  const persistedHighlightMap = useMemo(() => {
    const map = new Map<string, PersistedHighlight>();
    for (const item of persistedHighlights) map.set(item.id, item);
    return map;
  }, [persistedHighlights]);
  const notesMap = useMemo(() => {
    const map = new Map<string, NoteItem>();
    for (const item of props.notes) map.set(item.id, item);
    return map;
  }, [props.notes]);
  const groupedReaderNotes = useMemo(() => {
    const groups: Record<ReaderNoteGroupKey, ReaderNoteItemView[]> = {
      yellow: [],
      blue: [],
      red: [],
      note: [],
      excerpt: [],
    };
    for (const item of props.notes) {
      const text = (item.selected_text || item.content || '').trim();
      if (item.note_type === 'note') {
        groups.note.push({
          id: item.id,
          page: item.page_number ?? null,
          text,
          comment: item.comment?.trim() || undefined,
        });
        continue;
      }
      if (item.note_type === 'excerpt') {
        groups.excerpt.push({
          id: item.id,
          page: item.page_number ?? null,
          text,
          comment: item.comment?.trim() || undefined,
        });
        continue;
      }
      if (item.note_type === 'annotation') {
        const meta = parseHighlightPayload(item.comment);
        if (meta?.kind === 'highlight' && (meta.color === 'yellow' || meta.color === 'blue' || meta.color === 'red')) {
          const persisted = persistedHighlightMap.get(item.id);
          const selectedRaw = (item.selected_text || '').trim();
          const remarkRaw = (item.content || '').trim();
          groups[meta.color].push({
            id: item.id,
            page: item.page_number ?? null,
            text: selectedRaw || text,
            comment: remarkRaw && (!selectedRaw || remarkRaw !== selectedRaw) ? remarkRaw : undefined,
            highlightTop: persisted?.rects?.[0]?.top,
          });
          continue;
        }
      }
    }
    for (const key of readerNoteGroupOrder) {
      groups[key].sort((a, b) => {
        const pa = a.page ?? 10_000;
        const pb = b.page ?? 10_000;
        if (pa !== pb) return pa - pb;
        const ta = a.highlightTop ?? 10_000;
        const tb = b.highlightTop ?? 10_000;
        if (ta !== tb) return ta - tb;
        return a.id.localeCompare(b.id);
      });
    }
    return groups;
  }, [props.notes, persistedHighlightMap]);
  const orderedGroups = readerNoteGroupOrder;

  useEffect(() => {
    function updateWidth() {
      const width = containerRef.current?.clientWidth ?? 900;
      const safe = Math.max(360, Math.min(1200, width - 24));
      setPageWidth(safe);
    }
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [open, scale, numPages]);

  const updateCurrentPageFromScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || numPages <= 0) return;
    const marker = container.scrollTop + container.clientHeight * 0.35;
    let visible = 1;
    for (let i = 1; i <= numPages; i += 1) {
      const pageEl = pageElementsRef.current.get(i);
      if (!pageEl) continue;
      if (pageEl.offsetTop <= marker) visible = i;
      else break;
    }
    setCurrentPage((prev) => (prev === visible ? prev : visible));
  }, [numPages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;
    const onScroll = () => {
      updateCurrentPageFromScroll();
      setSelectionMenu(null);
      setHighlightMenu(null);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [open, updateCurrentPageFromScroll]);

  useEffect(() => {
    if (!open || !currentPaper || numPages <= 0 || didAutoScrollRef.current) return;
    const targetPage = Math.min(Math.max(currentPage, 1), numPages);
    const targetEl = pageElementsRef.current.get(targetPage);
    if (!targetEl) return;
    targetEl.scrollIntoView({ block: 'start' });
    didAutoScrollRef.current = true;
    const container = containerRef.current;
    if (container) updateCurrentPageFromScroll();
  }, [open, currentPaper, numPages, currentPage, updateCurrentPageFromScroll, pageRenderTick]);

  useEffect(() => {
    if (!open || !props.focusTarget || !currentPaper) return;
    didAutoScrollRef.current = false;
    focusAppliedTokenRef.current = null;
    if (props.focusTarget.page && props.focusTarget.page > 0) {
      setCurrentPage(props.focusTarget.page);
    }
  }, [open, props.focusTarget?.token, currentPaper?.id]);

  useEffect(() => {
    if (!open || !currentPaper || numPages <= 0) return;
    const windowPages = buildPageWindow(currentPage, numPages);
    if (windowPages.length === 0) return;
    setActivePages((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const page of windowPages) {
        if (!next.has(page)) {
          next.add(page);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [open, currentPaper?.id, numPages, currentPage]);

  const jumpToNoteTarget = useCallback((target: { page?: number; noteId?: string }) => {
    if (!open) return false;
    let page = target.page;
    let anchorY: number | undefined;
    if (target.noteId) {
      const item = persistedHighlightMap.get(target.noteId);
      if (item) {
        page = item.pageNumber;
        const firstRect = item.rects[0];
        if (firstRect) {
          anchorY = firstRect.top + firstRect.height * 0.5;
        }
      }
    }
    if (!page || page < 1) return false;
    const pageEl = pageElementsRef.current.get(page);
    const container = containerRef.current;
    if (!pageEl || !container) return false;
    const pageOffsetTop = pageEl.offsetTop;
    const pageHeight = pageEl.clientHeight;
    const targetInPage = (typeof anchorY === 'number' ? anchorY : 0.35) * pageHeight;
    const targetCenterScrollTop = pageOffsetTop + targetInPage - container.clientHeight * 0.5;
    container.scrollTo({
      top: Math.max(0, targetCenterScrollTop),
      behavior: 'smooth',
    });
    setCurrentPage(page);
    if (target.noteId) setActiveNoteId(target.noteId);
    return true;
  }, [open, persistedHighlightMap]);

  useEffect(() => {
    if (!open || !props.focusTarget || !currentPaper || numPages <= 0) return;
    if (focusAppliedTokenRef.current === props.focusTarget.token) return;
    const applied = jumpToNoteTarget({ page: props.focusTarget.page, noteId: props.focusTarget.noteId });
    if (applied) {
      focusAppliedTokenRef.current = props.focusTarget.token;
    }
  }, [open, currentPaper?.id, numPages, props.focusTarget?.token, jumpToNoteTarget, persistedHighlightMap, pageRenderTick]);

  useEffect(() => {
    if (!open || !currentPaper || numPages <= 0) return;
    const t = window.setTimeout(() => {
      void props.onProgress(currentPaper, currentPage);
    }, 400);
    return () => window.clearTimeout(t);
  }, [open, currentPaper, currentPage, numPages, props]);

  useEffect(() => {
    if (!open) return;
    void getCurrentWindow()
      .isFullscreen()
      .then((full) => setIsWindowFullscreen(full))
      .catch(() => setIsWindowFullscreen(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void appWindow
      .onResized(async () => {
        try {
          setIsWindowFullscreen(await appWindow.isFullscreen());
        } catch {
          setIsWindowFullscreen(false);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [open]);

  useEffect(
    () => () => {
      if (readerToastTimerRef.current) {
        window.clearTimeout(readerToastTimerRef.current);
      }
    },
    []
  );

  function showReaderToast(text: string) {
    setReaderToastText(text);
    setReaderToastVisible(true);
    if (readerToastTimerRef.current) {
      window.clearTimeout(readerToastTimerRef.current);
    }
    readerToastTimerRef.current = window.setTimeout(() => {
      setReaderToastVisible(false);
      readerToastTimerRef.current = null;
    }, 1200);
  }

  const captureSelectedText = useCallback(() => {
    window.setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';
      if (!selection || !text || selection.rangeCount === 0) {
        setSelectionMenu(null);
        return;
      }
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      if (
        !containerRef.current ||
        !anchorNode ||
        !focusNode ||
        !containerRef.current.contains(anchorNode) ||
        !containerRef.current.contains(focusNode)
      ) {
        setSelectionMenu(null);
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) {
        setSelectionMenu(null);
        return;
      }
      const x = Math.min(window.innerWidth - 180, Math.max(180, rect.left + rect.width / 2));
      const y = Math.max(72, rect.top - 10);
      setSelectedText(text);
      setSelectionMenu({ x, y });
    }, 0);
  }, []);

  const bindPageElement = useCallback((pageNumber: number, element: HTMLDivElement | null) => {
    if (element) pageElementsRef.current.set(pageNumber, element);
    else pageElementsRef.current.delete(pageNumber);
  }, []);

  const openHighlightMenuByPoint = useCallback((clientX: number, clientY: number) => {
    for (const [pageNumber, pageEl] of pageElementsRef.current.entries()) {
      const pageRect = pageEl.getBoundingClientRect();
      if (
        clientX < pageRect.left
        || clientX > pageRect.right
        || clientY < pageRect.top
        || clientY > pageRect.bottom
      ) {
        continue;
      }
      const normalizedX = (clientX - pageRect.left) / pageRect.width;
      const normalizedY = (clientY - pageRect.top) / pageRect.height;
      const candidates = persistedHighlightsByPage.get(pageNumber) || [];
      for (const item of candidates) {
        for (const rect of item.rects) {
          const hit =
            normalizedX >= rect.left
            && normalizedX <= rect.left + rect.width
            && normalizedY >= rect.top
            && normalizedY <= rect.top + rect.height;
          if (hit) {
            const remark = (notesMap.get(item.id)?.content || '').trim();
            setHighlightMenu({
              noteId: item.id,
              color: item.color,
              x: clientX,
              y: clientY - 8,
              remark,
            });
            setHighlightRemarkDraft(remark);
            setActiveNoteId(item.id);
            return true;
          }
        }
      }
      return false;
    }
    return false;
  }, [persistedHighlightsByPage, notesMap]);

  async function addSelectedAs(type: 'excerpt' | 'note') {
    if (!currentPaper) return;
    const text = selectedText.trim();
    if (!text) return;
    await props.onCreateNote({
      paper_id: currentPaper.id,
      note_type: type,
      content: text,
      selected_text: text,
      page_number: currentPage,
      comment: comment.trim() || undefined,
    });
    setComment('');
    setSelectedText('');
    setSelectionMenu(null);
  }

  async function copySelectedText() {
    const text = selectedText.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showReaderToast('已复制选中文本');
    } catch {
      showReaderToast('复制失败');
    }
  }

  async function triggerHighlight(color: HighlightColor) {
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0) return;
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (rects.length === 0) return;
    const grouped = new Map<number, PersistedRect[]>();
    for (const rect of rects) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      let targetPage = 0;
      let targetEl: HTMLDivElement | undefined;
      for (const [pageNumber, pageEl] of pageElementsRef.current.entries()) {
        const pageRect = pageEl.getBoundingClientRect();
        if (
          centerX >= pageRect.left
          && centerX <= pageRect.right
          && centerY >= pageRect.top
          && centerY <= pageRect.bottom
        ) {
          targetPage = pageNumber;
          targetEl = pageEl;
          break;
        }
      }
      if (!targetPage || !targetEl) continue;
      const pageRect = targetEl.getBoundingClientRect();
      if (pageRect.width <= 0 || pageRect.height <= 0) continue;
      const rawTop = (rect.top - pageRect.top) / pageRect.height;
      const rawHeight = rect.height / pageRect.height;
      const insetY = Math.min(0.01, rawHeight * 0.08);
      const top = rawTop + insetY;
      const height = Math.max(0, rawHeight - insetY * 2);
      const normalized: PersistedRect = {
        left: Math.max(0, Math.min(1, (rect.left - pageRect.left) / pageRect.width)),
        top: Math.max(0, Math.min(1, top)),
        width: Math.max(0, Math.min(1, rect.width / pageRect.width)),
        height: Math.max(0, Math.min(1, height)),
      };
      const bucket = grouped.get(targetPage) || [];
      bucket.push(normalized);
      grouped.set(targetPage, bucket);
    }
    if (grouped.size === 0 || !currentPaper) return;
    const created: PersistedHighlight[] = Array.from(grouped.entries())
      .map(([pageNumber, itemRects]) => ({
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        color,
        pageNumber,
        rects: normalizeRectsForPersist(itemRects),
      }))
      .filter((item) => item.rects.length > 0);
    if (created.length === 0) return;
    setPersistedHighlights((prev) => [...created, ...prev]);
    selection.removeAllRanges();
    setSelectionMenu(null);
    try {
      await Promise.all(
        created.map((item) =>
          props.onCreateNote({
            paper_id: currentPaper.id,
            note_type: 'annotation',
            content: '',
            selected_text: text,
            page_number: item.pageNumber,
            comment: JSON.stringify({
              kind: 'highlight',
              color: item.color,
              pageNumber: item.pageNumber,
              rects: item.rects,
            }),
          }),
        ),
      );
      const textMap: Record<HighlightColor, string> = {
        yellow: '已高亮（黄色）',
        blue: '已高亮（蓝色）',
        red: '已高亮（红色）',
      };
      showReaderToast(textMap[color]);
    } catch (err) {
      setPersistedHighlights((prev) => prev.filter((item) => !item.id.startsWith('temp-')));
      showReaderToast(`高亮保存失败：${String(err)}`);
    }
  }

  async function updateHighlightColor(noteId: string, color: HighlightColor) {
    const before = persistedHighlights;
    setPersistedHighlights((prev) => prev.map((item) => (item.id === noteId ? { ...item, color } : item)));
    setHighlightMenu(null);
    try {
      await props.onUpdateHighlightColor(noteId, color);
      showReaderToast('高亮颜色已更新');
    } catch (err) {
      setPersistedHighlights(before);
      showReaderToast(`修改失败：${String(err)}`);
    }
  }

  async function saveHighlightRemark(noteId: string) {
    try {
      await props.onUpdateHighlightRemark(noteId, highlightRemarkDraft.trim());
      showReaderToast(highlightRemarkDraft.trim() ? '高亮备注已保存' : '高亮备注已清空');
      setHighlightMenu((prev) => (prev ? { ...prev, remark: highlightRemarkDraft.trim() } : prev));
    } catch (err) {
      showReaderToast(`备注保存失败：${String(err)}`);
    }
  }

  function openInlineRemarkEditor(noteId: string, initialRemark?: string) {
    setInlineRemarkEditor({
      noteId,
      draft: initialRemark?.trim() || '',
    });
  }

  async function saveInlineHighlightRemark() {
    if (!inlineRemarkEditor) return;
    try {
      const nextRemark = inlineRemarkEditor.draft.trim();
      await props.onUpdateHighlightRemark(inlineRemarkEditor.noteId, nextRemark);
      showReaderToast(nextRemark ? '高亮备注已保存' : '高亮备注已清空');
      setInlineRemarkEditor(null);
    } catch (err) {
      showReaderToast(`备注保存失败：${String(err)}`);
    }
  }

  async function removeHighlight(noteId: string) {
    const before = persistedHighlights;
    setPersistedHighlights((prev) => prev.filter((item) => item.id !== noteId));
    setHighlightMenu(null);
    try {
      await props.onDeleteNote(noteId);
      showReaderToast('高亮已删除');
    } catch (err) {
      setPersistedHighlights(before);
      showReaderToast(`删除失败：${String(err)}`);
    }
  }

  async function toggleWindowFullscreen() {
    try {
      const appWindow = getCurrentWindow();
      const full = await appWindow.isFullscreen();
      await appWindow.setFullscreen(!full);
      setIsWindowFullscreen(!full);
    } catch (err) {
      showReaderToast(`全屏切换失败：${String(err)}`);
    }
  }

  const handleDocumentLoadSuccess = useCallback((total: number) => {
    if (!currentPaper) return;
    setNumPages(total);
    setLoadError('');
    setCurrentPage((prev) => {
      if (total <= 0) return 1;
      return prev > total ? total : prev;
    });
    console.info('[ReaderPanel] getDocument success', {
      paperId: currentPaper.id,
      numPages: total,
      source: documentFile,
    });
  }, [currentPaper, documentFile]);

  const handleDocumentLoadError = useCallback((err: unknown) => {
    if (!currentPaper) return;
    const message = String(err);
    console.error('ReaderPanel PDF load failed', {
      paperId: currentPaper.id,
      managedPath: currentPaper.managed_path,
      originalPath: currentPaper.original_path,
      pdfSrc,
      source: documentFile,
      err: message,
    });
    setLoadError(message);
  }, [currentPaper, pdfSrc, documentFile]);

  const handlePageRenderSuccess = useCallback((pageNumber: number) => {
    if (!currentPaper) return;
    const pageEl = pageElementsRef.current.get(pageNumber);
    const measuredHeight = pageEl?.getBoundingClientRect().height;
    if (measuredHeight && measuredHeight > 0) {
      const rounded = Math.round(measuredHeight);
      pageHeightCacheRef.current.set(pageNumber, rounded);
      setFallbackPageHeight((prev) => (prev > 0 ? prev : rounded));
    }
    setPageRenderTick((prev) => prev + 1);
    console.info('[ReaderPanel] page render success', {
      paperId: currentPaper.id,
      page: pageNumber,
      scale,
      pageWidth,
    });
  }, [currentPaper, scale, pageWidth]);

  const handlePageRenderError = useCallback((pageNumber: number, err: unknown) => {
    if (!currentPaper) return;
    console.error('[ReaderPanel] page render failed', {
      paperId: currentPaper.id,
      page: pageNumber,
      scale,
      pageWidth,
      err,
    });
  }, [currentPaper, scale, pageWidth]);

  const getPlaceholderHeight = useCallback(
    (pageNumber: number) => pageHeightCacheRef.current.get(pageNumber) ?? fallbackPageHeight,
    [fallbackPageHeight]
  );

  if (!currentPaper || (!open && !showShell)) return null;

  return (
    <div
      className={`pw-reader-overlay absolute inset-0 z-40 flex bg-black/16 backdrop-blur-[1px] transition-opacity duration-[var(--motion-slow)] ease-in-out motion-reduce:transition-none ${
        panelVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div
        className={`pw-reader-panel relative ml-8 mt-8 flex h-[calc(100vh-4rem)] w-[calc(100vw-8rem)] flex-col rounded-xl border border-[var(--border-default)] bg-[var(--reader-panel)] shadow-[var(--shadow-overlay)] transition-opacity duration-[var(--motion-slow)] ease-in-out motion-reduce:transition-none ${
          panelVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-default)]/85 bg-[var(--bg-surface)]/66 px-3 py-2.5 backdrop-blur-sm">
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">阅读全文：{currentPaper.title || currentPaper.file_name}</div>
          <span className="text-xs text-[var(--text-secondary)]">当前页 {currentPage} / {numPages || '-'}</span>
          <Button size="sm" variant="secondary" onClick={() => setScale((v) => Math.max(0.7, Number((v - 0.1).toFixed(2))))}>-</Button>
          <span className="text-xs text-[var(--text-secondary)]">{Math.round(scale * 100)}%</span>
          <Button size="sm" variant="secondary" onClick={() => setScale((v) => Math.min(2.2, Number((v + 0.1).toFixed(2))))}>+</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void toggleWindowFullscreen()}
          >
            {isWindowFullscreen ? <Minimize2 className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
            {isWindowFullscreen ? '退出全屏' : '全屏阅读'}
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onClose}>关闭</Button>
        </div>

        <div
          className={`grid min-h-0 flex-1 transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none ${
            isWindowFullscreen
              ? 'grid-cols-[minmax(0,1fr)_360px]'
              : 'grid-cols-[minmax(0,1fr)_280px]'
          }`}
        >
          <div
            ref={containerRef}
            className="relative min-h-0 overflow-auto bg-[var(--reader-bg)] p-5"
            onMouseDown={() => setHighlightMenu(null)}
            onMouseUp={captureSelectedText}
            onClick={(e) => {
              const selected = window.getSelection()?.toString().trim();
              if (selected) return;
              void openHighlightMenuByPoint(e.clientX, e.clientY);
            }}
            onKeyUp={captureSelectedText}
          >
            <div className="relative mx-auto w-fit rounded-xl border border-[var(--border-default)]/85 bg-[var(--bg-surface)] p-2.5 shadow-[var(--shadow-sm)]">
              {documentFile ? (
                <ReaderDocumentView
                  documentKey={documentKey}
                  documentFile={documentFile}
                  documentOptions={documentOptions}
                  pageNumbers={pageNumbers}
                  activePages={activePages}
                  pageWidth={pageWidth}
                  scale={scale}
                  getPlaceholderHeight={getPlaceholderHeight}
                  loadError={loadError}
                  persistedHighlightsByPage={persistedHighlightsByPage}
                  onBindPageElement={bindPageElement}
                  onDocumentLoadSuccess={handleDocumentLoadSuccess}
                  onDocumentLoadError={handleDocumentLoadError}
                  onPageRenderSuccess={handlePageRenderSuccess}
                  onPageRenderError={handlePageRenderError}
                />
              ) : (
                <div className="p-6 text-sm text-[var(--text-secondary)]">正在准备 PDF 文件...</div>
              )}
            </div>
          </div>

          <aside className={`flex min-h-0 flex-col border-l border-[var(--border-default)] bg-[var(--reader-side)] p-3.5 ${isWindowFullscreen ? 'w-[360px]' : 'w-[280px]'}`}>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">选中文本摘录</h3>
            <div className="mb-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5 text-xs text-[var(--text-secondary)]">
              {selectedText || '在左侧 PDF 中选中文字后，这里会显示内容'}
            </div>
            <div className="mb-2 flex gap-2">
              <Button size="sm" variant="secondary" disabled={!selectedText.trim()} onClick={() => void addSelectedAs('excerpt')}>添加为摘录</Button>
              <Button size="sm" disabled={!selectedText.trim()} onClick={() => void addSelectedAs('note')}>添加到笔记</Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]/82 p-2.5">
              <h4 className="mb-2 text-[11px] font-medium tracking-[0.08em] text-[var(--text-tertiary)]">当前论文标注总览</h4>
              <div className="space-y-3">
                {orderedGroups.map((groupKey) => {
                  const items = groupedReaderNotes[groupKey];
                  if (items.length === 0) return null;
                  const collapsed = collapsedGroups[groupKey];
                  return (
                    <div key={groupKey} className={`rounded-lg border p-2.5 ${readerGroupAccent(groupKey)}`}>
                      <button
                        className="mb-2 flex w-full items-center justify-between"
                        onClick={() => setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))}
                      >
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">{readerGroupTitle(groupKey)}</span>
                        <span className="rounded border border-[var(--border-default)] bg-[var(--bg-surface)]/90 px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                          {collapsed ? '+' : '-'} {items.length}
                        </span>
                      </button>
                      <div className={`overflow-hidden transition-[max-height,opacity] duration-320 ease-out motion-reduce:transition-none ${collapsed ? 'max-h-0 opacity-0' : 'max-h-[640px] opacity-100'}`}>
                      <div className="space-y-2">
                        {items.map((item) => {
                          const isHighlightGroup = groupKey === 'yellow' || groupKey === 'blue' || groupKey === 'red';
                          const isEditingRemark = inlineRemarkEditor?.noteId === item.id;
                          const itemComment = item.comment?.trim() || '';
                          return (
                            <div
                              key={item.id}
                              className={`rounded-md border bg-[var(--bg-surface)] p-2.5 text-left ${readerItemBorderTone(groupKey)} ${readerItemAccent(groupKey)} ${activeNoteId === item.id ? readerItemActiveAccent(groupKey) : ''}`}
                            >
                              <button
                                className="w-full appearance-none border-0 bg-transparent p-0 text-left focus:outline-none"
                                onClick={() => jumpToNoteTarget({ page: item.page ?? undefined, noteId: item.id })}
                              >
                                <div className="mb-1 text-[10px] text-[var(--text-tertiary)]">第 {item.page ?? '-'} 页</div>
                                <div className="text-xs leading-5 text-[var(--text-primary)]">{item.text || '（无内容）'}</div>
                                {itemComment ? <div className="mt-1 text-[11px] text-[var(--text-secondary)]">备注：{itemComment}</div> : null}
                              </button>
                              {isHighlightGroup ? (
                                <div className="mt-1.5">
                                  {isEditingRemark ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        value={inlineRemarkEditor.draft}
                                        onChange={(e) =>
                                          setInlineRemarkEditor((prev) =>
                                            prev && prev.noteId === item.id
                                              ? { ...prev, draft: e.target.value }
                                              : prev,
                                          )
                                        }
                                        placeholder="输入高亮备注"
                                        className="h-7 text-[11px]"
                                      />
                                      <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => void saveInlineHighlightRemark()}>
                                        保存
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() => setInlineRemarkEditor(null)}
                                      >
                                        取消
                                      </Button>
                                    </div>
                                  ) : (
                                    <button
                                      className="text-[10px] text-[var(--accent-text)] hover:underline"
                                      onClick={() => openInlineRemarkEditor(item.id, itemComment)}
                                    >
                                      {itemComment ? '编辑备注' : '添加备注'}
                                    </button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      </div>
                    </div>
                  );
                })}
                {readerNoteGroupOrder.every((key) => groupedReaderNotes[key].length === 0) ? (
                  <p className="text-xs text-[var(--text-tertiary)]">暂无高亮/笔记/摘要记录。</p>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
        {selectionMenu && selectedText.trim() ? (
          <div
            className="ui-pop pw-popover-surface pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full p-1.5 transition-all duration-[var(--motion-base)] ease-out motion-reduce:transition-none"
            style={{ left: selectionMenu.x, top: selectionMenu.y }}
          >
            <div className="pointer-events-auto flex items-center gap-1">
              <button
                className="rounded-md border border-[rgba(255,214,102,0.55)] pw-hl-yellow-soft px-2 py-1 text-[11px] text-[var(--text-primary)] hover:brightness-[0.98]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void triggerHighlight('yellow')}
              >
                黄色高亮
              </button>
              <button
                className="rounded-md border border-[rgba(120,160,255,0.55)] pw-hl-blue-soft px-2 py-1 text-[11px] text-[var(--text-primary)] hover:brightness-[0.98]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void triggerHighlight('blue')}
              >
                蓝色高亮
              </button>
              <button
                className="rounded-md border border-[rgba(255,130,130,0.55)] pw-hl-red-soft px-2 py-1 text-[11px] text-[var(--text-primary)] hover:brightness-[0.98]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void triggerHighlight('red')}
              >
                红色高亮
              </button>
              <button
                className="pw-menu-item rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-[11px]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void addSelectedAs('note')}
              >
                添加到笔记
              </button>
              <button
                className="pw-menu-item rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-[11px]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void addSelectedAs('excerpt')}
              >
                添加为摘录
              </button>
              <button
                className="pw-menu-item rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-[11px]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void copySelectedText()}
              >
                <span className="inline-flex items-center gap-1">
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </span>
              </button>
            </div>
          </div>
        ) : null}
        {highlightMenu ? (
          <div
            className="ui-pop pw-popover-surface pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full p-2 transition-[opacity,transform] duration-[var(--motion-base)] ease-out motion-reduce:transition-none"
            style={{ left: highlightMenu.x, top: highlightMenu.y }}
          >
            <div className="pointer-events-auto flex items-center gap-1">
              <button className="rounded-md border border-[rgba(255,214,102,0.55)] pw-hl-yellow-soft px-2 py-1 text-[11px] text-[var(--text-primary)]" onClick={() => void updateHighlightColor(highlightMenu.noteId, 'yellow')}>黄</button>
              <button className="rounded-md border border-[rgba(120,160,255,0.55)] pw-hl-blue-soft px-2 py-1 text-[11px] text-[var(--text-primary)]" onClick={() => void updateHighlightColor(highlightMenu.noteId, 'blue')}>蓝</button>
              <button className="rounded-md border border-[rgba(255,130,130,0.55)] pw-hl-red-soft px-2 py-1 text-[11px] text-[var(--text-primary)]" onClick={() => void updateHighlightColor(highlightMenu.noteId, 'red')}>红</button>
              <button className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] text-red-600 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-red-50/80 dark:hover:bg-red-900/20" onClick={() => void removeHighlight(highlightMenu.noteId)}>删除</button>
            </div>
            <div className="pointer-events-auto mt-1.5 flex items-center gap-1">
              <Input
                value={highlightRemarkDraft}
                onChange={(e) => setHighlightRemarkDraft(e.target.value)}
                placeholder="高亮备注（可选）"
                className="h-7 w-52 text-xs"
              />
              <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => void saveHighlightRemark(highlightMenu.noteId)}>
                保存
              </Button>
            </div>
          </div>
        ) : null}
        <div
          className={`pw-toast pointer-events-none absolute right-4 top-12 z-40 px-3 py-1.5 text-xs transition-all duration-[var(--motion-slow)] ease-out motion-reduce:transition-none ${
            readerToastVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {readerToastText}
        </div>
      </div>
    </div>
  );
}

interface ReaderDocumentViewProps {
  documentKey: string;
  documentFile: string;
  documentOptions: {
    disableRange: boolean;
    disableStream: boolean;
    disableAutoFetch: boolean;
    stopAtErrors: boolean;
  };
  pageNumbers: number[];
  activePages: Set<number>;
  pageWidth: number;
  scale: number;
  getPlaceholderHeight: (pageNumber: number) => number;
  loadError: string;
  persistedHighlightsByPage: Map<number, PersistedHighlight[]>;
  onBindPageElement: (pageNumber: number, element: HTMLDivElement | null) => void;
  onDocumentLoadSuccess: (numPages: number) => void;
  onDocumentLoadError: (error: unknown) => void;
  onPageRenderSuccess: (pageNumber: number) => void;
  onPageRenderError: (pageNumber: number, error: unknown) => void;
}

const ReaderDocumentView = memo(function ReaderDocumentView(props: ReaderDocumentViewProps) {
  const {
    documentKey,
    documentFile,
    documentOptions,
    pageNumbers,
    activePages,
    pageWidth,
    scale,
    getPlaceholderHeight,
    loadError,
    persistedHighlightsByPage,
    onBindPageElement,
    onDocumentLoadSuccess,
    onDocumentLoadError,
    onPageRenderSuccess,
    onPageRenderError,
  } = props;

  return (
    <Document
      key={documentKey}
      file={documentFile}
      options={documentOptions}
      onLoadSuccess={({ numPages: total }) => onDocumentLoadSuccess(total)}
      loading={<div className="p-6 text-sm text-[var(--text-secondary)]">正在加载 PDF...</div>}
      onLoadError={onDocumentLoadError}
      error={
        <div className="p-6 text-sm text-red-600">
          PDF 加载失败
          {loadError ? <div className="mt-2 break-all text-xs text-[var(--text-secondary)]">{loadError}</div> : null}
        </div>
      }
    >
      {pageNumbers.map((pageNumber) => (
        <div key={pageNumber} className="mb-4 rounded border border-[var(--border-default)] bg-[var(--bg-surface)] p-2">
          <div
            ref={(el) => onBindPageElement(pageNumber, el)}
            className="reader-page-layer relative [&_.react-pdf__Page__canvas]:relative [&_.react-pdf__Page__canvas]:z-0 [&_.react-pdf__Page__textContent]:relative [&_.react-pdf__Page__textContent]:z-20"
          >
            {activePages.has(pageNumber) ? (
              <>
                <div className="pointer-events-none absolute inset-0 z-10">
                  {(persistedHighlightsByPage.get(pageNumber) || []).flatMap((item) =>
                    item.rects.map((rect, rectIdx) => (
                      <div
                        key={`${item.id}-${rectIdx}`}
                        className={
                          item.color === 'yellow'
                            ? 'absolute rounded-sm pw-hl-yellow-fill'
                            : item.color === 'blue'
                              ? 'absolute rounded-sm pw-hl-blue-fill'
                              : 'absolute rounded-sm pw-hl-red-fill'
                        }
                        style={{
                          left: `${rect.left * 100}%`,
                          top: `${rect.top * 100}%`,
                          width: `${rect.width * 100}%`,
                          height: `${rect.height * 100}%`,
                        }}
                      />
                    ))
                  )}
                </div>
                <Page
                  pageNumber={pageNumber}
                  width={Math.round(pageWidth * scale)}
                  renderAnnotationLayer={false}
                  renderTextLayer
                  onRenderSuccess={() => onPageRenderSuccess(pageNumber)}
                  onRenderError={(error) => onPageRenderError(pageNumber, error)}
                />
              </>
            ) : (
              <div
                className="rounded border border-dashed border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]/55"
                style={{ height: getPlaceholderHeight(pageNumber) }}
              />
            )}
          </div>
          <div className="mt-1 text-center text-xs text-[var(--text-secondary)]">第 {pageNumber} 页</div>
        </div>
      ))}
    </Document>
  );
});
