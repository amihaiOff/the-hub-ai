'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, FileText, LayoutPanelLeft, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePages, useCreatePage } from '@/lib/hooks/use-pages';

/**
 * "Areas" sidebar section — an expandable row that lists the household's pages
 * (Notion-like documents) with a button at the bottom to create a new one.
 * Shared by the desktop sidebar and the mobile menu via the `variant` prop.
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
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded !== null ? manualExpanded : sectionActive;

  const handleCreate = () => {
    createPage.mutate(
      {},
      {
        onSuccess: (page) => {
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
  const subActiveCls = isMobile
    ? 'bg-accent text-accent-foreground'
    : 'bg-sidebar-accent text-sidebar-accent-foreground';
  const subIdleCls = isMobile
    ? 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground';
  const borderCls = isMobile ? 'border-border/40' : 'border-sidebar-border/30';

  return (
    <div>
      <button
        type="button"
        onClick={() => setManualExpanded(!expanded)}
        aria-expanded={expanded}
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
        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className={cn('mt-1 ml-4 space-y-1 border-l pl-3', borderCls)}>
          {pages.map((p) => {
            const href = `/areas/${p.id}`;
            const active = pathname === href;
            return (
              <Link
                key={p.id}
                href={href}
                onClick={onNavigate}
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
            <p className="text-muted-foreground/70 px-2.5 py-1 text-xs">No pages yet</p>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={createPage.isPending}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all disabled:opacity-60',
              subIdleCls
            )}
          >
            {createPage.isPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1 text-left">New page</span>
          </button>
        </div>
      )}
    </div>
  );
}
