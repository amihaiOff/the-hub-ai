'use client';

interface ChartSkeletonProps {
  /** Height of the placeholder — number (px) or any CSS length. Defaults to 240px. */
  height?: number | string;
}

/**
 * Pulsing placeholder shown while a lazy-loaded chart's JS bundle
 * (Recharts) streams in. Sized to roughly match the real chart so the
 * page shell paints without layout shift.
 */
export function ChartSkeleton({ height = 240 }: ChartSkeletonProps) {
  return (
    <div
      className="bg-muted/40 w-full animate-pulse rounded-2xl"
      style={{ height }}
      aria-busy="true"
    />
  );
}
