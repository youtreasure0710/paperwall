import { MoreHorizontal, Settings } from 'lucide-react';
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
  onOpenSettings: () => void;
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
    onOpenSettings,
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
    <aside className="pw-sidebar relative flex h-full w-64 flex-col border-r border-[var(--border-default)] bg-[var(--bg-sidebar)] px-3 py-4 transition-colors duration-slow ease-out">
      <h1 className="mb-5 px-2 text-xl font-semibold tracking-tight text-[var(--text-primary)]">PaperWall</h1>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-2 px-2 text-[10px] font-medium tracking-[0.14em] text-[var(--text-tertiary)]/90">智能书架</div>
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

        <div className="mt-6 border-t border-[var(--border-default)]/70 pt-4">
          <div className="mb-2 px-2 text-[10px] font-medium tracking-[0.14em] text-[var(--text-tertiary)]/90">分类</div>
          {creatingCategory && (
            <div className="mb-2 space-y-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2">
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
                className="rounded-md border border-[var(--border-default)] px-1.5 py-1 text-[11px] text-[var(--text-secondary)] transition-colors duration-base hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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
                    className="ml-1 rounded-md p-0.5 text-[var(--text-tertiary)] opacity-0 transition-[opacity,background-color,transform,color] duration-base ease-out hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] active:scale-95 group-hover/category:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenFor((prev) => (prev === category ? null : category));
                    }}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
                {renamingCategory === category && (
                  <div className="mt-1 space-y-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2">
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
                    className="pw-popover-surface absolute right-1 top-8 z-20 w-28 p-1"
                  >
                    <button
                      className="pw-menu-item w-full px-2 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:text-[var(--text-tertiary)]"
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
                      className="w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-red-600 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-red-50/80 disabled:cursor-not-allowed disabled:text-[var(--text-tertiary)]"
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

      <div className="mt-4 border-t border-[var(--border-default)]/70 px-1 pt-3 text-xs text-[var(--text-tertiary)]">
        <button
          type="button"
          className="mb-2 inline-flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--text-secondary)] transition-[background-color,color,transform] duration-base ease-out hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:scale-[0.995]"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenSettings();
          }}
        >
          <Settings className="h-4 w-4" />
          <span>设置</span>
        </button>
        <div className="px-1 text-[11px]">v0.3.0</div>
        <div className="mt-1 px-1 text-[11px]">Designed &amp; Developed by TreasureU</div>
      </div>
      {confirmDeleteCategory && (
        <div className="pw-overlay-scrim absolute inset-0 z-40 flex items-center justify-center p-3">
          <div className="pw-dialog-surface w-full max-w-56 p-3">
            <p className="text-xs text-[var(--text-secondary)]">
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
                className="pw-danger-btn"
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
    'relative flex h-9 w-full items-center rounded-md px-2.5 py-1.5 text-left text-[var(--text-secondary)] transition-[background-color,color,box-shadow] duration-slow ease-out hover:bg-[var(--bg-hover)]/72 hover:text-[var(--text-primary)] motion-reduce:transition-none',
    active &&
      'bg-[var(--selected-bg)] text-[var(--accent-text)] font-semibold shadow-[inset_0_0_0_1px_var(--selected-border)] before:absolute before:bottom-[7px] before:left-[4px] before:top-[7px] before:w-[2px] before:rounded-full before:bg-[var(--accent-default)]'
  );
}

function badgeClass(active: boolean) {
  return cn(
    'ml-auto text-[10px] transition-[background-color,color,border-color] duration-base ease-out',
    active
      ? 'border-[var(--accent-border)] bg-[var(--selected-bg)]/85 text-[var(--accent-text)]'
      : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-tertiary)]'
  );
}
