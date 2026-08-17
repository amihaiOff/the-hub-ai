'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, FileText, LayoutPanelLeft, Loader2, Plus, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  usePages,
  useSections,
  useCreatePage,
  type PageListRow,
  type PageSectionRow,
} from '@/lib/hooks/use-pages';
import { PageSectionsDialog } from '@/components/shared/page-sections-dialog';

/**
 * "Areas" sidebar entry — a nav row that opens a floating popup with the
 * household's pages (Notion-like documents), grouped by section, plus a
 * "New page" affordance and a gear icon that opens the section-manager
 * dialog. Shared by the desktop sidebar and the mobile menu via `variant`.
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
  const { data: sections = [] } = useSections();
  const createPage = useCreatePage();

  const sectionActive = pathname.startsWith('/areas');
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

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

  const handleNavigate = () => {
    setOpen(false);
    onNavigate?.();
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

  const grouped = groupPagesBySection(pages, sections);

  return (
    <>
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
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className={cn('rounded-2xl border p-1 shadow-xl', isMobile ? 'w-[85vw]' : 'w-[540px]')}
        >
          <div className="max-h-[60vh] overflow-y-auto p-1">
            {isMobile ? (
              <MobileGroupedList
                grouped={grouped}
                pathname={pathname}
                onNavigate={handleNavigate}
              />
            ) : (
              <DesktopGroupedList
                grouped={grouped}
                pathname={pathname}
                onNavigate={handleNavigate}
              />
            )}

            {pages.length === 0 && sections.length === 0 && (
              <p className="text-muted-foreground/70 px-2.5 py-2 text-xs">No pages yet</p>
            )}
          </div>

          <div className="border-border/40 mt-1 flex items-center gap-2 border-t px-1 pt-2 pb-1">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createPage.isPending}
              className={cn(
                'flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all disabled:opacity-60',
                'text-foreground/80 hover:bg-accent/60 hover:text-foreground'
              )}
            >
              {createPage.isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 shrink-0" />
              )}
              <span>New page</span>
            </button>
            <button
              type="button"
              onClick={() => setManageOpen(true)}
              aria-label="Manage sections"
              title="Manage sections"
              className={cn(
                'text-muted-foreground hover:bg-accent/60 hover:text-foreground rounded-lg p-2 transition-all'
              )}
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <PageSectionsDialog open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

interface GroupedSection {
  section: PageSectionRow | null; // null = "Unsorted"
  pages: PageListRow[];
}

function groupPagesBySection(pages: PageListRow[], sections: PageSectionRow[]): GroupedSection[] {
  const bySection = new Map<string, PageListRow[]>();
  const unsorted: PageListRow[] = [];
  for (const p of pages) {
    if (p.sectionId) {
      const arr = bySection.get(p.sectionId) ?? [];
      arr.push(p);
      bySection.set(p.sectionId, arr);
    } else {
      unsorted.push(p);
    }
  }
  const groups: GroupedSection[] = sections.map((s) => ({
    section: s,
    pages: (bySection.get(s.id) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
  }));
  if (unsorted.length > 0) {
    groups.push({
      section: null,
      pages: unsorted.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    });
  }
  return groups;
}

function PageChip({
  page,
  pathname,
  onNavigate,
}: {
  page: PageListRow;
  pathname: string;
  onNavigate: () => void;
}) {
  const href = `/areas/${page.id}`;
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all',
        active
          ? 'bg-accent text-accent-foreground'
          : 'bg-muted/40 text-foreground/80 hover:bg-accent/60 hover:text-foreground'
      )}
    >
      {page.emoji ? (
        <span className="text-sm leading-none">{page.emoji}</span>
      ) : (
        <FileText className="h-3 w-3 shrink-0" />
      )}
      <span className="max-w-[140px] truncate">{page.title.trim() || 'Untitled'}</span>
    </Link>
  );
}

function DesktopGroupedList({
  grouped,
  pathname,
  onNavigate,
}: {
  grouped: GroupedSection[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {grouped.map((g) => {
        const label = g.section?.name ?? 'Unsorted';
        const key = g.section?.id ?? '__unsorted__';
        return (
          <div key={key} className="flex items-start gap-3 rounded-lg px-1.5 py-1.5">
            <div className="text-muted-foreground w-[110px] shrink-0 pt-1 text-xs font-semibold tracking-wide uppercase">
              {label}
            </div>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {g.pages.length === 0 ? (
                <span className="text-muted-foreground/70 bg-muted/30 rounded-full px-2.5 py-1 text-xs">
                  No pages
                </span>
              ) : (
                g.pages.map((p) => (
                  <PageChip key={p.id} page={p} pathname={pathname} onNavigate={onNavigate} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileGroupedList({
  grouped,
  pathname,
  onNavigate,
}: {
  grouped: GroupedSection[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {grouped.map((g) => {
        const label = g.section?.name ?? 'Unsorted';
        const key = g.section?.id ?? '__unsorted__';
        return (
          <div key={key} className="flex flex-col">
            <div className="text-muted-foreground px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide uppercase">
              {label}
            </div>
            <div className="flex flex-col">
              {g.pages.length === 0 ? (
                <p className="text-muted-foreground/70 px-2.5 py-2 text-xs">No pages</p>
              ) : (
                g.pages.map((p) => {
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
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground/70 hover:bg-accent/60 hover:text-foreground'
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
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
