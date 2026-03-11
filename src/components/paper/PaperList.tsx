import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Paper } from '@/types/paper';

export function PaperList({ papers, onSelect }: { papers: Paper[]; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
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
            <tr key={paper.id} className="border-t border-slate-100">
              <td className="p-3 font-medium">{paper.title}</td>
              <td className="p-3 text-slate-600">{paper.authors.slice(0, 2).join(', ')}</td>
              <td className="p-3 text-slate-600">{paper.year ?? '-'}</td>
              <td className="p-3"><Badge>{paper.category}</Badge></td>
              <td className="p-3"><Button size="sm" variant="secondary" onClick={() => onSelect(paper.id)}>查看</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
