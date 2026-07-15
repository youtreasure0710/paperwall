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
  onOpenReader: (paper: Paper, focus?: { page?: number; noteId?: string }) => void;
  onClose: () => void;
  onFavorite: (paper: Paper) => Promise<void>;
  onReadStatus: (paper: Paper, value: ReadStatus) => Promise<void>;
  onSaveMeta: (paper: Paper) => Promise<void>;
  onSetCategory: (paper: Paper, category: string) => Promise<void>;
  onAddTag: (paper: Paper, tag: string) => Promise<void>;
  onRemoveTag: (paper: Paper, tag: string) => Promise<void>;
  categories: string[];
  onOpenFolder: (paper: Paper) => Promise<void>;
  onRelinkFile: (paper: Paper) => Promise<void> | void;
  onCopyCitation: (paper: Paper, format: CitationFormat) => Promise<void>;
  onExportMarkdown: (paper: Paper, notes: NoteItem[]) => Promise<void>;
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
  if (group === 'yellow') return 'border-[rgba(255,214,102,0.5)] pw-hl-yellow-soft';
  if (group === 'blue') return 'border-[rgba(120,160,255,0.45)] pw-hl-blue-soft';
  if (group === 'red') return 'border-[rgba(255,130,130,0.45)] pw-hl-red-soft';
  if (group === 'note') return 'border-[var(--border-default)] bg-[var(--bg-surface-secondary)]';
  return 'border-[rgba(110,198,153,0.45)] bg-[rgba(110,198,153,0.12)]';
}

function itemAccent(group: NoteGroupKey) {
  if (group === 'yellow') return 'border-l-4 border-[rgba(255,214,102,0.95)] pw-hl-yellow-soft';
  if (group === 'blue') return 'border-l-4 border-[rgba(120,160,255,0.95)] pw-hl-blue-soft';
  if (group === 'red') return 'border-l-4 border-[rgba(255,130,130,0.95)] pw-hl-red-soft';
  if (group === 'note') return 'border-l-4 border-[var(--border-strong)] bg-[var(--bg-surface-secondary)]';
  return 'border-l-4 border-[rgba(110,198,153,0.95)] bg-[rgba(110,198,153,0.12)]';
}

