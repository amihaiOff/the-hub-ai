'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { defaultTitleForPath, isKnownRoutePath } from '@/lib/utils/page-titles';
import type { FavoriteRow as FavoriteRowData } from '@/lib/hooks/use-favorites';
import type { PageListRow } from '@/lib/hooks/use-pages';

/**
 * Resolve a favourite's display label.
 *
 * Page titles come from the live pages cache first, falling back to the title
 * the API embedded. That ordering is deliberate: `useUpdatePage` already writes
 * renames optimistically into `pageKeys.list()`, so reading from there makes a
 * rename appear in the drawer instantly with no extra invalidation. Trusting
 * the API's embedded copy would turn every page rename into a stale-favourite.
 */
export function favoriteLabel(favorite: FavoriteRowData, pages: PageListRow[]): string {
  if (favorite.kind === 'page') {
    const live = pages.find((p) => p.id === favorite.pageId);
    return live?.title || favorite.pageTitle || 'Untitled';
  }
  return favorite.route ? defaultTitleForPath(favorite.route) : 'Unknown';
}

/**
 * Resolve a favourite's emoji, mirroring `favoriteLabel`: prefer the live
 * pages cache so an emoji added/changed/removed after the page was favourited
 * shows up here exactly as it does in the left drawer (both read the same
 * cache, which `useUpdatePage` keeps current). The favourite's embedded copy
 * is only a fallback for when the page isn't in the cache yet. When the page
 * IS in the cache, trust its value even if null — that means the emoji was
 * removed, so the row should fall back to the generic icon, not a stale glyph.
 */
export function favoriteEmoji(
  favorite: FavoriteRowData,
  pages: PageListRow[]
): string | null {
  if (favorite.kind !== 'page') return null;
  const live = pages.find((p) => p.id === favorite.pageId);
  if (live) return live.emoji;
  return favorite.pageEmoji ?? null;
}

interface FavoriteRowProps {
  favorite: FavoriteRowData;
  pages: PageListRow[];
  onNavigate: () => void;
  onRemove: (id: string) => void;
}

export function FavoriteRow({ favorite, pages, onNavigate, onRemove }: FavoriteRowProps) {
  const pathname = usePathname();
  const label = favoriteLabel(favorite, pages);

  const href = favorite.kind === 'page' ? `/areas/${favorite.pageId}` : (favorite.route ?? '/');

  // A route favourite whose path is no longer nav-registered. Writes are
  // validated, so this can only happen after a code change removed the route —
  // show it as dead and let the user clear it. Never auto-delete something they
  // deliberately pinned.
  const isDead = favorite.kind === 'route' && !!favorite.route && !isKnownRoutePath(favorite.route);

  if (isDead) {
    return (
      <div
        aria-disabled="true"
        className="text-muted-foreground flex h-11 items-center gap-3 rounded-lg px-3 opacity-50"
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm line-through">{label}</span>
        <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs">
          Removed
        </span>
        <button
          type="button"
          onClick={() => onRemove(favorite.id)}
          aria-label={`Remove ${label} from favorites`}
          className="hover:text-destructive flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const isActive = pathname === href;
  const emoji = favoriteEmoji(favorite, pages);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
        isActive
          ? 'bg-secondary text-foreground font-medium'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
      )}
    >
      {emoji ? (
        <span className="w-4 shrink-0 text-center leading-none">{emoji}</span>
      ) : (
        <FileText className="h-4 w-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}
