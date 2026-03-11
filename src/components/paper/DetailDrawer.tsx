import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatCitation, type CitationFormat } from '@/lib/citationFormatter';
import { cn } from '@/lib/utils';
import { toAssetSrc } from '@/services/pdf';
import type { NoteItem } from '@/types/note';
import type { Paper, ReadStatus } from '@/types/paper';

interface DetailDrawerProps {
  isOpen: boolean;
  paper?: Paper;
  notes: NoteItem[];
  relatedPapers: Paper[];
  onSelectRelated: (id: string) => void;
  onDeleteNote: (id: string) => Promise<void>;
  onOpenReader: (paper: Paper) => void;
  onClose: () => void;
  onFavorite: (paper: Paper) => Promise<void>;
  onReadStatus: (paper: Paper, value: ReadStatus) => Promise<void>;
  onSaveMeta: (paper: Paper) => Promise<void>;
  onSetCategory: (paper: Paper, category: string) => Promise<void>;
  categories: string[];
  onOpenFolder: (paper: Paper) => Promise<void>;
  onCopyCitation: (paper: Paper, format: CitationFormat) => Promise<void>;
  onEnrichMetadata: (paper: Paper) => Promise<void>;
  onDeletePaper: (paper: Paper) => Promise<void> | void;
}

const statusOptions: Array<{ key: ReadStatus; label: string }> = [
  { key: 'unread', label: '未读' },
  { key: 'reading', label: '在读' },
  { key: 'read', label: '已读' },
];

const citationFormats: Array<{ key: CitationFormat; label: string }> = [
  { key: 'endnote_ris', label: 'EndNote（RIS）' },
  { key: 'gbt7714', label: '国标引用（GB/T 7714）' },
];

interface HighlightMeta {
  kind?: string;
  color?: string;
}

type NoteGroupKey = 'yellow' | 'blue' | 'red' | 'note' | 'excerpt';

interface GroupedNoteItem {
  id: string;
  page: number | null;
  text: string;
  comment?: string;
  color?: 'yellow' | 'blue' | 'red';
}

