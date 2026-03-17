import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-secondary)]/92 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.01em] text-[var(--text-secondary)]',
        className,
      )}
    >
      {children}
    </span>
  );
}
