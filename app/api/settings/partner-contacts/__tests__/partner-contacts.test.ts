/**
 * Coverage-lift tests for /api/settings/partner-contacts.
 *
 * Exercises the GET happy path, POST success, POST 400 (Zod), POST 409
 * (Prisma P2002 unique-violation), and POST 500 (unknown error).
 */

jest.mock('@/lib/auth-utils', () => ({ getCurrentContext: jest.fn() }));
jest.mock('@/lib/db', () => ({
  prisma: {
    partnerContact: { findMany: jest.fn(), create: jest.fn() },
  },
}));

import { NextRequest } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { GET, POST } from '../route';

const mockContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockFindMany = prisma.partnerContact.findMany as jest.Mock;
const mockCreate = prisma.partnerContact.create as jest.Mock;

const contextStub = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
  profile: { id: 'p1', name: 'Test', image: null, color: null, userId: 'user-1' },
  households: [{ id: 'h1', name: 'H', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'h1', name: 'H', description: null, role: 'owner' as const },
  householdProfiles: [
    { id: 'p1', name: 'Test', image: null, color: null, role: 'owner' as const, hasUser: true },
  ],
};

function reqWithBody(body: unknown) {
  return new NextRequest('http://localhost:3000/api/settings/partner-contacts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/settings/partner-contacts', () => {
  beforeEach(() => {
    mockContext.mockReset();
    mockFindMany.mockReset();
  });

  it('401 without auth', async () => {
    mockContext.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns the household contacts', async () => {
    mockContext.mockResolvedValueOnce(contextStub);
    mockFindMany.mockResolvedValueOnce([
      { id: 'c1', name: 'Alice', phone: '+972501234567', createdAt: new Date() },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { householdId: 'h1' } })
    );
  });
});

describe('POST /api/settings/partner-contacts', () => {
  beforeEach(() => {
    mockContext.mockReset();
    mockCreate.mockReset();
  });

  it('401 without auth', async () => {
    mockContext.mockResolvedValueOnce(null);
    const res = await POST(reqWithBody({ name: 'A', phone: '+972501234567' }));
    expect(res.status).toBe(401);
  });

  it('400 on Zod validation failure (missing name)', async () => {
    mockContext.mockResolvedValueOnce(contextStub);
    const res = await POST(reqWithBody({ name: '', phone: '+972501234567' }));
    expect(res.status).toBe(400);
  });

  it('400 on Zod validation failure (bad phone format)', async () => {
    mockContext.mockResolvedValueOnce(contextStub);
    const res = await POST(reqWithBody({ name: 'A', phone: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('201 on success', async () => {
    mockContext.mockResolvedValueOnce(contextStub);
    mockCreate.mockResolvedValueOnce({
      id: 'c1',
      name: 'Alice',
      phone: '+972501234567',
      createdAt: new Date(),
    });
    const res = await POST(reqWithBody({ name: 'Alice', phone: '+972501234567' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe('c1');
  });

  it('409 on Prisma P2002 unique violation', async () => {
    mockContext.mockResolvedValueOnce(contextStub);
    mockCreate.mockRejectedValueOnce({ code: 'P2002' });
    const res = await POST(reqWithBody({ name: 'Alice', phone: '+972501234567' }));
    expect(res.status).toBe(409);
  });

  it('500 on any other error', async () => {
    // silence console.error for this expected-error test
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockContext.mockResolvedValueOnce(contextStub);
    mockCreate.mockRejectedValueOnce(new Error('db down'));
    const res = await POST(reqWithBody({ name: 'Alice', phone: '+972501234567' }));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
