'use client';

import { createElement, useEffect, useState } from 'react';
import { Folder, type LucideIcon } from 'lucide-react';

/**
 * Category icons are stored as their lucide PascalCase name (e.g. "ShoppingCart").
 * The full lucide set (~1,600 icons) is large, so we load it lazily on demand
 * (once per session, cached) rather than bundling it into the initial JS.
 */
type IconSet = Record<string, LucideIcon>;

let cache: IconSet | null = null;
let pending: Promise<IconSet> | null = null;

export function loadLucideIcons(): Promise<IconSet> {
  if (cache) return Promise.resolve(cache);
  pending ??= import('lucide-react').then((m) => {
    cache = m.icons as unknown as IconSet;
    return cache;
  });
  return pending;
}

/** Synchronously resolved icon if the set is already loaded, else null. */
function peek(name: string | null | undefined): LucideIcon | null {
  if (!name || !cache) return null;
  return cache[name] ?? null;
}

export const DEFAULT_ICON: LucideIcon = Folder;

/**
 * Renders a category's icon by its lucide name, tinted with the category color.
 * Falls back to a folder while the icon set loads or when the name is unknown.
 */
export function CategoryIcon({
  name,
  color,
  className,
}: {
  name?: string | null;
  color?: string | null;
  className?: string;
}) {
  // Resolve from the cache during render; if the set isn't loaded yet, load it
  // and force one re-render when it arrives (setState only in the async
  // callback, never synchronously inside the effect).
  const [, force] = useState(0);
  useEffect(() => {
    if (!name || peek(name)) return;
    let active = true;
    loadLucideIcons().then(() => {
      if (active) force((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, [name]);

  const resolved = peek(name) ?? DEFAULT_ICON;
  return createElement(resolved, { className, style: color ? { color } : undefined });
}

/** A short list of common icons shown before the user searches. */
export const POPULAR_ICONS: string[] = [
  'Home',
  'Briefcase',
  'ShoppingCart',
  'ShoppingBag',
  'Heart',
  'DollarSign',
  'Wallet',
  'CreditCard',
  'PiggyBank',
  'Landmark',
  'Receipt',
  'Car',
  'Bus',
  'Bike',
  'Plane',
  'Utensils',
  'Coffee',
  'Pizza',
  'Wine',
  'Cake',
  'GraduationCap',
  'Book',
  'Dumbbell',
  'Stethoscope',
  'Pill',
  'Baby',
  'PawPrint',
  'Dog',
  'Cat',
  'Gift',
  'Wrench',
  'Hammer',
  'Music',
  'Film',
  'Gamepad2',
  'Camera',
  'Palette',
  'Rocket',
  'Trophy',
  'Target',
  'Star',
  'Flag',
  'Calendar',
  'Clock',
  'Bell',
  'Zap',
  'Lightbulb',
  'Leaf',
  'TreePine',
  'Sun',
  'Cloud',
  'Umbrella',
  'Key',
  'Lock',
  'Users',
  'Phone',
  'Mail',
  'MapPin',
  'Smartphone',
  'Laptop',
  'Shirt',
  'Building2',
];
