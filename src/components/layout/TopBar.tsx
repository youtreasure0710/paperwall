import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { ViewMode } from '@/types/paper';

interface TopBarProps {
  query: string;
  onQuery: (value: string) => void;
  onImport: () => void;
  onReaderSettings: () => void;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
}

export function TopBar(props: TopBarProps) {
  return (
    <header className="pw-topbar flex flex-wrap items-center gap-2 border-b border-[var(--border-default)] bg-[var(--bg-surface)] p-3 transition-colors duration-slow ease-out">
      <div className="relative min-w-64 flex-1">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-[var(--text-tertiary)]" />
        <Input className="pl-8" placeholder="搜索标题、作者、摘要、分类、年份" value={props.query} onChange={(e) => props.onQuery(e.target.value)} />
      </div>
      <Button onClick={props.onImport}>导入 PDF</Button>
      <Button variant="secondary" onClick={props.onReaderSettings}>阅读器设置</Button>
      <Select value={props.viewMode} onChange={(e) => props.onViewMode(e.target.value as ViewMode)}>
        <option value="grid">卡片视图</option>
        <option value="list">列表视图</option>
      </Select>
    </header>
  );
}
