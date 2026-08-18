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
          // Mobile: push the popup LEFT so it overlaps ~half the sidebar
          // Sheet (w-72 = 288px). Radix's default collision avoidance
          // was cancelling the negative offset and pinning the popup at
          // the trigger's right edge; `avoidCollisions={false}` lets
          // the offset stick. Popup width is capped tightly so it
          // still fits inside the viewport without a right-edge cut.
          sideOffset={isMobile ? -144 : 8}
          collisionPadding={12}
          avoidCollisions={!isMobile}
          className={cn(
            'relative rounded-2xl border p-1 shadow-xl',
            // Desktop: width sizes to content — the inner grid uses a
            // fixed column count matching the actual section count
            // (capped at 3), so `w-max` produces a snug popup with no
            // empty columns when there are only 1–2 sections. The
            // earlier `auto-fit` recipe collapsed to a single column
            // under `w-max`. Mobile: 70vw fits after the LEFT shift.
            isMobile ? 'w-[70vw]' : 'w-max max-w-[92vw]'
          )}
        >
          {/* Top-right gear — anchored above the content so it stays
              consistently placed at any popup width. */}
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            aria-label="Manage sections"
            title="Manage sections"
            className="text-muted-foreground hover:bg-accent/60 hover:text-foreground absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg transition-all"
          >
            <Settings className="h-4 w-4" />
          </button>
          <div className="max-h-[60vh] overflow-y-auto p-1 pt-8">
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

function DesktopGroupedList({
  grouped,
  pathname,
  onNavigate,
}: {
  grouped: GroupedSection[];
  pathname: string;
  onNavigate: () => void;
}) {
  // Section grid: label on top, pages listed vertically below. Column
  // count = min(3, groupCount) so the popup width tracks the actual
  // section count (no empty columns) up to a cap of 3 per row. Extra
  // sections wrap onto a second row. Each column has a fixed 180px
  // width so the popup's `w-max` produces a snug intrinsic size.
  const cols = Math.min(3, Math.max(1, grouped.length));
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 180px)` }}>
      {grouped.map((g) => {
        const label = g.section?.name ?? 'Unsorted';
        const key = g.section?.id ?? '__unsorted__';
        return (
          <div key={key} className="flex min-w-[180px] flex-col gap-1 rounded-lg px-1.5 py-1.5">
            {/* Section label. Dropped `uppercase` because it silently no-ops
                on Hebrew/RTL scripts while making Latin labels visually
                bulkier — the two ended up looking like different sizes
                side-by-side. `dir="auto"` keeps mixed labels aligned to
                their content's natural direction. */}
            <div
              dir="auto"
              className="text-muted-foreground px-1 pb-1 text-[13px] font-semibold tracking-wide"
            >
              {label}
            </div>
            {g.pages.length === 0 ? (
              <span className="text-muted-foreground/70 px-2 py-1 text-xs italic">No pages</span>
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
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all',
                      active
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground'
                    )}
                  >
                    {p.emoji ? (
                      <span className="w-4 text-center text-sm leading-none">{p.emoji}</span>
                    ) : (
                      <FileText className="h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{p.title.trim() || 'Untitled'}</span>
                  </Link>
                );
              })
            )}
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
            <div
              dir="auto"
              className="text-muted-foreground px-2 pt-1 pb-1 text-[13px] font-semibold tracking-wide"
            >
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
