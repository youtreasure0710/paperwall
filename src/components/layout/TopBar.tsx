import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { ViewMode } from '@/types/paper';

interface TopBarProps {
  query: string;
  onQuery: (value: string) => void;
  onImport: () => void;
  onBatchEnrich: () => void;
  onReaderSettings: () => void;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  category: string;
  onCategory: (value: string) => void;
  readStatus: string;
  onReadStatus: (value: 'all' | 'unread' | 'reading' | 'read') => void;
  sortBy: string;
  onSortBy: (value: 'recent' | 'year' | 'title') => void;
  categories: string[];
}

export function TopBar(props: TopBarProps) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-3">
      <div className="relative min-w-64 flex-1">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
        <Input className="pl-8" placeholder="搜索标题、作者、摘要、分类、年份" value={props.query} onChange={(e) => props.onQuery(e.target.value)} />
      </div>
      <Button onClick={props.onImport}>导入 PDF</Button>
      <Button variant="secondary" onClick={props.onBatchEnrich}>批量补全元数据</Button>
      <Button variant="secondary" onClick={props.onReaderSettings}>阅读器设置</Button>
      <Select value={props.viewMode} onChange={(e) => props.onViewMode(e.target.value as ViewMode)}>
        <option value="grid">卡片视图</option>
        <option value="list">列表视图</option>
      </Select>
      <Select value={props.category} onChange={(e) => props.onCategory(e.target.value)}>
        <option value="all">全部分类</option>
        {props.categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </Select>
      <Select value={props.readStatus} onChange={(e) => props.onReadStatus(e.target.value as 'all' | 'unread' | 'reading' | 'read')}>
        <option value="all">全部状态</option>
        <option value="unread">未读</option>
        <option value="reading">在读</option>
        <option value="read">已读</option>
      </Select>
      <Select value={props.sortBy} onChange={(e) => props.onSortBy(e.target.value as 'recent' | 'year' | 'title')}>
        <option value="recent">最近导入</option>
        <option value="year">年份</option>
        <option value="title">标题</option>
      </Select>
    </header>
  );
}
