import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { DetailDrawer } from '@/components/paper/DetailDrawer';
import { PaperCard } from '@/components/paper/PaperCard';
import { PaperList } from '@/components/paper/PaperList';
import { LocalErrorBoundary } from '@/components/common/LocalErrorBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  assertPathExists,
  createNote,
  createCategory,
  deleteCategory,
  deletePaper,
  deleteNote,
  enrichAllMetadata,
  enrichPaperMetadata,
  ensureThumbnail,
  getAppSettings,
  importPdfs,
  initApp,
  listCategories,
  listPapers,
  openPdfFile,
  saveAppSettings,
  setReadProgress,
  setCategory,
  setFavorite,
  setReadStatus,
  listNotes,
  renameCategory,
  updateNoteHighlightColor,
  updatePaper,
} from '@/services/api';
import { formatCitation, type CitationFormat } from '@/lib/citationFormatter';
import { findRelatedPapers } from '@/lib/related';
import { usePaperStore, useVisiblePapers } from '@/store/usePaperStore';
import type { SmartShelfKey, Paper, ReadStatus } from '@/types/paper';
import type { PaperFilters } from '@/types/paper';
import type { NoteItem, CreateNoteInput } from '@/types/note';
import type { AppSettings } from '@/types/settings';

const ReaderPanel = lazy(async () => {
  const mod = await import('@/components/paper/ReaderPanel');
  return { default: mod.ReaderPanel };
});

function toPathList(selected: unknown): string[] {
  if (!selected) return [];
  if (typeof selected === 'string') return [selected];
  if (Array.isArray(selected)) {
    return selected
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'path' in item && typeof (item as { path: unknown }).path === 'string') {
          return (item as { path: string }).path;
        }
        return '';
      })
      .filter(Boolean);
  }
  if (selected && typeof selected === 'object' && 'path' in selected && typeof (selected as { path: unknown }).path === 'string') {
    return [(selected as { path: string }).path];
  }
  return [];
}

const defaultSettings: AppSettings = {
  reader_mode: 'system',
  external_reader_path: '',
};

interface PendingDuplicateImport {
  duplicatePaths: string[];
  importedCount: number;
  failed: Array<{ path: string; reason: string }>;
}

interface ReaderFocusTarget {
  token: number;
  page?: number;
  noteId?: string;
}