function parseHighlightMeta(comment?: string): HighlightMeta | null {
  if (!comment) return null;
  try {
    const parsed = JSON.parse(comment) as HighlightMeta;
    if (parsed.kind === 'highlight') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

const noteGroupOrder: NoteGroupKey[] = ['yellow', 'blue', 'red', 'note', 'excerpt'];

function noteGroupTitle(group: NoteGroupKey) {
  if (group === 'yellow') return '黄色高亮';
  if (group === 'blue') return '蓝色高亮';
  if (group === 'red') return '红色高亮';
  if (group === 'note') return '笔记';
  return '摘要';
}

function noteGroupAccent(group: NoteGroupKey) {
  if (group === 'yellow') return 'border-amber-300 bg-amber-50/60';
  if (group === 'blue') return 'border-blue-300 bg-blue-50/60';
  if (group === 'red') return 'border-rose-300 bg-rose-50/60';
  if (group === 'note') return 'border-slate-300 bg-slate-50';
  return 'border-emerald-300 bg-emerald-50/60';
}

function itemAccent(group: NoteGroupKey) {
  if (group === 'yellow') return 'border-l-4 border-amber-400 bg-amber-50/70';
  if (group === 'blue') return 'border-l-4 border-blue-400 bg-blue-50/70';
  if (group === 'red') return 'border-l-4 border-rose-400 bg-rose-50/70';
  if (group === 'note') return 'border-l-4 border-slate-400 bg-slate-50';
  return 'border-l-4 border-emerald-400 bg-emerald-50/70';
}

export function DetailDrawer(props: DetailDrawerProps) {
  const paper = props.paper;
  const [editable, setEditable] = useState<Paper>(paper ?? ({} as Paper));
  const [openCategoryModal, setOpenCategoryModal] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string>(paper?.category ?? 'Other');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const [citationMenuOpen, setCitationMenuOpen] = useState(false);
  const saveToastTimer = useRef<number | null>(null);

  useEffect(() => {
    if (paper) {
      setEditable(paper);
      setPendingCategory(paper.category || 'Other');
      setPreviewFailed(false);
      setCitationMenuOpen(false);
    }
  }, [paper]);

  useEffect(
    () => () => {
      if (saveToastTimer.current) {
        window.clearTimeout(saveToastTimer.current);
      }
    },
    []
  );

  if (!paper && !props.isOpen) {
    return (
      <aside className="pointer-events-none absolute bottom-0 right-0 top-0 z-30 w-[460px] translate-x-full opacity-0" />
    );
  }
  if (!paper) return null;
  const currentPaper: Paper = paper;

  const currentFavorite = editable.is_favorite ?? currentPaper.is_favorite;
  const currentReadStatus = editable.read_status ?? currentPaper.read_status;
  const groupedStructuredNotes = useMemo(() => {
    const groups: Record<NoteGroupKey, GroupedNoteItem[]> = {
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
        const meta = parseHighlightMeta(item.comment);
        if (meta?.color === 'yellow' || meta?.color === 'blue' || meta?.color === 'red') {
          groups[meta.color].push({
            id: item.id,
            page: item.page_number ?? null,
            text,
            color: meta.color,
          });
          continue;
        }
        groups.excerpt.push({
          id: item.id,
          page: item.page_number ?? null,
          text,
        });
      }
    }
    return groups;
  }, [props.notes]);

  async function handleFavoriteToggle() {
    const next = !currentFavorite;
    setEditable({ ...editable, is_favorite: next });
    // onFavorite in App toggles based on incoming current value, so pass pre-toggle value.
    await props.onFavorite({ ...currentPaper, ...editable, is_favorite: currentFavorite });
  }

  async function handleReadStatus(value: ReadStatus) {
    setEditable({ ...editable, read_status: value });
    await props.onReadStatus({ ...currentPaper, ...editable, read_status: value }, value);
  }

  async function handleSaveMeta() {
    try {
      await props.onSaveMeta({
        ...currentPaper,
        ...editable,
        is_favorite: currentFavorite,
        read_status: currentReadStatus,
        category: editable.category || currentPaper.category,
      });
      if (saveToastTimer.current) {
        window.clearTimeout(saveToastTimer.current);
      }
      setSaveToastVisible(true);
      saveToastTimer.current = window.setTimeout(() => {
        setSaveToastVisible(false);
        saveToastTimer.current = null;
      }, 1200);
    } catch {
      // errors handled in App level
    }
  }

  return (
    <aside
      className={cn(
        'absolute bottom-0 right-0 top-0 z-30 h-full w-[460px] overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl transition-[transform,opacity] ease-out will-change-transform motion-reduce:transition-none',
        props.isOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-full opacity-0'
      )}
      style={{ transitionDuration: props.isOpen ? '260ms' : '190ms' }}
    >
      <div className={cn('pointer-events-none absolute right-4 top-4 z-30 rounded-md bg-slate-900/75 px-3 py-1.5 text-xs text-white transition-all duration-300', saveToastVisible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0')}>
        元数据已保存
      </div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">论文详情</h2>
        <Button variant="ghost" onClick={props.onClose}>关闭</Button>
      </div>

      <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {currentPaper.thumbnail_path && !previewFailed ? (
          <img
            src={toAssetSrc(currentPaper.thumbnail_path)}
            alt={currentPaper.title}
            className="h-56 w-full object-cover"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <div className="flex h-56 items-center justify-center text-sm text-slate-400">暂无预览图</div>
        )}
      </div>

      <div className="mb-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">{currentPaper.title || currentPaper.file_name}</h3>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>标题来源：{labelTitleSource(currentPaper.title_source)}</span>
          {currentPaper.title_pending_confirmation ? (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200">标题待确认</Badge>
          ) : null}
        </div>
        <p className="text-xs text-slate-600">{currentPaper.authors.join(', ') || '未知作者'}</p>
        <p className="text-xs text-slate-500">{currentPaper.year ?? '-'}</p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className={cn(
              'border',
              currentFavorite
                ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                : 'border-slate-200 bg-white text-slate-700'
            )}
            onClick={() => void handleFavoriteToggle()}
          >
            {currentFavorite ? '已收藏' : '收藏'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => props.onOpenReader(currentPaper)}>
            全文阅读
          </Button>
        </div>
        <div className="flex gap-2">
          {statusOptions.map((item) => (
            <button
              key={item.key}
              className={cn(
                'rounded-md border px-3 py-1 text-xs transition',
                currentReadStatus === item.key
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              )}
              onClick={() => void handleReadStatus(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={() => props.onOpenFolder(currentPaper)}>打开文件夹</Button>
        <div className="relative">
          <Button variant="secondary" size="sm" className="w-full" onClick={() => setCitationMenuOpen((v) => !v)}>导出引用</Button>
          {citationMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
              {citationFormats.map((item) => (
                <button
                  key={item.key}
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                  onClick={() => {
                    void props.onCopyCitation(currentPaper, item.key);
                    setCitationMenuOpen(false);
                  }}
                >
                  复制 {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setPendingCategory(currentPaper.category || 'Other');
            setOpenCategoryModal(true);
          }}
        >
          重新分类
        </Button>
        <Button size="sm" onClick={() => void handleSaveMeta()}>保存修改</Button>
        <Button variant="secondary" size="sm" className="col-span-2" onClick={() => void props.onEnrichMetadata(currentPaper)}>
          补全元数据
        </Button>
        <Button variant="secondary" size="sm" className="col-span-2 text-red-600 hover:bg-red-50" onClick={() => void props.onDeletePaper(currentPaper)}>
          删除论文
        </Button>
      </div>

      <div className="space-y-4 pb-8 pr-1 text-sm">
        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500">基本信息</h4>
          <label className="block text-xs text-slate-500">标题</label>
          <Input value={editable.title} onChange={(e) => setEditable({ ...editable, title: e.target.value })} />
          <label className="block text-xs text-slate-500">作者（逗号分隔）</label>
          <Input value={editable.authors.join(', ')} onChange={(e) => setEditable({ ...editable, authors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500">年份</label>
              <Input value={editable.year ?? ''} onChange={(e) => setEditable({ ...editable, year: Number(e.target.value) || undefined })} />
            </div>
            <div>
              <label className="block text-xs text-slate-500">会议/期刊</label>
              <Input value={editable.venue ?? ''} onChange={(e) => setEditable({ ...editable, venue: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-500">DOI</label>
              <Input value={editable.doi ?? ''} onChange={(e) => setEditable({ ...editable, doi: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-slate-500">arXiv 编号</label>
              <Input value={editable.arxiv_id ?? ''} onChange={(e) => setEditable({ ...editable, arxiv_id: e.target.value })} />
            </div>
          </div>
          <div className="text-xs text-slate-600">分类：<Badge>{currentPaper.category || 'Other'}</Badge></div>
          <div className="text-xs text-slate-600">上次阅读页：<Badge>{currentPaper.last_read_page ?? '-'}</Badge></div>
          <div className="text-xs text-slate-600">元数据状态：<Badge>{currentPaper.is_metadata_incomplete ? '不完整' : '完整'}</Badge></div>
          {currentPaper.duplicate_reason && (
            <div className="text-xs text-amber-700">重复候选：{currentPaper.duplicate_reason}</div>
          )}
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500">摘要</h4>
          <Textarea value={editable.abstract} onChange={(e) => setEditable({ ...editable, abstract: e.target.value })} className="min-h-24" />
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500">简介</h4>
          <Textarea value={editable.summary} onChange={(e) => setEditable({ ...editable, summary: e.target.value })} className="min-h-20" />
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500">结构化笔记 / 摘录</h4>
          {props.notes.length === 0 ? (
            <p className="text-xs text-slate-500">暂无记录。可在“全文阅读”中选中文字后添加。</p>
          ) : (
            <div className="space-y-3">
              {noteGroupOrder.map((groupKey) => {
                const groupItems = groupedStructuredNotes[groupKey];
                if (groupItems.length === 0) return null;
                return (
                  <div key={groupKey} className={cn('rounded-md border p-2', noteGroupAccent(groupKey))}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-700">{noteGroupTitle(groupKey)}</div>
                      <Badge className="text-[10px]">{groupItems.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {groupItems.map((item) => (
                        <div
                          key={item.id}
                          className={cn('block w-full rounded-md border border-slate-200 p-2 text-left', itemAccent(groupKey))}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <div className="text-[11px] text-slate-600">第 {item.page ?? '-'} 页</div>
                            <button
                              className="text-xs text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                void props.onDeleteNote(item.id);
                              }}
                            >
                              删除
                            </button>
                          </div>
                          <div className="text-xs text-slate-800">{item.text || '（无内容）'}</div>
                          {item.comment ? <div className="mt-1 text-[11px] text-slate-500">备注：{item.comment}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500">笔记（原始文本）</h4>
          <Textarea value={editable.notes} onChange={(e) => setEditable({ ...editable, notes: e.target.value })} className="min-h-28" />
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500">相关论文</h4>
          {props.relatedPapers.length === 0 ? (
            <p className="text-xs text-slate-500">暂无候选。</p>
          ) : (
            <div className="space-y-2">
              {props.relatedPapers.map((item) => (
                <button
                  key={item.id}
                  className="w-full rounded border border-slate-200 p-2 text-left hover:bg-slate-50"
                  onClick={() => props.onSelectRelated(item.id)}
                >
                  <div className="line-clamp-2 text-xs font-medium text-slate-900">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.authors.slice(0, 2).join(', ') || '未知作者'} · {item.year ?? '-'} · {item.category}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {openCategoryModal && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">选择分类</h3>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {props.categories.map((category) => (
                <button
                  key={category}
                  className={cn(
                    'rounded-md border px-2 py-1 text-left text-xs',
                    pendingCategory === category
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                  onClick={() => setPendingCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOpenCategoryModal(false)}>取消</Button>
              <Button
                size="sm"
                onClick={async () => {
                  await props.onSetCategory(currentPaper, pendingCategory);
                  setEditable({ ...editable, category: pendingCategory });
                  setOpenCategoryModal(false);
                }}
              >
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export function previewCitation(paper: Paper, format: CitationFormat): string {
  return formatCitation(paper, format);
}

function labelTitleSource(source?: Paper['title_source']) {
  switch (source) {
    case 'doi':
      return 'DOI 元数据';
    case 'arxiv':
      return 'arXiv 元数据';
    case 'pdf_header':
      return 'PDF 首页识别';
    case 'filename':
      return '文件名兜底';
    case 'manual':
      return '手动确认';
    default:
      return '未知';
  }
}
