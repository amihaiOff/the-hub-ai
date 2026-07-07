'use client';

import { useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskCategoryRow } from '@/lib/hooks/use-tasks';

interface QuickAddPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TaskCategoryRow[];
  /** Fired when the user submits — parent creates the task. */
  onSubmit: (title: string, categoryId: string | null) => void;
  isSubmitting?: boolean;
  /** The button (or other element) this popover anchors to. */
  children: React.ReactNode;
}

/**
 * Compact "quick add" popover that opens above the floating action
 * button on a short press. The title area is a textarea with
 * `field-sizing:content` so it wraps and grows as the user types. A
 * small category dropdown sits next to the submit button in the
 * footer.
 */
export function QuickAddPopover({
  open,
  onOpenChange,
  categories,
  onSubmit,
  isSubmitting = false,
  children,
}: QuickAddPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        className="w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border p-3 shadow-xl"
        onOpenAutoFocus={(e) => {
          // Radix's default focus target scrolls itself into view, which
          // on some layouts (fixed FAB near the viewport edge) yanks the
          // page down. We prevent the default focus and re-focus the
          // textarea ourselves with preventScroll so the page stays put.
          e.preventDefault();
          const target = e.target as HTMLElement | null;
          const textarea = target?.querySelector('textarea') as HTMLTextAreaElement | null;
          textarea?.focus({ preventScroll: true });
        }}
      >
        {/* Inner form is only mounted while the popover is open, so
            leaving/reopening resets state without an effect. */}
        <QuickAddForm
          categories={categories}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </PopoverContent>
    </Popover>
  );
}

function QuickAddForm({
  categories,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  categories: TaskCategoryRow[];
  onSubmit: (title: string, categoryId: string | null) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || isSubmitting) return;
    onSubmit(trimmed, categoryId);
  };

  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) : null;

  return (
    <>
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        rows={1}
        placeholder="What needs doing?"
        className={cn(
          'placeholder:text-muted-foreground [field-sizing:content]',
          'min-h-8 w-full resize-none overflow-hidden',
          'bg-transparent text-sm leading-snug break-words outline-none'
        )}
      />

      {/* Footer: category picker on the left, submit on the right. */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Choose category"
              title={selectedCategory?.name ?? 'No category'}
              className={cn(
                'border-border/60 hover:bg-muted/60 flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
                selectedCategory ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <span className="max-w-[8rem] truncate">{selectedCategory?.name ?? 'Category'}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="rounded-2xl">
            <DropdownMenuItem
              className={cn('rounded-lg text-sm', categoryId === null && 'bg-muted font-medium')}
              onSelect={() => setCategoryId(null)}
            >
              No category
            </DropdownMenuItem>
            {categories.map((c) => (
              <DropdownMenuItem
                key={c.id}
                className={cn('rounded-lg text-sm', categoryId === c.id && 'bg-muted font-medium')}
                onSelect={() => setCategoryId(c.id)}
              >
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || isSubmitting}
          aria-label="Create task"
          className={cn(
            'bg-primary text-primary-foreground flex h-7 w-7 items-center justify-center rounded-full transition-transform',
            'hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100'
          )}
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </>
  );
}
