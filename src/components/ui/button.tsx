import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-[var(--radius-sm)] text-sm font-medium transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-[var(--motion-fast)] ease-out active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
  {
    variants: {
      variant: {
        default:
          'border border-transparent bg-[var(--accent-default)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-md)] active:bg-[var(--accent-active)]',
        secondary:
          'border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        ghost:
          'border border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        destructive:
          'border border-transparent bg-[rgba(220,38,38,0.86)] text-white shadow-[var(--shadow-sm)] hover:bg-[rgba(185,28,28,0.92)]',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-10 px-6 text-[15px]',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
