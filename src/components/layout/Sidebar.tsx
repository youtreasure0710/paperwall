import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { smartShelfCount } from '@/lib/smartShelfSelector';
import { cn } from '@/lib/utils';
import type { Paper, SmartShelfKey } from '@/types/paper';

interface SidebarProps {
  papers: Paper[];
  categories: string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  onCreateCategory: (name: string) => Promise<void>;
  onRenameCategory: (oldName: string, newName: string) => Promise<void>;
  onDeleteCategory: (name: string) => Promise<void>;
  activeShelf: SmartShelfKey;
  onShelfSelect: (shelf: SmartShelfKey) => void;
}

const smartShelves: Array<{ key: SmartShelfKey; label: string }> = [
  { key: 'all', label: '全部论文' },
  { key: 'recent_imported', label: '最近导入' },
  { key: 'recent_read', label: '最近阅读' },
  { key: 'favorite', label: '已收藏' },
  { key: 'unread', label: '未读' },
  { key: 'reading', label: '在读' },
  { key: 'read', label: '已读' },
  { key: 'duplicates', label: '重复项' },
  { key: 'has_notes', label: '有笔记' },
  { key: 'metadata_incomplete', label: '元数据不完整' },
];

export function Sidebar(props: SidebarProps) {
  const {
    papers,
    categories,
    activeCategory,
    onCategoryChange,
    activeShelf,
    onShelfSelect,
    onCreateCategory,
    onRenameCategory,
    onDeleteCategory,
  } = props;
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      setMenuOpenFor(null);
    }
    if (!menuOpenFor) return;
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpenFor]);

  return (
    <aside className="relative flex h-full w-64 flex-col border-r border-slate-200 bg-white/80 p-4 backdrop-blur">
      <h1 className="mb-6 text-xl font-bold text-slate-900">PaperWall</h1>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-slate-500">智能书架</div>
        <nav className="space-y-1 text-sm">
          {smartShelves.map((item) => (
            <button
              key={item.key}
              className={itemClass(activeShelf === item.key)}
              onClick={() => onShelfSelect(item.key)}
            >
              {item.label}
              <Badge className={badgeClass(activeShelf === item.key)}>{smartShelfCount(papers, item.key)}</Badge>
            </button>
          ))}
        </nav>

        <div className="mt-6">
          <div className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-slate-500">分类</div>
          {creatingCategory && (
            <div className="mb-2 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2">
              <Input placeholder="输入分类名称" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="h-8 text-xs" />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!newCategoryName.trim()) return;
                    await onCreateCategory(newCategoryName.trim());
                    setNewCategoryName('');
                    setCreatingCategory(false);
                  }}
                >
                  确定
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setCreatingCategory(false); setNewCategoryName(''); }}>取消</Button>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <button
                className={itemClass(activeCategory === 'all')}
                onClick={() => {
                  onCategoryChange('all');
                  onShelfSelect('all');
                }}
              >
                全部分类
              </button>
              <button
                className="rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                onClick={() => setCreatingCategory((v) => !v)}
              >
                +
              </button>
            </div>
            {categories.map((category) => (
              <div key={category} className="relative group/category">
                <div className={itemClass(activeCategory === category)}>
                  <button
                    className="min-w-0 flex-1 truncate text-left"
                    onClick={() => onCategoryChange(category)}
                  >
                    {category}
                  </button>
                  <Badge className={badgeClass(activeCategory === category)}>
                    {papers.filter((paper) => paper.category === category).length}
                  </Badge>
                  <button
                    className="ml-1 rounded p-0.5 text-slate-500 hover:bg-slate-200 opacity-0 group-hover/category:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenFor((prev) => (prev === category ? null : category));
                    }}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
                {renamingCategory === category && (
                  <div className="mt-1 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-8 text-xs"
                      placeholder="输入新分类名称"
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        onClick={async () => {
                          const next = renameValue.trim();
                          if (!next) return;
                          await onRenameCategory(category, next);
                          setRenamingCategory(null);
                          setRenameValue('');
                        }}
                      >
                        确定
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setRenamingCategory(null);
                          setRenameValue('');
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}
                {menuOpenFor === category && (
                  <div
                    ref={menuRef}
                    className="absolute right-1 top-8 z-20 w-28 rounded-md border border-slate-200 bg-white p-1 shadow-md"
                  >
                    <button
                      className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                      disabled={category === 'Other'}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setMenuOpenFor(null);
                        if (category === 'Other') return;
                        setRenamingCategory(category);
                        setRenameValue(category);
                      }}
                    >
                      重命名
                    </button>
                    <button
                      className="w-full rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
                      disabled={category === 'Other'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenFor(null);
                        if (category === 'Other') return;
                        setConfirmDeleteCategory(category);
                      }}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
        <div>v0.1.0</div>
        <div className="mt-1">Designed &amp; Developed by TreasureU</div>
      </div>
      {confirmDeleteCategory && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-3">
          <div className="w-full max-w-56 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
            <p className="text-xs text-slate-700">
              确定删除分类“{confirmDeleteCategory}”吗？该分类下论文将回退到 Other。
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDeleteCategory(null)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={async () => {
                  const target = confirmDeleteCategory;
                  setConfirmDeleteCategory(null);
                  if (!target) return;
                  await onDeleteCategory(target);
                }}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function itemClass(active: boolean) {
  return cn(
    'relative flex w-full items-center rounded-md px-2 py-1.5 text-left text-slate-700 transition-colors hover:bg-slate-100/90 hover:text-slate-900',
    active &&
      'bg-blue-50/90 text-blue-900 font-semibold shadow-[inset_0_0_0_1px_rgba(59,130,246,0.16)] before:absolute before:bottom-1 before:left-0 before:top-1 before:w-1 before:rounded-r before:bg-blue-500'
  );
}

function badgeClass(active: boolean) {
  return cn(
    'ml-auto transition-colors',
    active
      ? 'border-blue-200 bg-blue-100 text-blue-800'
      : 'border-slate-200 bg-slate-100 text-slate-600'
  );
}
