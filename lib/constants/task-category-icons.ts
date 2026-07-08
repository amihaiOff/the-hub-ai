import { createElement } from 'react';
import {
  Tag,
  Home,
  Briefcase,
  ShoppingCart,
  Heart,
  DollarSign,
  Car,
  Plane,
  Utensils,
  GraduationCap,
  Dumbbell,
  Gift,
  Wrench,
  Baby,
  PawPrint,
  Music,
  Book,
  Film,
  Gamepad2,
  Coffee,
  Stethoscope,
  PiggyBank,
  CreditCard,
  Building2,
  Users,
  Star,
  Flag,
  Folder,
  Calendar,
  Zap,
  Leaf,
  Sun,
  type LucideIcon,
} from 'lucide-react';

/**
 * Curated set of icons a user can assign to a task category. Categories store
 * the string key (e.g. "home"); the component is resolved via getCategoryIcon.
 */
export const TASK_CATEGORY_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'tag', Icon: Tag },
  { name: 'home', Icon: Home },
  { name: 'briefcase', Icon: Briefcase },
  { name: 'cart', Icon: ShoppingCart },
  { name: 'heart', Icon: Heart },
  { name: 'dollar', Icon: DollarSign },
  { name: 'car', Icon: Car },
  { name: 'plane', Icon: Plane },
  { name: 'utensils', Icon: Utensils },
  { name: 'graduation', Icon: GraduationCap },
  { name: 'dumbbell', Icon: Dumbbell },
  { name: 'gift', Icon: Gift },
  { name: 'wrench', Icon: Wrench },
  { name: 'baby', Icon: Baby },
  { name: 'paw', Icon: PawPrint },
  { name: 'music', Icon: Music },
  { name: 'book', Icon: Book },
  { name: 'film', Icon: Film },
  { name: 'game', Icon: Gamepad2 },
  { name: 'coffee', Icon: Coffee },
  { name: 'health', Icon: Stethoscope },
  { name: 'savings', Icon: PiggyBank },
  { name: 'card', Icon: CreditCard },
  { name: 'building', Icon: Building2 },
  { name: 'users', Icon: Users },
  { name: 'star', Icon: Star },
  { name: 'flag', Icon: Flag },
  { name: 'folder', Icon: Folder },
  { name: 'calendar', Icon: Calendar },
  { name: 'zap', Icon: Zap },
  { name: 'leaf', Icon: Leaf },
  { name: 'sun', Icon: Sun },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  TASK_CATEGORY_ICONS.map(({ name, Icon }) => [name, Icon])
);

/** Fallback icon used when a category has no icon or an unknown key. */
export const DEFAULT_CATEGORY_ICON: LucideIcon = Folder;

/** Resolve a stored icon key to its lucide component (falls back to Folder). */
export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  if (!name) return DEFAULT_CATEGORY_ICON;
  return ICON_MAP[name] ?? DEFAULT_CATEGORY_ICON;
}

/** Renders a category's icon by key. Keeps icon resolution out of render. */
export function CategoryIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  return createElement(getCategoryIcon(name), { className });
}
