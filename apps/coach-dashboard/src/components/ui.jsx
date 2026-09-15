import { forwardRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '../lib/utils';

const buttonVariants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const buttonSizes = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  icon: 'h-9 w-9',
};

export const Button = forwardRef(function Button(
  { className, variant = 'default', size = 'default', as: Component = 'button', ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
});

export const Card = forwardRef(function Card({ className, as: Component = 'div', ...props }, ref) {
  return <Component ref={ref} className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />;
});

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />;
}

export function CardTitle({ className, as: Component = 'h2', ...props }) {
  return <Component className={cn('font-display text-lg font-semibold leading-snug tracking-normal', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn('flex items-center p-5 pt-0', className)} {...props} />;
}

export function Badge({ className, variant = 'default', ...props }) {
  const variants = {
    default: 'border-transparent bg-primary text-primary-foreground',
    secondary: 'border-transparent bg-secondary text-secondary-foreground',
    outline: 'border-border text-foreground',
    destructive: 'border-transparent bg-destructive text-destructive-foreground',
  };
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', variants[variant], className)} {...props} />;
}

export function Alert({ className, variant = 'default', ...props }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-border bg-card px-4 py-3 text-sm',
        variant === 'destructive' && 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300',
        variant === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
        variant === 'info' && 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300',
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export function Spinner({ className }) {
  return <div className={cn('h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary', className)} />;
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      {message && <p className="text-sm">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Input({ className, ...props }) {
  return <input className={cn('flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn('flex min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />;
}

export function Label({ className, ...props }) {
  return <label className={cn('text-sm font-medium leading-none text-foreground', className)} {...props} />;
}

/** Marks a field's label as required - append right after the label text. */
export function Req() {
  return <span className="text-destructive"> *</span>;
}

/** shadcn/ui-style Select built on Radix. */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

export const SelectTrigger = forwardRef(function SelectTrigger({ className, size = 'default', children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        'flex w-fit min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 w-full',
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = forwardRef(function SelectContent({ className, children, position = 'popper', align = 'center', ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        data-slot="select-content"
        position={position}
        align={align}
        className={cn(
          'relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectLabel = forwardRef(function SelectLabel({ className, ...props }, ref) {
  return <SelectPrimitive.Label ref={ref} data-slot="select-label" className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)} {...props} />;
});

export const SelectItem = forwardRef(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      data-slot="select-item"
      className={cn(
        'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});

export const SelectSeparator = forwardRef(function SelectSeparator({ className, ...props }, ref) {
  return <SelectPrimitive.Separator ref={ref} data-slot="select-separator" className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)} {...props} />;
});

export const SelectScrollUpButton = forwardRef(function SelectScrollUpButton({ className, ...props }, ref) {
  return (
    <SelectPrimitive.ScrollUpButton ref={ref} data-slot="select-scroll-up-button" className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
      <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
  );
});

export const SelectScrollDownButton = forwardRef(function SelectScrollDownButton({ className, ...props }, ref) {
  return (
    <SelectPrimitive.ScrollDownButton ref={ref} data-slot="select-scroll-down-button" className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
  );
});

/** shadcn/ui-style Checkbox built on Radix. */
export const Checkbox = forwardRef(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-[4px] border border-input shadow-xs outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current transition-none">
        <Check className="h-3.5 w-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

/** shadcn/ui-style Switch built on Radix - used for the light/dark toggle. */
export const Switch = forwardRef(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
    </SwitchPrimitive.Root>
  );
});

/** shadcn/ui-style Dialog built on Radix - also the base for Sheet below. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)}
      {...props}
    />
  );
});

export const DialogContent = forwardRef(function DialogContent({ className, children, showClose = true, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg min-w-0 -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-x-hidden overflow-y-auto [&>*]:min-w-0',
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Închide</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export function DialogHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export const DialogTitle = forwardRef(function DialogTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn('font-display text-lg font-semibold', className)} {...props} />;
});

export const DialogDescription = forwardRef(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
});

/** Slide-in-from-left drawer, built on the same Radix Dialog primitive as
 * above (shadcn's Sheet is a styling variant of Dialog, not a separate
 * Radix package) - used for the sidebar nav on mobile. */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = forwardRef(function SheetContent({ className, children, side = 'left', ...props }, ref) {
  const sideClasses = {
    left: 'inset-y-0 left-0 h-full w-72 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left border-r',
    right: 'inset-y-0 right-0 h-full w-72 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right border-l',
  };
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex flex-col gap-4 border-border bg-sidebar text-sidebar-foreground p-0 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300',
          sideClasses[side],
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

/** shadcn/ui-style Tabs built on Radix. */
export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef(function TabsList({ className, ...props }, ref) {
  return <TabsPrimitive.List ref={ref} className={cn('inline-flex h-9 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', className)} {...props} />;
});

export const TabsTrigger = forwardRef(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = forwardRef(function TabsContent({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn('mt-4 focus-visible:outline-none', className)} {...props} />;
});

/** Plain styled table primitives - no Radix package needed for these. */
export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
}
export function TableBody({ className, ...props }) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}
export function TableRow({ className, ...props }) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-muted/50', className)} {...props} />;
}
export function TableHead({ className, ...props }) {
  return <th className={cn('h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)} {...props} />;
}
export function TableCell({ className, ...props }) {
  return <td className={cn('p-3 align-middle', className)} {...props} />;
}

/** shadcn/ui-style DropdownMenu built on Radix. */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuContent = forwardRef(function DropdownMenuContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = forwardRef(function DropdownMenuItem({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = forwardRef(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
});

export const DropdownMenuLabel = forwardRef(function DropdownMenuLabel({ className, ...props }, ref) {
  return <DropdownMenuPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />;
});

/** shadcn/ui-style Avatar built on Radix. */
export const Avatar = forwardRef(function Avatar({ className, ...props }, ref) {
  return <AvatarPrimitive.Root ref={ref} className={cn('relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full', className)} {...props} />;
});
export const AvatarImage = forwardRef(function AvatarImage({ className, ...props }, ref) {
  return <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full object-cover', className)} {...props} />;
});
export const AvatarFallback = forwardRef(function AvatarFallback({ className, ...props }, ref) {
  return <AvatarPrimitive.Fallback ref={ref} className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground', className)} {...props} />;
});

/** shadcn/ui-style Tooltip built on Radix. */
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef(function TooltipContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
