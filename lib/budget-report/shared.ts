import { z } from 'zod';

/** Shared by server and client (no server-only imports). */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM');

/** Agent runs (≤300s each) a report may take before it must submit. */
export const MAX_RUNS = 4;
