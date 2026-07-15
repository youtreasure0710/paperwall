import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Paper } from '@/types/paper';

export function PaperList({ papers, onSelect }: { papers: Paper[]; onSelect: (id: string) => void }) {
  return (
    <div className="pw-paper-list overflow-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] transition-colors duration-slow ease-out">
      <table className="w-full text-sm">
        <thead className="bg-[var(--bg-surface-secondary)]/88 text-left text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          <tr>
            <th className="p-3">标题</th>
            <th className="p-3">作者</th>
            <th className="p-3">年份</th>
            <th className="p-3">分类</th>
            <th className="p-3">操作</th>
          </tr>
        </thead>
        <tbody>
          {papers.map((paper) => (
            <tr key={paper.id} data-paper-row="true" className="border-t border-[var(--border-default)] transition-colors duration-[var(--motion-fast)] ease-out hover:bg-[var(--bg-hover)]/55">
              <td className="p-3 font-medium text-[var(--text-primary)]">{paper.title}</td>
              <td className="p-3 text-[var(--text-secondary)]">{paper.authors.slice(0, 2).join(', ')}</td>
              <td className="p-3 text-[var(--text-secondary)]">{paper.year ?? '-'}</td>
              <td className="p-3"><Badge>{paper.category}</Badge></td>
              <td className="p-3"><Button size="sm" variant="secondary" onClick={() => onSelect(paper.id)}>查看</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