export function DetailDrawer(props: DetailDrawerProps) {
  const paper = props.paper;
  const [editable, setEditable] = useState<Paper>(paper ?? ({} as Paper));
  const [openCategoryModal, setOpenCategoryModal] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string>(paper?.category ?? 'Other');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const [citationMenuOpen, setCitationMenuOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const saveToastTimer = useRef<number | null>(null);

  useEffect(() => {
    if (paper) {
      setEditable(paper);
      setPendingCategory(paper.category || 'Other');
      setPreviewFailed(false);
      setCitationMenuOpen(false);
      setNewTag('');
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
          const selectedRaw = (item.selected_text || '').trim();
          const remarkRaw = (item.content || '').trim();
          groups[meta.color].push({
            id: item.id,
            page: item.page_number ?? null,
            text: selectedRaw || text,
            comment: remarkRaw && (!selectedRaw || remarkRaw !== selectedRaw) ? remarkRaw : undefined,
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

  async function handleAddTag() {
    const tag = newTag.trim();
    if (!tag) return;
    await props.onAddTag(currentPaper, tag);
    setNewTag('');
  }

  return (
    <aside
      className={cn(
        'pw-detail-drawer absolute bottom-0 right-0 top-0 z-30 h-full w-[460px] overflow-y-auto border-l border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-5 shadow-[var(--shadow-overlay)] transition-[transform,opacity,box-shadow] ease-in-out will-change-transform motion-reduce:transition-none',
        props.isOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-full opacity-0'
      )}
      style={{ transitionDuration: props.isOpen ? '320ms' : '260ms' }}
    >
      <div className={cn('pw-toast pointer-events-none absolute right-4 top-4 z-30 px-3 py-1.5 text-xs transition-all duration-380 ease-out motion-reduce:transition-none', saveToastVisible ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0')}>
        元数据已保存
      </div>
      <div className="mb-4 flex items-center justify-between border-b border-[var(--border-default)]/80 pb-3">
        <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">论文详情</h2>
        <Button variant="ghost" onClick={props.onClose}>
          关闭
        </Button>
      </div>

      <div className="mb-4 overflow-hidden rounded-xl border border-[var(--border-default)]/90 bg-[var(--bg-surface-secondary)]">
        {currentPaper.thumbnail_path && !previewFailed ? (
          <img
            src={toAssetSrc(currentPaper.thumbnail_path)}
            alt={currentPaper.title}
            className="h-56 w-full object-cover"
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <div className="flex h-56 items-center justify-center text-sm text-[var(--text-tertiary)]">暂无预览图</div>
        )}
      </div>

      <div className="mb-4 space-y-2.5 rounded-xl border border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]/52 p-3.5">
        <h3 className="text-[15px] font-semibold leading-5 text-[var(--text-primary)]">{currentPaper.title || currentPaper.file_name}</h3>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          <span>标题来源：{labelTitleSource(currentPaper.title_source)}</span>
          {currentPaper.title_pending_confirmation ? (
            <Badge className="border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-200">
              标题待确认
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-[var(--text-secondary)]">{currentPaper.authors.join(', ') || '未知作者'}</p>
        <p className="text-[11px] text-[var(--text-tertiary)]">{currentPaper.year ?? '-'}</p>
        {currentPaper.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {currentPaper.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} className="border-[var(--border-default)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)]">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className={cn(
              'border',
                currentFavorite
                  ? 'border-[rgba(220,38,38,0.42)] bg-[rgba(220,38,38,0.12)] text-[rgba(185,28,28,0.95)] hover:bg-[rgba(220,38,38,0.18)] dark:border-[rgba(248,113,113,0.42)] dark:bg-[rgba(248,113,113,0.16)] dark:text-[rgba(254,202,202,0.95)] dark:hover:bg-[rgba(248,113,113,0.24)]'
                  : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              )}
            onClick={() => void handleFavoriteToggle()}
          >
            {currentFavorite ? '已收藏' : '收藏'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => props.onOpenReader(currentPaper)}>
            全文阅读
          </Button>
        </div>
        <div className="flex gap-2 pt-1">
          {statusOptions.map((item) => (
            <button
              key={item.key}
              className={cn(
                'rounded-md border px-3 py-1 text-xs transition-colors duration-base',
                currentReadStatus === item.key
                  ? 'border-[var(--accent-default)] bg-[var(--accent-soft)] text-[var(--accent-default)]'
                  : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              )}
              onClick={() => void handleReadStatus(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5 text-xs text-[var(--text-secondary)]">
          <div className="mb-1 font-medium text-[var(--text-primary)]">阅读进度</div>
          <div className="flex items-center gap-2">
            <span>上次阅读页：</span>
            <Badge>{currentPaper.last_read_page ?? '-'}</Badge>
          </div>
          {currentPaper.last_read_at ? (
            <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">最后阅读时间：{formatBeijingTime(currentPaper.last_read_at)}</div>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 rounded-xl border border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]/52 p-3">
        <Button variant="secondary" size="sm" onClick={() => props.onOpenFolder(currentPaper)}>打开文件夹</Button>
        <Button variant="secondary" size="sm" onClick={() => void props.onRelinkFile(currentPaper)}>重新定位文件</Button>
        <div className="relative">
          <Button variant="secondary" size="sm" className="w-full" onClick={() => setCitationMenuOpen((v) => !v)}>导出引用</Button>
          {citationMenuOpen && (
            <div className="pw-popover-surface absolute right-0 top-full z-20 mt-1 w-40 p-1">
              {citationFormats.map((item) => (
                <button
                  key={item.key}
                  className="pw-menu-item w-full px-2 py-1.5 text-left text-sm"
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
        <Button
          variant="secondary"
          size="sm"
          className="col-span-2"
          onClick={() => void props.onExportMarkdown(currentPaper, props.notes)}
        >
          导出 Markdown
        </Button>
        <Button variant="secondary" size="sm" className="col-span-2" onClick={() => void props.onEnrichMetadata(currentPaper)}>
          补全元数据
        </Button>
        <Button variant="secondary" size="sm" className="col-span-2 text-red-600 hover:bg-red-50/80 dark:hover:bg-red-900/20" onClick={() => void props.onDeletePaper(currentPaper)}>
          删除论文
        </Button>
      </div>

      <section className="mb-4 space-y-2.5 rounded-xl border border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]/52 p-3.5">
        <h4 className="text-[11px] font-medium tracking-[0.12em] text-[var(--text-tertiary)]">标签</h4>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="输入标签并添加"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAddTag();
              }
            }}
          />
          <Button size="sm" className="shrink-0 whitespace-nowrap px-4" onClick={() => void handleAddTag()}>
            添加
          </Button>
        </div>
        {currentPaper.tags.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">暂无标签。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {currentPaper.tags.map((tag) => (
              <div
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-secondary)]"
              >
                <span>{tag}</span>
                <button
                  className="rounded px-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                  onClick={() => void props.onRemoveTag(currentPaper, tag)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="space-y-4 pb-8 pr-1 text-sm">
        <section className="space-y-2.5 rounded-xl border border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]/52 p-3.5">
          <h4 className="text-[11px] font-medium tracking-[0.12em] text-[var(--text-tertiary)]">基本信息</h4>
          <label className="block text-xs text-[var(--text-tertiary)]">标题</label>
          <Input value={editable.title} onChange={(e) => setEditable({ ...editable, title: e.target.value })} />
          <label className="block text-xs text-[var(--text-tertiary)]">作者（逗号分隔）</label>
          <Input value={editable.authors.join(', ')} onChange={(e) => setEditable({ ...editable, authors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[var(--text-tertiary)]">年份</label>
              <Input value={editable.year ?? ''} onChange={(e) => setEditable({ ...editable, year: Number(e.target.value) || undefined })} />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-tertiary)]">会议/期刊</label>
              <Input value={editable.venue ?? ''} onChange={(e) => setEditable({ ...editable, venue: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[var(--text-tertiary)]">DOI</label>
              <Input value={editable.doi ?? ''} onChange={(e) => setEditable({ ...editable, doi: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-tertiary)]">arXiv 编号</label>
              <Input value={editable.arxiv_id ?? ''} onChange={(e) => setEditable({ ...editable, arxiv_id: e.target.value })} />
            </div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs text-[var(--text-secondary)]">
                分类：<Badge>{currentPaper.category || 'Other'}</Badge>
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                元数据状态：<Badge>{currentPaper.is_metadata_incomplete ? '不完整' : '完整'}</Badge>
              </div>
            </div>
            <Button size="sm" onClick={() => void handleSaveMeta()}>保存修改</Button>
          </div>
          {currentPaper.duplicate_reason && (
            <div className="text-xs text-amber-700 dark:text-amber-300">重复候选：{currentPaper.duplicate_reason}</div>
          )}
        </section>

        <section className="space-y-2.5 rounded-xl border border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]/52 p-3.5">
          <h4 className="text-[11px] font-medium tracking-[0.12em] text-[var(--text-tertiary)]">摘要</h4>
          <Textarea value={editable.abstract} onChange={(e) => setEditable({ ...editable, abstract: e.target.value })} className="min-h-24" />
        </section>

        <section className="space-y-2.5 rounded-xl border border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]/52 p-3.5">
          <h4 className="text-[11px] font-medium tracking-[0.12em] text-[var(--text-tertiary)]">结构化笔记 / 摘录</h4>
          {props.notes.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">暂无记录。可在“全文阅读”中选中文字后添加。</p>
          ) : (
            <div className="space-y-3">
              {noteGroupOrder.map((groupKey) => {
                const groupItems = groupedStructuredNotes[groupKey];
                if (groupItems.length === 0) return null;
                return (
                  <div key={groupKey} className={cn('rounded-lg border p-2.5', noteGroupAccent(groupKey))}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold text-[var(--text-secondary)]">{noteGroupTitle(groupKey)}</div>
                      <Badge className="text-[10px]">{groupItems.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {groupItems.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'block w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5 text-left',
                            itemAccent(groupKey),
                            groupKey === 'yellow'
                              ? 'cursor-pointer transition-colors hover:bg-amber-100/70 dark:hover:bg-amber-500/20'
                              : groupKey === 'blue'
                                ? 'cursor-pointer transition-colors hover:bg-blue-100/70 dark:hover:bg-blue-500/20'
                                : groupKey === 'red'
                                  ? 'cursor-pointer transition-colors hover:bg-rose-100/70 dark:hover:bg-rose-500/20'
                                  : ''
                          )}
                          onClick={() => {
                            if (groupKey !== 'yellow' && groupKey !== 'blue' && groupKey !== 'red') return;
                            props.onOpenReader(currentPaper, {
                              page: item.page ?? undefined,
                              noteId: item.id,
                            });
                          }}
                        >
                            <div className="mb-1 flex items-center justify-between">
                            <div className="text-[11px] text-[var(--text-tertiary)]">第 {item.page ?? '-'} 页</div>
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
                          <div className="text-xs leading-5 text-[var(--text-primary)]">{item.text || '（无内容）'}</div>
                          {item.comment ? <div className="mt-1 text-[11px] text-[var(--text-secondary)]">备注：{item.comment}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-2.5 rounded-xl border border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]/52 p-3.5">
          <h4 className="text-[11px] font-medium tracking-[0.12em] text-[var(--text-tertiary)]">笔记（原始文本）</h4>
          <Textarea value={editable.notes} onChange={(e) => setEditable({ ...editable, notes: e.target.value })} className="min-h-28" />
        </section>

        <section className="space-y-2.5 rounded-xl border border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]/52 p-3.5">
          <h4 className="text-[11px] font-medium tracking-[0.12em] text-[var(--text-tertiary)]">相关论文</h4>
          {props.relatedPapers.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">暂无候选。</p>
          ) : (
            <div className="space-y-2">
              {props.relatedPapers.map((item) => (
                <button
                  key={item.id}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                  onClick={() => props.onSelectRelated(item.id)}
                >
                  <div className="line-clamp-2 text-xs font-medium text-[var(--text-primary)]">{item.title}</div>
                  <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {item.authors.slice(0, 2).join(', ') || '未知作者'} · {item.year ?? '-'} · {item.category}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {openCategoryModal && (
        <div className="pw-overlay-scrim absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="pw-dialog-surface w-full max-w-sm p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">选择分类</h3>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {props.categories.map((category) => (
                <button
                  key={category}
                  className={cn(
                    'rounded-md border px-2 py-1 text-left text-xs',
                    pendingCategory === category
                      ? 'border-[var(--accent-default)] bg-[var(--accent-soft)] text-[var(--accent-default)]'
                      : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
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

function formatBeijingTime(input?: string) {
  if (!input) return '-';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
