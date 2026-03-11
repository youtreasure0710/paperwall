import { Eye, FileText, Heart, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
      className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-card transition-[transform,box-shadow] duration-170 ease-out motion-reduce:transition-none motion-reduce:hover:transform-none hover:-translate-y-[2px] hover:shadow-lg"
      onClick={() => {
        if (multiSelectMode) {
          onToggleSelect?.(paper.id);
          return;
        }
        onOpenDetail(paper.id);
      }}
    >
      {multiSelectMode && (
        <label className="absolute left-3 top-3 z-10 flex items-center rounded bg-white/90 px-1 py-0.5">
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
            className="absolute right-0 top-full z-20 mt-1 w-36 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
              onClick={() => {
                onOpenDetail(paper.id);
                setMenuOpen(false);
              }}
            >
              查看详情
            </button>
            <button
              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
              onClick={() => {
                onOpenPdf(paper);
                setMenuOpen(false);
              }}
            >
              打开 PDF
            </button>
            <button
              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
              onClick={() => {
                onToggleFavorite(paper);
                setMenuOpen(false);
              }}
            >
              {paper.is_favorite ? '取消收藏' : '加入收藏'}
            </button>
            <button
              className="w-full rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
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

      <div className="relative mb-3 aspect-[3/4] overflow-hidden rounded-lg bg-slate-100">
        {paper.thumbnail_path && !thumbnailFailed ? (
          <img
            src={toAssetSrc(paper.thumbnail_path)}
            alt={paper.title}
            className="h-full w-full object-cover"
            onError={() => setThumbnailFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">暂无缩略图</div>
        )}
        <div className="absolute inset-x-2 bottom-2 flex gap-1 opacity-0 transition-opacity duration-170 ease-out motion-reduce:transition-none group-hover:opacity-100">
          <Button size="icon" variant="secondary" onClick={(e) => { e.stopPropagation(); onOpenReader(paper); }}><Eye className="h-4 w-4" /></Button>
          <Button size="icon" variant="secondary" onClick={(e) => { e.stopPropagation(); onOpenPdf(paper); }}><FileText className="h-4 w-4" /></Button>
          <Button size="icon" variant="secondary" onClick={(e) => { e.stopPropagation(); onToggleFavorite(paper); }}>
            <Heart className={`h-4 w-4 ${paper.is_favorite ? 'fill-red-500 text-red-500' : ''}`} />
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{paper.title || paper.file_name}</h3>
        <p className="line-clamp-1 text-xs text-slate-500">{paper.authors.slice(0, 3).join(', ') || '未知作者'}</p>
        <div className="flex items-center gap-2 text-xs">
          <Badge>{paper.category || 'Other'}</Badge>
          <span className="text-slate-500">{paper.year ?? '-'}</span>
        </div>
        <p className="line-clamp-2 text-xs text-slate-600">{paper.summary || '暂无简介'}</p>
      </div>
    </article>
  );
}
