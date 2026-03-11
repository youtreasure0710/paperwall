import * as React from 'react';
import { cn } from '@/lib/utils';

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none ring-blue-500 transition focus:ring-2',
        props.className
      )}
    />
  );
}
