import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        icon: 'h-9 w-9 px-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export const Card = forwardRef(function Card({ className, ...props }, ref) {
  return <div ref={ref} className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />;
});

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn('text-lg font-semibold leading-none tracking-normal', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export const Input = forwardRef(function Input({ className, type = 'text', ...props }, ref) {
  return <input ref={ref} type={type} className={cn('flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn('flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />;
});

export function Label({ className, ...props }) {
  return <label className={cn('text-sm font-medium leading-none text-foreground', className)} {...props} />;
}

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'border-border text-foreground',
      success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      warning: 'border-amber-200 bg-amber-50 text-amber-800',
      destructive: 'border-red-200 bg-red-50 text-red-800',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function Alert({ className, variant = 'default', ...props }) {
  return <div role="alert" className={cn('rounded-lg border border-border bg-card px-4 py-3 text-sm', variant === 'destructive' && 'border-red-200 bg-red-50 text-red-800', variant === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800', variant === 'warning' && 'border-amber-200 bg-amber-50 text-amber-800', className)} {...props} />;
}

export function Table({ className, ...props }) {
  return <div className="relative w-full overflow-auto"><table className={cn('w-full caption-bottom text-sm', className)} {...props} /></div>;
}

export function TableHeader({ className, ...props }) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-muted/60', className)} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <th className={cn('h-11 px-4 text-left align-middle text-xs font-medium text-muted-foreground', className)} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}

export function Skeleton({ className, ...props }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}