import { Eye, FileText, Heart, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toAssetSrc } from '@/services/pdf';
import type { Paper } from '@/types/paper';

interface PaperCardProps {
  paper: Paper;
  onOpenDetail: (id: string) => void;
  onOpenReader: (paper: Paper) => void;
  onOpenPdf: (paper: Paper) => void;
  onToggleFavorite: (paper: Paper) => void;
  onDeletePaper: (paper: Paper) => void;
  multiSelectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function PaperCard({
  paper,
  onOpenDetail,
  onOpenReader,
  onOpenPdf,
  onToggleFavorite,
  onDeletePaper,
  multiSelectMode = false,
  selected = false,
  onToggleSelect,
}: PaperCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [menuOpen]);

  return (
    <article
      data-paper-card="true"
      className={cn(
        'pw-paper-card group relative cursor-pointer rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-sm)] transition-[transform,box-shadow,border-color,background-color] duration-slow ease-out motion-reduce:transition-none motion-reduce:hover:transform-none hover:-translate-y-[1px] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-secondary)] hover:!shadow-[0_18px_34px_-16px_rgba(0,0,0,0.58)] active:translate-y-0 active:scale-[0.997]',
        selected && multiSelectMode && 'ring-1 ring-[var(--accent-default)]/35',
      )}
      onClick={() => {
        if (multiSelectMode) {
          onToggleSelect?.(paper.id);
          return;
        }
        onOpenDetail(paper.id);
      }}
    >
      {multiSelectMode && (
        <label className="absolute left-3 top-3 z-10 flex items-center rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)]/90 px-1 py-0.5 backdrop-blur-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(paper.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
      )}
      <div className="absolute right-3 top-3 z-10">
        <div ref={triggerRef}>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        </div>
        {menuOpen && (
          <div
            ref={menuRef}
            className="pw-popover-surface absolute right-0 top-full z-20 mt-1 w-36 p-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="pw-menu-item w-full px-2 py-1.5 text-left text-sm"
              onClick={() => {
                onOpenDetail(paper.id);
                setMenuOpen(false);
              }}
            >
              查看详情
            </button>
            <button
              className="pw-menu-item w-full px-2 py-1.5 text-left text-sm"
              onClick={() => {
                onOpenPdf(paper);
                setMenuOpen(false);
              }}
            >
              打开 PDF
            </button>
            <button
              className="pw-menu-item w-full px-2 py-1.5 text-left text-sm"
              onClick={() => {
                onToggleFavorite(paper);
                setMenuOpen(false);
              }}
            >
              {paper.is_favorite ? '取消收藏' : '加入收藏'}
            </button>
            <button
              className="w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm text-red-600 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-red-50/80 dark:text-red-400 dark:hover:bg-red-900/20"
              onClick={() => {
                onDeletePaper(paper);
                setMenuOpen(false);
              }}
            >
              删除论文
            </button>
          </div>
        )}
      </div>

      <div className="relative mb-3.5 aspect-[3/4] overflow-visible rounded-lg border border-[var(--border-default)]/70 bg-[var(--bg-surface-secondary)]">
        {paper.thumbnail_path && !thumbnailFailed ? (
          <img
            src={toAssetSrc(paper.thumbnail_path)}
            alt={paper.title}
            className="h-full w-full rounded-lg object-cover"
            onError={() => setThumbnailFailed(true)}
          />
        ) : (
        <div className="flex h-full items-center justify-center text-xs text-[var(--text-tertiary)]">暂无缩略图</div>
        )}
        <div className="absolute inset-x-2 bottom-2 flex translate-y-1 justify-start opacity-0 transition-[opacity,transform,filter] duration-[420ms] ease-out motion-reduce:transition-none group-hover:translate-y-0 group-hover:opacity-100 group-hover:blur-0">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border-default)]/70 bg-[var(--bg-surface)]/78 p-1 backdrop-blur-md">
            <div className="group/icon relative">
              <Button
                size="icon"
                variant="ghost"
                aria-label="全文阅读"
                className="pw-frost-button opacity-0 transition-[opacity,transform,background-color,border-color,box-shadow,color] duration-[var(--motion-base)] ease-out delay-75 group-hover:translate-y-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onOpenReader(paper); }}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <span className="pw-popover-surface pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap px-2 py-1 text-[10px] text-[var(--text-primary)] opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/icon:opacity-100">
                全文阅读
              </span>
            </div>
            <div className="group/icon relative">
              <Button
                size="icon"
                variant="ghost"
                aria-label="打开 PDF"
                className="pw-frost-button opacity-0 transition-[opacity,transform,background-color,border-color,box-shadow,color] duration-[var(--motion-base)] ease-out delay-100 group-hover:translate-y-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onOpenPdf(paper); }}
              >
                <FileText className="h-4 w-4" />
              </Button>
              <span className="pw-popover-surface pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap px-2 py-1 text-[10px] text-[var(--text-primary)] opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/icon:opacity-100">
                打开 PDF
              </span>
            </div>
            <div className="group/icon relative">
              <Button
                size="icon"
                variant="ghost"
                aria-label={paper.is_favorite ? '取消收藏' : '收藏'}
                className="pw-frost-button opacity-0 transition-[opacity,transform,background-color,border-color,box-shadow,color] duration-[var(--motion-base)] ease-out delay-150 group-hover:translate-y-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(paper); }}
              >
                <Heart className={`h-4 w-4 ${paper.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
              </Button>
              <span className="pw-popover-surface pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap px-2 py-1 text-[10px] text-[var(--text-primary)] opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/icon:opacity-100">
                {paper.is_favorite ? '取消收藏' : '收藏'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-5 text-[var(--text-primary)]">{paper.title || paper.file_name}</h3>
        <p className="line-clamp-1 text-[12px] text-[var(--text-secondary)]">{paper.authors.slice(0, 3).join(', ') || '未知作者'}</p>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
          <Badge>{paper.category || 'Other'}</Badge>
          <span>{paper.year ?? '-'}</span>
          {paper.venue ? <span className="line-clamp-1 max-w-[120px]">{paper.venue}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {paper.last_read_page && paper.last_read_page > 0 ? (
            <span className="rounded-full border border-[var(--accent-default)]/25 bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] text-[var(--accent-default)]">
              读到第 {paper.last_read_page} 页
            </span>
          ) : (
            <span className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)]">
              未开始阅读
            </span>
          )}
        </div>
        {paper.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {paper.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} className="border-[var(--border-default)] bg-[var(--bg-surface-secondary)] text-[10px] text-[var(--text-tertiary)]">{tag}</Badge>
            ))}
          </div>
        ) : null}
        <p className="line-clamp-2 text-[11px] leading-4 text-[var(--text-tertiary)]">{paper.summary || '暂无简介'}</p>
      </div>
    </article>
  );
}
