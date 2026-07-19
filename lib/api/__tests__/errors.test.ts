import { ZodError, z } from 'zod';
import { Prisma } from '@prisma/client';
import { apiErrorResponse } from '@/lib/api/errors';

describe('apiErrorResponse', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  afterAll(() => consoleErrorSpy.mockRestore());

  it('maps ZodError to 400 with the first issue', async () => {
    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: '' });
    if (result.success) throw new Error('expected failure');
    const res = apiErrorResponse(result.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.details).toBeDefined();
  });

  it('maps Prisma P2002 (unique violation) to 409', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '0',
    });
    const res = apiErrorResponse(err);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Already exists');
  });

  it('maps Prisma P2025 (not found) to 404', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: '0',
    });
    const res = apiErrorResponse(err);
    expect(res.status).toBe(404);
  });

  it('maps Prisma P2003 (FK violation) to 400', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: '0',
    });
    const res = apiErrorResponse(err);
    expect(res.status).toBe(400);
  });

  it('falls back to 500 with the given context', async () => {
    const res = apiErrorResponse(new Error('boom'), 'creating pension account');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed while creating pension account');
  });

  it('duck-types plain objects with a P2002 code', async () => {
    const res = apiErrorResponse({ code: 'P2002' });
    expect(res.status).toBe(409);
  });
});
