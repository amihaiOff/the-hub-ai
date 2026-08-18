import { z } from 'zod';

/**
 * A page's body is a Tiptap/ProseMirror JSON document — an arbitrary nested
 * object we don't model field-by-field (the editor owns its shape). We accept
 * any JSON but cap the serialized size so a runaway document can't bloat the
 * row. Images live in Blob storage as URLs, so real documents stay small.
 */
const PAGE_CONTENT_MAX_BYTES = 1_000_000; // ~1 MB of JSON

export const pageContentSchema = z
  .unknown()
  .refine((v) => JSON.stringify(v ?? null).length <= PAGE_CONTENT_MAX_BYTES, {
    message: 'Page content is too large',
  });

/** Emoji label beside the title — a short grapheme string, or null to clear. */
const emojiSchema = z.string().trim().max(20).nullable();

export const createPageSchema = z.object({
  title: z.string().trim().max(200).optional(),
  emoji: emojiSchema.optional(),
  content: pageContentSchema.optional().nullable(),
});
export type CreatePageInput = z.infer<typeof createPageSchema>;

export const updatePageSchema = z.object({
  title: z.string().trim().max(200).optional(),
  emoji: emojiSchema.optional(),
  content: pageContentSchema.optional().nullable(),
  sortOrder: z.number().int().optional(),
  autoCapitalize: z.boolean().optional(),
  sectionId: z.string().min(1).nullable().optional(),
});
export type UpdatePageInput = z.infer<typeof updatePageSchema>;

// ─── Page sections (grouping of pages) ──────────────────────────────────

export const createPageSectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreatePageSectionInput = z.infer<typeof createPageSectionSchema>;

export const updatePageSectionSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdatePageSectionInput = z.infer<typeof updatePageSectionSchema>;

/** A tab within a page — its own title + Tiptap content. */
export const createPageTabSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: pageContentSchema.optional().nullable(),
});
export type CreatePageTabInput = z.infer<typeof createPageTabSchema>;

export const updatePageTabSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: pageContentSchema.optional().nullable(),
  sortOrder: z.number().int().optional(),
});
export type UpdatePageTabInput = z.infer<typeof updatePageTabSchema>;
