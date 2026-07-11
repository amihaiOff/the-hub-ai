'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, FileText, LayoutPanelLeft, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePages, useCreatePage } from '@/lib/hooks/use-pages';

/**
 * "Areas" sidebar entry — a nav row that opens a floating popup with the
 * household's pages (Notion-like documents) plus a "New page" affordance,
 * instead of expanding inline. The right-pointing ChevronRight signals the
 * popup direction. Shared by the desktop sidebar and the mobile menu via
 * the `variant` prop.
 */
export function AreasNav({
  variant,
  onNavigate,
}: {
  variant: 'desktop' | 'mobile';
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: pages = [] } = usePages();
  const createPage = useCreatePage();

  const sectionActive = pathname.startsWith('/areas');
  const [open, setOpen] = useState(false);

  const handleCreate = () => {
    createPage.mutate(
      {},
      {
        onSuccess: (page) => {
          setOpen(false);
          onNavigate?.();
          router.push(`/areas/${page.id}`);
        },
      }
    );
  };

  const isMobile = variant === 'mobile';
  const rowText = isMobile ? 'text-base' : 'text-sm';
  const rowPad = isMobile ? 'py-3' : 'py-2.5';
  const parentActiveCls = isMobile
    ? 'bg-accent/50 text-foreground'
    : 'bg-sidebar-accent/50 text-sidebar-foreground';
  const parentIdleCls = isMobile
    ? 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground';
  const subActiveCls = 'bg-accent text-accent-foreground';
  const subIdleCls = 'text-foreground/70 hover:bg-accent/60 hover:text-foreground';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 font-medium transition-all',
            rowText,
            rowPad,
            sectionActive ? parentActiveCls : parentIdleCls
          )}
        >
          <span className="flex items-center gap-3">
            <LayoutPanelLeft className="h-5 w-5" />
            Areas
          </span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={isMobile ? 'top' : 'right'}
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-64 rounded-2xl border p-1 shadow-xl"
      >
        <div className="max-h-[60vh] overflow-y-auto">
          {pages.map((p) => {
            const href = `/areas/${p.id}`;
            const active = pathname === href;
            return (
              <Link
                key={p.id}
                href={href}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all',
                  active ? subActiveCls : subIdleCls
                )}
              >
                {p.emoji ? (
                  <span className="w-4 text-center text-sm leading-none">{p.emoji}</span>
                ) : (
                  <FileText className="h-4 w-4 shrink-0" />
                )}
                <span className="flex-1 truncate">{p.title.trim() || 'Untitled'}</span>
              </Link>
            );
          })}

          {pages.length === 0 && (
            <p className="text-muted-foreground/70 px-2.5 py-2 text-xs">No pages yet</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={createPage.isPending}
          className={cn(
            'mt-1 flex w-full items-center gap-2.5 rounded-lg border-t px-2.5 pt-2.5 pb-2 text-sm font-medium transition-all disabled:opacity-60',
            'border-border/40 text-foreground/80 hover:text-foreground'
          )}
        >
          {createPage.isPending ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1 text-left">New page</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
