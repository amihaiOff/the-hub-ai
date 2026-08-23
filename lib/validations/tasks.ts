import { z } from 'zod';
import { nonEmptyString } from './common';

/** Enum values kept aligned with prisma/schema.prisma. */
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/**
 * Work-mode of a task — the context it needs rather than its urgency.
 * Order here is the order the pickers render in. Optional on a task: no
 * type is a valid state, so every schema below allows `null`.
 */
export const TASK_TYPES = [
  'CALLS',
  'DEEP_WORK',
  'OUT_AND_ABOUT',
  'BLOCKED',
  'DECIDE',
  'QUICK',
] as const;

/**
 * Status is a free-text label (e.g. "In review"). Completion is tracked
 * separately by the `done` boolean, so status carries no special meaning.
 */
export const taskStatusSchema = z.string().trim().max(80);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const taskTypeSchema = z.enum(TASK_TYPES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskType = z.infer<typeof taskTypeSchema>;

/**
 * customFields is a small user-defined JSON bag rendered only in the detail
 * panel. Capped at 20 entries to keep the row size sane and to make sure
 * the UI never explodes into hundreds of columns.
 */
export const CUSTOM_FIELDS_MAX = 20;

export const customFieldSchema = z.object({
  id: nonEmptyString('custom field id'),
  name: z.string().trim().min(1, 'Field name is required').max(80),
  type: z.enum(['text', 'number', 'date', 'checkbox', 'select']),
  // Value is user-provided and can be any of the primitive types the
  // renderer supports. We validate the outer shape and let the UI enforce
  // per-type constraints since the JSON blob doesn't drive DB queries.
  value: z.unknown(),
  options: z.array(z.string()).optional(),
});

export const customFieldsSchema = z.array(customFieldSchema).max(CUSTOM_FIELDS_MAX);

/**
 * Payload for POST /api/tasks. Only `title` is required. Everything else has
 * a server-side default (via Prisma) or is optional.
 */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  notes: z.string().max(20_000).optional().nullable(),
  status: taskStatusSchema.optional(),
  done: z.boolean().optional(),
  priority: taskPrioritySchema.optional(),
  type: taskTypeSchema.optional().nullable(),
  dueDate: z.string().datetime({ offset: true }).optional().nullable(),
  categoryId: z.string().cuid().optional().nullable(),
  assigneeId: z.string().cuid().optional().nullable(),
  parentTaskId: z.string().cuid().optional().nullable(),
  tagIds: z.array(z.string().cuid()).max(50).optional(),
  customFields: customFieldsSchema.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Payload for PATCH /api/tasks/[id]. Every field optional — the inline-edit
 * cells fire one-field patches, so partial payloads are the norm.
 * `.partial()` on the create schema would work but we spell it out because
 * PATCH also allows nulling optional foreign keys, which zod's `.partial()`
 * doesn't distinguish from "field absent".
 */
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').max(200).optional(),
  notes: z.string().max(20_000).optional().nullable(),
  status: taskStatusSchema.optional(),
  done: z.boolean().optional(),
  priority: taskPrioritySchema.optional(),
  type: taskTypeSchema.nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  sortOrder: z.number().int().optional(),
  categoryId: z.string().cuid().nullable().optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  parentTaskId: z.string().cuid().nullable().optional(),
  tagIds: z.array(z.string().cuid()).max(50).optional(),
  customFields: customFieldsSchema.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Payload for POST /api/tasks/[id]/reorder — Board drag. */
export const reorderTaskSchema = z.object({
  status: taskStatusSchema,
  sortOrder: z.number().int(),
});
export type ReorderTaskInput = z.infer<typeof reorderTaskSchema>;

/** Payload for POST /api/tasks/[id]/shares. */
export const shareTaskSchema = z.object({
  userId: z.string().cuid(),
  canEdit: z.boolean().optional(),
});
export type ShareTaskInput = z.infer<typeof shareTaskSchema>;

/** Payload for PATCH /api/tasks/[id]/shares/[shareId]. */
export const updateShareSchema = z.object({
  canEdit: z.boolean(),
});

/** TaskCategory + TaskTag CRUD schemas. Both are household-scoped. */
export const createTaskCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  color: z.string().max(20).optional().nullable(),
  // Any short string is accepted so new icon keys can ship without a
  // validation deploy; unknown keys fall back to a default icon at render.
  icon: z.string().max(40).optional().nullable(),
  sortOrder: z.number().int().optional(),
});
export const updateTaskCategorySchema = createTaskCategorySchema.partial();

export const reorderTaskCategoriesSchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.string().min(1, 'Category ID is required'),
        sortOrder: z.number().int(),
      })
    )
    .min(1)
    .max(500),
});

export const createTaskTagSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  color: z.string().max(20).optional().nullable(),
});
export const updateTaskTagSchema = createTaskTagSchema.partial();

/** Filters accepted by GET /api/tasks. */
export const taskFiltersSchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  type: taskTypeSchema.optional(),
  categoryId: z.string().cuid().optional(),
  assigneeId: z.string().cuid().optional(),
  tagId: z.string().cuid().optional(),
  parentTaskId: z.string().cuid().or(z.literal('null')).optional(),
  search: z.string().trim().max(200).optional(),
});
export type TaskFilters = z.infer<typeof taskFiltersSchema>;
