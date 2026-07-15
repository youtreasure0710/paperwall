import * as React from 'react';
import { cn } from '@/lib/utils';

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'h-9 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-sm)] outline-none transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] ease-out hover:border-[var(--border-strong)] focus:border-[var(--accent-default)] focus:shadow-[0_0_0_3px_var(--focus-ring)]',
        props.className
      )}
    />
  );
}