function App() {
  const papers = usePaperStore((s) => s.papers);
  const setPapers = usePaperStore((s) => s.setPapers);
  const categories = usePaperStore((s) => s.categories);
  const setCategories = usePaperStore((s) => s.setCategories);
  const patchPaper = usePaperStore((s) => s.patchPaper);
  const selectedId = usePaperStore((s) => s.selectedId);
  const setSelectedId = usePaperStore((s) => s.setSelectedId);
  const filters = usePaperStore((s) => s.filters);
  const setFilters = usePaperStore((s) => s.setFilters);
  const viewMode = usePaperStore((s) => s.viewMode);
  const setViewMode = usePaperStore((s) => s.setViewMode);
  const loading = usePaperStore((s) => s.loading);
  const setLoading = usePaperStore((s) => s.setLoading);
  const error = usePaperStore((s) => s.error);
  const setError = usePaperStore((s) => s.setError);
  const [isListTransitioning, setIsListTransitioning] = useState(false);
  const listAnimTimerRef = useRef<number | null>(null);
  const listOverlayTimerRef = useRef<number | null>(null);
  const [listAnimNonce, setListAnimNonce] = useState(0);
  const [outgoingPapers, setOutgoingPapers] = useState<Paper[] | null>(null);
  const [outgoingViewMode, setOutgoingViewMode] = useState<'grid' | 'list'>(viewMode);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPaper, setDrawerPaper] = useState<Paper | undefined>(undefined);
  const drawerCloseTimerRef = useRef<number | null>(null);
  const drawerOpenTimerRef = useRef<number | null>(null);
  const [appToastText, setAppToastText] = useState('');
  const [appToastVisible, setAppToastVisible] = useState(false);
  const appToastTimerRef = useRef<number | null>(null);
  const [folderToastVisible, setFolderToastVisible] = useState(false);
  const folderToastTimerRef = useRef<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(defaultSettings);
  const [pendingDeletePaper, setPendingDeletePaper] = useState<Paper | null>(null);
  const [pendingDuplicateImport, setPendingDuplicateImport] = useState<PendingDuplicateImport | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerPaper, setReaderPaper] = useState<Paper | undefined>(undefined);
  const [readerFocusTarget, setReaderFocusTarget] = useState<ReaderFocusTarget | undefined>(undefined);
  const [noteItems, setNoteItems] = useState<NoteItem[]>([]);
  const [readerNoteItems, setReaderNoteItems] = useState<NoteItem[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState('all');

  const visiblePapers = useVisiblePapers();
  const dataToRender = visiblePapers;
  const selectedPaper = papers.find((paper) => paper.id === selectedId);
  const activeShelf = filters.smartShelf;
  const relatedPapers = useMemo(
    () => (selectedPaper ? findRelatedPapers(selectedPaper, papers, 5) : []),
    [papers, selectedPaper]
  );

  function triggerListTransition() {
    if (reduceMotion) return;
    setOutgoingPapers(dataToRender);
    setOutgoingViewMode(viewMode);
    setListAnimNonce((prev) => prev + 1);
    if (listOverlayTimerRef.current) {
      window.clearTimeout(listOverlayTimerRef.current);
    }
    if (listAnimTimerRef.current) {
      window.clearTimeout(listAnimTimerRef.current);
    }
    setIsListTransitioning(true);
    listOverlayTimerRef.current = window.setTimeout(() => {
      setOutgoingPapers(null);
      listOverlayTimerRef.current = null;
    }, 220);
    listAnimTimerRef.current = window.setTimeout(() => {
      setIsListTransitioning(false);
      listAnimTimerRef.current = null;
    }, 430);
  }

  const hydrateMissingThumbnails = useCallback(async (items: Paper[]) => {
    for (const paper of items) {
      if (paper.thumbnail_path || !paper.managed_path) continue;
      try {
        const updated = await ensureThumbnail(paper.id);
        patchPaper(updated);
      } catch (err) {
        setError(`缩略图生成失败：${paper.file_name} (${String(err)})`);
      }
    }
  }, [patchPaper, setError]);

  const refreshData = useCallback(async () => {
    const [current, categoryList] = await Promise.all([listPapers(), listCategories()]);
    setPapers(current);
    setCategories(categoryList.map((item) => item.name));
    void hydrateMissingThumbnails(current);
  }, [hydrateMissingThumbnails, setCategories, setPapers]);

  const bootstrap = useCallback(async () => {
    try {
      setLoading(true);
      await initApp();
      await refreshData();
      const settings = await getAppSettings();
      setSettingsDraft(settings);
      setError(undefined);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [refreshData, setError, setLoading]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(
    () => () => {
      if (listAnimTimerRef.current) window.clearTimeout(listAnimTimerRef.current);
      if (listOverlayTimerRef.current) window.clearTimeout(listOverlayTimerRef.current);
      if (drawerCloseTimerRef.current) window.clearTimeout(drawerCloseTimerRef.current);
      if (drawerOpenTimerRef.current) window.clearTimeout(drawerOpenTimerRef.current);
      if (appToastTimerRef.current) window.clearTimeout(appToastTimerRef.current);
      if (folderToastTimerRef.current) window.clearTimeout(folderToastTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  function showAppToast(text: string) {
    setAppToastText(text);
    setAppToastVisible(true);
    if (appToastTimerRef.current) {
      window.clearTimeout(appToastTimerRef.current);
    }
    appToastTimerRef.current = window.setTimeout(() => {
      setAppToastVisible(false);
      appToastTimerRef.current = null;
    }, 1300);
  }

  function showFolderToast() {
    setFolderToastVisible(true);
    if (folderToastTimerRef.current) {
      window.clearTimeout(folderToastTimerRef.current);
    }
    folderToastTimerRef.current = window.setTimeout(() => {
      setFolderToastVisible(false);
      folderToastTimerRef.current = null;
    }, 5000);
  }

  useEffect(() => {
    if (selectedPaper) {
      if (drawerPaper?.id === selectedPaper.id) {
        setDrawerPaper(selectedPaper);
        return;
      }
      if (drawerCloseTimerRef.current) {
        window.clearTimeout(drawerCloseTimerRef.current);
        drawerCloseTimerRef.current = null;
      }
      if (drawerOpenTimerRef.current) {
        window.clearTimeout(drawerOpenTimerRef.current);
        drawerOpenTimerRef.current = null;
      }
      setDrawerOpen(false);
      setDrawerPaper(selectedPaper);
      drawerOpenTimerRef.current = window.setTimeout(() => {
        setDrawerOpen(true);
        drawerOpenTimerRef.current = null;
      }, 24);
      return;
    }
    if (drawerPaper) {
      setDrawerOpen(false);
      drawerCloseTimerRef.current = window.setTimeout(() => {
        setDrawerPaper(undefined);
        drawerCloseTimerRef.current = null;
      }, 320);
    }
  }, [drawerPaper?.id, selectedPaper]);

  useEffect(() => {
    if (!selectedPaper) {
      setNoteItems([]);
      return;
    }
    let cancelled = false;
    void listNotes(selectedPaper.id)
      .then((items) => {
        if (!cancelled) {
          setNoteItems(items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`加载笔记失败：${String(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPaper?.id, setError]);

  useEffect(() => {
    if (!readerOpen || !readerPaper) {
      setReaderNoteItems([]);
      return;
    }
    let cancelled = false;
    void listNotes(readerPaper.id)
      .then((items) => {
        if (!cancelled) {
          setReaderNoteItems(items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`加载阅读笔记失败：${String(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [readerOpen, readerPaper?.id, setError]);

  useEffect(() => {
    if (!readerOpen || !readerPaper) return;
    const refreshed = papers.find((item) => item.id === readerPaper.id);
    if (refreshed) {
      setReaderPaper(refreshed);
    }
  }, [papers, readerOpen, readerPaper]);

  async function onImport() {
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      const paths = toPathList(selected).filter((path) => path.toLowerCase().endsWith('.pdf'));
      if (paths.length === 0) {
        setError('未选择可导入的 PDF 文件。');
        return;
      }
      await runImport(paths);
    } catch (err) {
      setError(`打开文件选择失败：${String(err)}`);
    }
  }

  const runImport = useCallback(async (paths: string[]) => {
    try {
      setLoading(true);
      const first = await importPdfs(paths, 'skip');
      const duplicateSkipped = first.skipped.map((item) => item.path);

      await refreshData();
      if (first.imported.length > 0) {
        const latest = await listPapers();
        if (latest[0]) setSelectedId(latest[0].id);
      }

      if (duplicateSkipped.length > 0) {
        setPendingDuplicateImport({
          duplicatePaths: duplicateSkipped,
          importedCount: first.imported.length,
          failed: [...first.failed],
        });
        const failedText = first.failed.length > 0 ? `，失败 ${first.failed.length} 个` : '';
        setError(`检测到 ${duplicateSkipped.length} 个重复论文。当前已导入 ${first.imported.length} 个文件${failedText}，请确认是否继续导入重复项。`);
        return;
      }

      if (first.imported.length === 0 && first.failed.length > 0) {
        setError(`导入失败：${first.failed.map((item) => `${item.path}(${item.reason})`).join('; ')}`);
      } else if (first.failed.length > 0 || first.skipped.length > 0) {
        const failedText = first.failed.length > 0 ? `，失败 ${first.failed.length} 个` : '';
        const skipText = first.skipped.length > 0 ? `，跳过重复 ${first.skipped.length} 个` : '';
        const detailText = first.failed.length > 0 ? `：${first.failed.map((item) => `${item.path}(${item.reason})`).join('; ')}` : '';
        setError(`已导入 ${first.imported.length} 个文件${failedText}${skipText}${detailText}`);
      } else {
        setError(`导入成功：${first.imported.length} 个文件。`);
      }
    } catch (err) {
      setError(`导入失败：${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [refreshData, setError, setLoading, setSelectedId]);

  async function onConfirmImportDuplicates() {
    if (!pendingDuplicateImport) return;
    try {
      setLoading(true);
      const second = await importPdfs(pendingDuplicateImport.duplicatePaths, 'keep');
      await refreshData();
      if (second.imported.length > 0) {
        const latest = await listPapers();
        if (latest[0]) setSelectedId(latest[0].id);
      }
      const totalImported = pendingDuplicateImport.importedCount + second.imported.length;
      const totalFailed = [...pendingDuplicateImport.failed, ...second.failed];
      const skipText = second.skipped.length > 0 ? `，跳过重复 ${second.skipped.length} 个` : '';
      const failedText = totalFailed.length > 0 ? `，失败 ${totalFailed.length} 个` : '';
      const detailText = totalFailed.length > 0 ? `：${totalFailed.map((item) => `${item.path}(${item.reason})`).join('; ')}` : '';
      setError(`已导入 ${totalImported} 个文件${skipText}${failedText}${detailText}`);
    } catch (err) {
      setError(`导入重复项失败：${String(err)}`);
    } finally {
      setPendingDuplicateImport(null);
      setLoading(false);
    }
  }

  function onCancelImportDuplicates() {
    if (!pendingDuplicateImport) return;
    const failedText = pendingDuplicateImport.failed.length > 0 ? `，失败 ${pendingDuplicateImport.failed.length} 个` : '';
    const detailText = pendingDuplicateImport.failed.length > 0
      ? `：${pendingDuplicateImport.failed.map((item) => `${item.path}(${item.reason})`).join('; ')}`
      : '';
    setError(`已导入 ${pendingDuplicateImport.importedCount} 个文件，跳过重复 ${pendingDuplicateImport.duplicatePaths.length} 个${failedText}${detailText}`);
    setPendingDuplicateImport(null);
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onDragDropEvent(async (event) => {
        if (event.payload.type !== 'drop') return;
        const paths = event.payload.paths.filter((path) => path.toLowerCase().endsWith('.pdf'));
        if (paths.length > 0) await runImport(paths);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [runImport]);

  async function onToggleFavorite(paper: Paper) {
    try {
      const updated = await setFavorite(paper.id, !paper.is_favorite);
      patchPaper(updated);
      setError(undefined);
    } catch (err) {
      setError(`收藏状态更新失败：${String(err)}`);
    }
  }

  async function onReadStatus(paper: Paper, status: ReadStatus) {
    try {
      const updated = await setReadStatus(paper.id, status);
      patchPaper(updated);
      setError(undefined);
    } catch (err) {
      setError(`阅读状态更新失败：${String(err)}`);
    }
  }

  async function onSaveMeta(paper: Paper) {
    try {
      const updated = await updatePaper(paper);
      patchPaper(updated);
      setError(undefined);
    } catch (err) {
      setError(`保存元数据失败：${String(err)}`);
      throw err;
    }
  }

  async function onSetCategory(paper: Paper, category: string) {
    try {
      const updated = await setCategory(paper.id, category);
      patchPaper(updated);
      setError(`分类已更新为 ${category}。`);
    } catch (err) {
      setError(`分类保存失败：${String(err)}`);
    }
  }

  async function onCreateCategory(name: string) {
    try {
      const created = await createCategory(name);
      const next = Array.from(new Set([...categories, created.name]));
      setCategories(next);
      setError(undefined);
      showAppToast(`分类“${created.name}”已创建`);
    } catch (err) {
      setError(`创建分类失败：${String(err)}`);
    }
  }

  async function onRenameCategory(oldName: string, newName: string) {
    try {
      if (!newName.trim()) {
        setError('分类名称不能为空。');
        return;
      }
      const renamed = await renameCategory(oldName, newName.trim());
      await refreshData();
      if (filters.category === oldName) {
        setFilters({ category: renamed.name });
      }
      showAppToast(`分类已重命名为“${renamed.name}”`);
      setError(undefined);
    } catch (err) {
      setError(`重命名分类失败：${String(err)}`);
    }
  }

  async function onDeleteCategory(name: string) {
    try {
      await deleteCategory(name);
      await refreshData();
      if (filters.category === name) {
        setFilters({ category: 'all' });
      }
      showAppToast(`分类“${name}”已删除`);
      setError(undefined);
    } catch (err) {
      setError(`删除分类失败：${String(err)}`);
    }
  }

  async function onOpenFolder(paper: Paper) {
    try {
      if (!paper.managed_path) {
        setError('未找到论文文件路径。');
        return;
      }
      const folderPath = paper.managed_path.replace(/[/\\][^/\\]+$/, '');
      await assertPathExists(folderPath);
      await revealItemInDir(paper.managed_path);
      setError(undefined);
      showFolderToast();
    } catch (err) {
      setError(`打开文件夹失败：${String(err)}`);
    }
  }

  async function onOpenPdf(paper: Paper) {
    try {
      if (!paper.managed_path) {
        setError('未找到可打开的 PDF 路径。');
        return;
      }
      await assertPathExists(paper.managed_path);
      await openPdfFile(paper.id, paper.managed_path);
      await refreshData();
    } catch (err) {
      setError(`打开 PDF 失败：${String(err)}`);
    }
  }

  async function onReaderProgress(paper: Paper, page: number) {
    try {
      const updated = await setReadProgress(paper.id, page);
      patchPaper(updated);
    } catch (err) {
      setError(`保存阅读进度失败：${String(err)}`);
    }
  }

  async function onCreateNoteFromReader(note: CreateNoteInput) {
    try {
      const created = await createNote(note);
      setNoteItems((prev) => [created, ...prev]);
      setReaderNoteItems((prev) => [created, ...prev]);
      await refreshData();
      if (note.note_type === 'note') {
        showAppToast('已添加到笔记');
      } else if (note.note_type === 'excerpt') {
        showAppToast('已添加为摘录');
      }
    } catch (err) {
      setError(`创建摘录失败：${String(err)}`);
    }
  }

  async function onDeleteNoteItem(id: string) {
    try {
      await deleteNote(id);
      setNoteItems((prev) => prev.filter((item) => item.id !== id));
      setReaderNoteItems((prev) => prev.filter((item) => item.id !== id));
      await refreshData();
      setError(undefined);
    } catch (err) {
      setError(`删除笔记失败：${String(err)}`);
    }
  }

  async function onUpdateHighlightColor(noteId: string, color: 'yellow' | 'blue' | 'red') {
    try {
      const updated = await updateNoteHighlightColor(noteId, color);
      setNoteItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setReaderNoteItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      await refreshData();
      setError(undefined);
    } catch (err) {
      setError(`修改高亮颜色失败：${String(err)}`);
      throw err;
    }
  }

  function onOpenReader(paper: Paper, focus?: { page?: number; noteId?: string }) {
    setReaderPaper(paper);
    setReaderFocusTarget({
      token: Date.now(),
      page: focus?.page,
      noteId: focus?.noteId,
    });
    setReaderOpen(true);
  }

  function onRequestDeletePaper(paper: Paper) {
    setPendingDeletePaper(paper);
  }

  function toggleMultiSelectMode() {
    setMultiSelectMode((prev) => {
      if (prev) {
        setSelectedPaperIds([]);
        return false;
      }
      return true;
    });
  }

  function toggleSelectPaper(id: string) {
    setSelectedPaperIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }

  function clearSelectedPapers() {
    setSelectedPaperIds([]);
  }

  async function runBulkUpdate(action: () => Promise<void>, successText: string) {
    if (selectedPaperIds.length === 0) return;
    try {
      setLoading(true);
      await action();
      await refreshData();
      showAppToast(successText);
      clearSelectedPapers();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onBulkCategory() {
    if (!bulkCategory || bulkCategory === 'all') return;
    await runBulkUpdate(async () => {
      await Promise.all(selectedPaperIds.map((id) => setCategory(id, bulkCategory)));
    }, '批量分类已完成');
  }

  async function onBulkReadStatus(status: ReadStatus) {
    await runBulkUpdate(async () => {
      await Promise.all(selectedPaperIds.map((id) => setReadStatus(id, status)));
    }, '批量阅读状态已更新');
  }

  async function onBulkFavorite(value: boolean) {
    await runBulkUpdate(async () => {
      await Promise.all(selectedPaperIds.map((id) => setFavorite(id, value)));
    }, value ? '批量收藏完成' : '批量取消收藏完成');
  }

  async function onBulkDelete() {
    if (selectedPaperIds.length === 0) return;
    const confirmed = window.confirm(`确定删除选中的 ${selectedPaperIds.length} 篇论文吗？`);
    if (!confirmed) return;
    await runBulkUpdate(async () => {
      await Promise.all(selectedPaperIds.map((id) => deletePaper(id)));
      if (selectedId && selectedPaperIds.includes(selectedId)) {
        onCloseDrawer();
      }
      if (readerPaper && selectedPaperIds.includes(readerPaper.id)) {
        setReaderOpen(false);
        setReaderPaper(undefined);
      }
    }, '批量删除完成');
  }

  async function onBulkEnrich() {
    await runBulkUpdate(async () => {
      await Promise.all(selectedPaperIds.map((id) => enrichPaperMetadata(id, false)));
    }, '批量元数据补全完成');
  }

  async function onConfirmDeletePaper() {
    if (!pendingDeletePaper) return;
    try {
      await deletePaper(pendingDeletePaper.id);
      if (selectedId === pendingDeletePaper.id) {
        onCloseDrawer();
      }
      if (readerPaper?.id === pendingDeletePaper.id) {
        setReaderOpen(false);
        setReaderPaper(undefined);
      }
      await refreshData();
      showAppToast('已删除');
      setError(undefined);
      setPendingDeletePaper(null);
      setSelectedPaperIds((prev) => prev.filter((id) => id !== pendingDeletePaper.id));
    } catch (err) {
      setError(`删除论文失败：${String(err)}`);
    }
  }

  function onShelfSelect(shelf: SmartShelfKey) {
    const next: Partial<PaperFilters> = {
      smartShelf: shelf,
      category: 'all',
      onlyFavorite: false,
      readStatus: 'all',
    };
    if (shelf === 'favorite') {
      next.onlyFavorite = true;
    }
    if (shelf === 'unread' || shelf === 'reading' || shelf === 'read') {
      next.readStatus = shelf;
    }
    setFilters(next);
    triggerListTransition();
  }

  function onCloseDrawer() {
    setDrawerOpen(false);
    if (drawerCloseTimerRef.current) {
      window.clearTimeout(drawerCloseTimerRef.current);
    }
    if (drawerOpenTimerRef.current) {
      window.clearTimeout(drawerOpenTimerRef.current);
      drawerOpenTimerRef.current = null;
    }
    drawerCloseTimerRef.current = window.setTimeout(() => {
      setSelectedId(undefined);
      setDrawerPaper(undefined);
      drawerCloseTimerRef.current = null;
    }, 320);
  }

  function onSidebarCategoryChange(category: string) {
    setFilters({ category, smartShelf: 'all', onlyFavorite: false, readStatus: 'all' });
    triggerListTransition();
  }

  function renderPaperCollection(items: Paper[], mode: 'grid' | 'list', passive = false) {
    if (items.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          <p className="mb-3">当前筛选下没有论文，点击“导入 PDF”或切换筛选条件。</p>
          <Button onClick={onImport}>选择 PDF 导入</Button>
        </div>
      );
    }
    if (mode === 'grid') {
      return (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              onOpenDetail={setSelectedId}
              onOpenReader={onOpenReader}
              onOpenPdf={(it) => void onOpenPdf(it)}
              onToggleFavorite={(it) => void onToggleFavorite(it)}
              onDeletePaper={(it) => onRequestDeletePaper(it)}
              multiSelectMode={multiSelectMode && !passive}
              selected={selectedPaperIds.includes(paper.id)}
              onToggleSelect={toggleSelectPaper}
            />
          ))}
        </div>
      );
    }
    return <PaperList papers={items} onSelect={setSelectedId} />;
  }

  async function onCopyCitation(paper: Paper, format: CitationFormat) {
    try {
      const citation = formatCitation(paper, format);
      await navigator.clipboard.writeText(citation);
      setError(format === 'endnote_ris' ? '已复制 EndNote 引用。' : '已复制国标引用。');
    } catch (err) {
      setError(`复制引用失败：${String(err)}`);
    }
  }

  async function onEnrichMetadata(paper: Paper) {
    try {
      const result = await enrichPaperMetadata(paper.id, false);
      if (result.updated) patchPaper(result.updated);
      setError(`补全成功（来源：${result.source || '本地规则'}）。`);
    } catch (err) {
      setError(`元数据补全失败：${String(err)}`);
    }
  }

  async function onBatchEnrich() {
    try {
      setLoading(true);
      const result = await enrichAllMetadata(false);
      await refreshData();
      if (result.failed.length > 0) {
        setError(`批量补全完成：成功 ${result.success_count}，失败 ${result.failed.length}`);
      } else {
        setError(`批量补全完成：成功 ${result.success_count}`);
      }
    } catch (err) {
      setError(`批量补全失败：${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function onSaveReaderSettings() {
    try {
      const saved = await saveAppSettings(settingsDraft);
      setSettingsDraft(saved);
      setSettingsOpen(false);
      showAppToast('阅读器设置已保存');
      setError(undefined);
    } catch (err) {
      setError(`保存阅读器设置失败：${String(err)}`);
    }
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-slate-900/70 px-4 py-2 text-sm text-white transition-all duration-300 ${
          appToastVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {appToastText}
      </div>
      <Sidebar
        papers={papers}
        categories={categories}
        activeCategory={filters.category}
        activeShelf={activeShelf}
        onShelfSelect={onShelfSelect}
        onCategoryChange={onSidebarCategoryChange}
        onCreateCategory={onCreateCategory}
        onRenameCategory={onRenameCategory}
        onDeleteCategory={onDeleteCategory}
      />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <TopBar
          query={filters.query}
          onQuery={(query) => {
            setFilters({ query });
            triggerListTransition();
          }}
          onImport={onImport}
          onBatchEnrich={() => void onBatchEnrich()}
          onReaderSettings={() => setSettingsOpen(true)}
          viewMode={viewMode}
          onViewMode={setViewMode}
          category={filters.category}
          onCategory={(category) => { setFilters({ category, smartShelf: 'all' }); triggerListTransition(); }}
          readStatus={filters.readStatus}
          onReadStatus={(readStatus) => { setFilters({ readStatus, smartShelf: 'all' }); triggerListTransition(); }}
          sortBy={filters.sortBy}
          onSortBy={(sortBy) => {
            setFilters({ sortBy });
            triggerListTransition();
          }}
          categories={categories}
        />
        <div className="mx-4 mt-3 flex items-center gap-2">
          <Button size="sm" variant={multiSelectMode ? 'default' : 'secondary'} onClick={toggleMultiSelectMode}>
            {multiSelectMode ? '退出多选' : '进入多选'}
          </Button>
          {multiSelectMode && (
            <span className="text-xs text-slate-600">已选 {selectedPaperIds.length} 篇</span>
          )}
        </div>
        {multiSelectMode && (
          <div className="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
            <select
              className="h-8 rounded border border-slate-200 px-2 text-xs"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            >
              <option value="all">批量改分类</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={() => void onBulkCategory()} disabled={selectedPaperIds.length === 0 || bulkCategory === 'all'}>应用分类</Button>
            <Button size="sm" variant="secondary" onClick={() => void onBulkReadStatus('unread')} disabled={selectedPaperIds.length === 0}>批量未读</Button>
            <Button size="sm" variant="secondary" onClick={() => void onBulkReadStatus('reading')} disabled={selectedPaperIds.length === 0}>批量在读</Button>
            <Button size="sm" variant="secondary" onClick={() => void onBulkReadStatus('read')} disabled={selectedPaperIds.length === 0}>批量已读</Button>
            <Button size="sm" variant="secondary" onClick={() => void onBulkFavorite(true)} disabled={selectedPaperIds.length === 0}>批量收藏</Button>
            <Button size="sm" variant="secondary" onClick={() => void onBulkFavorite(false)} disabled={selectedPaperIds.length === 0}>批量取消收藏</Button>
            <Button size="sm" variant="secondary" onClick={() => void onBulkEnrich()} disabled={selectedPaperIds.length === 0}>批量补全</Button>
            <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => void onBulkDelete()} disabled={selectedPaperIds.length === 0}>批量删除</Button>
          </div>
        )}
        {error && <div className="mx-4 mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{error}</div>}
        {loading && <div className="mx-4 mt-3 text-sm text-slate-500">处理中...</div>}
        <section className="min-h-0 flex-1 overflow-auto p-4">
          <div className="list-stage">
            {outgoingPapers && !reduceMotion ? (
              <div className="list-outgoing pointer-events-none">
                {renderPaperCollection(outgoingPapers, outgoingViewMode, true)}
              </div>
            ) : null}
            <div key={listAnimNonce} className={isListTransitioning && !reduceMotion ? 'list-incoming-anim' : 'list-incoming'}>
              {renderPaperCollection(dataToRender, viewMode)}
            </div>
          </div>
        </section>
        <div
          className={`pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-blue-300/60 bg-blue-500/25 px-4 py-2 text-sm text-blue-900 shadow-sm backdrop-blur-sm transition-opacity duration-500 ${
            folderToastVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          已打开文件夹
        </div>
      </main>
      <DetailDrawer
        isOpen={drawerOpen}
        key={drawerPaper?.id ?? 'drawer'}
        paper={drawerPaper}
        notes={noteItems}
        relatedPapers={relatedPapers}
        onSelectRelated={(id) => setSelectedId(id)}
        onDeleteNote={onDeleteNoteItem}
        onOpenReader={onOpenReader}
        onClose={onCloseDrawer}
        onFavorite={onToggleFavorite}
        onReadStatus={onReadStatus}
        onSaveMeta={onSaveMeta}
        onSetCategory={onSetCategory}
        categories={categories}
        onOpenFolder={onOpenFolder}
        onCopyCitation={(paper, format) => onCopyCitation(paper, format)}
        onEnrichMetadata={onEnrichMetadata}
        onDeletePaper={onRequestDeletePaper}
      />
      <LocalErrorBoundary>
        <Suspense fallback={null}>
          <ReaderPanel
            open={readerOpen}
            paper={readerPaper}
            notes={readerNoteItems}
            focusTarget={readerFocusTarget}
            onClose={() => setReaderOpen(false)}
            onProgress={onReaderProgress}
            onCreateNote={onCreateNoteFromReader}
            onDeleteNote={onDeleteNoteItem}
            onUpdateHighlightColor={onUpdateHighlightColor}
          />
        </Suspense>
      </LocalErrorBoundary>

      {settingsOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">阅读器设置</h3>
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="reader_mode"
                  checked={settingsDraft.reader_mode === 'system'}
                  onChange={() => setSettingsDraft((prev) => ({ ...prev, reader_mode: 'system' }))}
                />
                系统默认打开
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="reader_mode"
                  checked={settingsDraft.reader_mode === 'custom'}
                  onChange={() => setSettingsDraft((prev) => ({ ...prev, reader_mode: 'custom' }))}
                />
                使用外部阅读器路径
              </label>
              <Input
                placeholder="例如：/Applications/Preview.app/Contents/MacOS/Preview"
                value={settingsDraft.external_reader_path || ''}
                onChange={(e) => setSettingsDraft((prev) => ({ ...prev, external_reader_path: e.target.value }))}
                disabled={settingsDraft.reader_mode !== 'custom'}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(false)}>取消</Button>
              <Button size="sm" onClick={() => void onSaveReaderSettings()}>保存</Button>
            </div>
          </div>
        </div>
      )}

      {pendingDuplicateImport && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">检测到重复论文</h3>
            <p className="text-sm text-slate-600">
              检测到 {pendingDuplicateImport.duplicatePaths.length} 个重复论文，是否仍然导入这些重复项？
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={onCancelImportDuplicates}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void onConfirmImportDuplicates()}>
                OK
              </Button>
            </div>
          </div>
        </div>
      )}

      {pendingDeletePaper && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">确认删除</h3>
            <p className="text-sm text-slate-600">
              确定要删除这篇论文吗？将删除 PaperWall 托管副本和缩略图缓存，原始文件不会被删除。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPendingDeletePaper(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => void onConfirmDeletePaper()}
              >
                确定删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
