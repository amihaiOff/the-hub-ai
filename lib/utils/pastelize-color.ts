/**
 * Maps legacy saturated hex colors (previously used across profile pickers,
 * task categories, etc.) to their pastel equivalents. Existing rows in the
 * DB keep their original hex; this rewrite happens at render time so the
 * whole app shows the pastel palette without a data migration.
 */
const LEGACY_TO_PASTEL: Record<string, string> = {
  '#6ab2ff': '#a8caff',
  '#3b82f6': '#8fb4f5',
  '#22c55e': '#8fddb0',
  '#10b981': '#8fd9b6',
  '#f59e0b': '#f5cd85',
  '#a78bfa': '#c9b8f7',
  '#ef4444': '#f5a5a5',
  '#8b5cf6': '#c9b8f7',
  '#ec4899': '#f5b3d4',
  '#06b6d4': '#a3dee8',
  '#f97316': '#f5c8a3',
};

export function pastelizeColor(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  return LEGACY_TO_PASTEL[color.toLowerCase()] ?? color;
}
