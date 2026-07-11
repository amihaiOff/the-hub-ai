import { createPageSchema, updatePageSchema } from '../pages';

describe('page schemas', () => {
  it('accepts an empty create payload (all fields optional)', () => {
    expect(createPageSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a title, emoji and JSON content', () => {
    const res = createPageSchema.safeParse({
      title: 'Trip plan',
      emoji: '✈️',
      content: { type: 'doc', content: [] },
    });
    expect(res.success).toBe(true);
  });

  it('allows clearing the emoji with null', () => {
    expect(updatePageSchema.safeParse({ emoji: null }).success).toBe(true);
  });

  it('rejects content larger than the size cap', () => {
    const huge = { blob: 'x'.repeat(1_000_001) };
    expect(createPageSchema.safeParse({ content: huge }).success).toBe(false);
  });

  it('rejects an over-long title', () => {
    expect(createPageSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
  });
});
