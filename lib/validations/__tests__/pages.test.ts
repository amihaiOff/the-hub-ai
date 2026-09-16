import { createPageSchema, updatePageSchema, sharePageSchema } from '../pages';

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

  it('accepts content right at the size cap boundary', () => {
    // Solve for the exact payload length that serializes to precisely 1,000,000
    // chars, rather than hardcoding the JSON overhead (avoids an off-by-one).
    const overhead = JSON.stringify({ blob: '' }).length;
    const atCap = { blob: 'x'.repeat(1_000_000 - overhead) };
    expect(JSON.stringify(atCap).length).toBe(1_000_000);
    expect(createPageSchema.safeParse({ content: atCap }).success).toBe(true);

    const overCap = { blob: 'x'.repeat(1_000_000 - overhead + 1) };
    expect(JSON.stringify(overCap).length).toBe(1_000_001);
    expect(createPageSchema.safeParse({ content: overCap }).success).toBe(false);
  });

  it('rejects an over-long title', () => {
    expect(createPageSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('sharePageSchema', () => {
  it('accepts view and edit access', () => {
    expect(sharePageSchema.safeParse({ access: 'view' }).success).toBe(true);
    expect(sharePageSchema.safeParse({ access: 'edit' }).success).toBe(true);
  });

  it('rejects any access value other than view/edit', () => {
    expect(sharePageSchema.safeParse({ access: 'admin' }).success).toBe(false);
    expect(sharePageSchema.safeParse({ access: 'edit ' }).success).toBe(false); // trailing space
    expect(sharePageSchema.safeParse({ access: 'VIEW' }).success).toBe(false); // case-sensitive
    expect(sharePageSchema.safeParse({ access: '' }).success).toBe(false);
    expect(sharePageSchema.safeParse({ access: null }).success).toBe(false);
  });

  it('rejects a missing access field', () => {
    expect(sharePageSchema.safeParse({}).success).toBe(false);
    expect(sharePageSchema.safeParse({ regenerate: true }).success).toBe(false);
  });

  it('defaults regenerate to undefined (falsy) when omitted', () => {
    const parsed = sharePageSchema.safeParse({ access: 'view' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.regenerate).toBeUndefined();
    }
  });

  it('rejects a non-boolean regenerate value', () => {
    expect(sharePageSchema.safeParse({ access: 'view', regenerate: 'true' }).success).toBe(false);
    expect(sharePageSchema.safeParse({ access: 'view', regenerate: 1 }).success).toBe(false);
  });

  it('ignores unknown extra fields rather than erroring (default zod object behavior)', () => {
    const parsed = sharePageSchema.safeParse({ access: 'view', evil: 'payload' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).evil).toBeUndefined();
    }
  });
});
