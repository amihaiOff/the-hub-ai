/**
 * Coverage-lift tests for /api/labs/dropped-transactions.
 *
 * Route is small — just needs the happy-path serialisation exercised.
 */

jest.mock('@/lib/auth-utils', () => ({ getCurrentContext: jest.fn() }));
jest.mock('@/lib/db', () => ({
  prisma: { moneytorDropLog: { findMany: jest.fn() } },
}));

import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { GET } from '../route';

const mockContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockFindMany = prisma.moneytorDropLog.findMany as jest.Mock;

const contextStub = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
  profile: { id: 'p1', name: 'Test', image: null, color: null, userId: 'user-1' },
  households: [{ id: 'h1', name: 'H', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'h1', name: 'H', description: null, role: 'owner' as const },
  householdProfiles: [
    { id: 'p1', name: 'Test', image: null, color: null, role: 'owner' as const, hasUser: true },
  ],
};

describe('GET /api/labs/dropped-transactions', () => {
  beforeEach(() => {
    mockContext.mockReset();
    mockFindMany.mockReset();
  });

  it('401 when unauthenticated', async () => {
    mockContext.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('serialises drop-log rows to ISO date strings and numbers', async () => {
    mockContext.mockResolvedValueOnce(contextStub);
    const droppedAt = new Date('2026-07-19T12:00:00.000Z');
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'd1',
        transactionDate: new Date('2026-07-01T00:00:00.000Z'),
        amountIls: '42.50', // Decimal serialises via `Number`
        payeeName: 'Cafe',
        description: 'expresso',
        reason: 'missing_upstream',
        droppedAt,
        originalMoneytorId: 'm1',
      },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].transactionDate).toBe('2026-07-01');
    expect(body.data[0].amountIls).toBe(42.5);
    expect(body.data[0].droppedAt).toBe(droppedAt.toISOString());
  });

  it('returns an empty array when no drops recorded', async () => {
    mockContext.mockResolvedValueOnce(contextStub);
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET();
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
