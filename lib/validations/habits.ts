import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const habitFields = {
  title: z.string().trim().min(1, 'Title is required').max(120),
  icon: z.string().max(64).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .optional(),
  notify: z.boolean(),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Pick at least one day')
    .max(7)
    .transform((d) => [...new Set(d)].sort()),
  timeMinutes: z
    .number()
    .int()
    .min(0)
    .max(1425)
    .refine((m) => m % 15 === 0, 'Time must be in 15-minute steps'),
  intervalWeeks: z.number().int().min(1).max(4),
};

export const createHabitSchema = z.object(habitFields);

export const updateHabitSchema = z
  .object({ ...habitFields, archived: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const reorderHabitsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const setHabitLogSchema = z.object({
  date: ymd,
  status: z.enum(['DONE', 'NOT_DONE']).nullable(),
});

export const habitLogsQuerySchema = z
  .object({ from: ymd, to: ymd })
  .refine((v) => v.from <= v.to, 'from must be before to')
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 62 * 86_400_000, 'Range too long');

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
