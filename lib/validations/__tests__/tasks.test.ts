import {
  createTaskSchema,
  updateTaskSchema,
  customFieldsSchema,
  taskFiltersSchema,
} from '../tasks';

describe('createTaskSchema', () => {
  it('requires a non-empty title', () => {
    expect(createTaskSchema.safeParse({}).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'Buy milk' }).success).toBe(true);
  });

  it('accepts enum values for status/priority', () => {
    const ok = createTaskSchema.safeParse({
      title: 'x',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects unknown enum values', () => {
    const bad = createTaskSchema.safeParse({ title: 'x', status: 'PARKED' });
    expect(bad.success).toBe(false);
  });

  it('accepts an ISO datetime for dueDate', () => {
    const ok = createTaskSchema.safeParse({ title: 'x', dueDate: '2026-07-10T00:00:00Z' });
    expect(ok.success).toBe(true);
  });
});

describe('updateTaskSchema', () => {
  it('accepts an empty partial patch', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(true);
  });

  it('allows explicitly nulling optional foreign keys', () => {
    const ok = updateTaskSchema.safeParse({
      categoryId: null,
      assigneeId: null,
      parentTaskId: null,
      dueDate: null,
    });
    expect(ok.success).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(updateTaskSchema.safeParse({ title: '' }).success).toBe(false);
  });
});

describe('customFieldsSchema', () => {
  it('accepts an empty array', () => {
    expect(customFieldsSchema.safeParse([]).success).toBe(true);
  });

  it('caps at 20 entries', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      id: `f${i}`,
      name: `Field ${i}`,
      type: 'text' as const,
      value: 'x',
    }));
    expect(customFieldsSchema.safeParse(many).success).toBe(false);
  });

  it('rejects unknown field types', () => {
    const bad = customFieldsSchema.safeParse([{ id: 'a', name: 'X', type: 'rating', value: 5 }]);
    expect(bad.success).toBe(false);
  });

  it('accepts each supported type', () => {
    const types = ['text', 'number', 'date', 'checkbox', 'select'] as const;
    const rows = types.map((t, i) => ({ id: `f${i}`, name: `F${i}`, type: t, value: null }));
    expect(customFieldsSchema.safeParse(rows).success).toBe(true);
  });
});

describe('taskFiltersSchema', () => {
  it('accepts "null" as a literal parentTaskId filter (top-level tasks)', () => {
    expect(taskFiltersSchema.safeParse({ parentTaskId: 'null' }).success).toBe(true);
  });

  it('accepts a cuid for parentTaskId', () => {
    expect(taskFiltersSchema.safeParse({ parentTaskId: 'clv0abcde12345678901234' }).success).toBe(
      true
    );
  });
});
