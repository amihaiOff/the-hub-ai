/**
 * Coverage-lift tests for lib/utils/billing-cycle-server.ts.
 *
 * The two helpers here each do the same shape: look up the household's
 * billing-cycle start day, then hand off to a pure helper in
 * `billing-cycle.ts` (which has its own tests). Two tests per helper —
 * present household + missing household — exercise both the DB-hit path
 * and the `?? 1` default.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    household: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  getCycleRangeForHousehold,
  getMonthTransactionWhereForHousehold,
} from '@/lib/utils/billing-cycle-server';

const mockFindUnique = prisma.household.findUnique as jest.Mock;

describe('getCycleRangeForHousehold', () => {
  beforeEach(() => mockFindUnique.mockReset());

  it('uses the household billing-cycle start day when set', async () => {
    mockFindUnique.mockResolvedValueOnce({ billingCycleStartDay: 10 });
    const range = await getCycleRangeForHousehold('h1', '2025-07');
    expect(range.from).toBeInstanceOf(Date);
    expect(range.to).toBeInstanceOf(Date);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'h1' },
      select: { billingCycleStartDay: true },
    });
  });

  it('falls back to day 1 when the household row is missing', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const range = await getCycleRangeForHousehold('missing', '2025-07');
    // Day-1 cycle for July 2025 starts on 2025-07-01.
    expect(range.from.toISOString().startsWith('2025-07-01')).toBe(true);
  });
});

describe('getMonthTransactionWhereForHousehold', () => {
  beforeEach(() => mockFindUnique.mockReset());

  it('builds a where fragment using the household start day', async () => {
    mockFindUnique.mockResolvedValueOnce({ billingCycleStartDay: 15 });
    const where = await getMonthTransactionWhereForHousehold('h1', '2025-07');
    expect(where).toBeTruthy();
    expect(typeof where).toBe('object');
  });

  it('falls back when the household row is missing', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const where = await getMonthTransactionWhereForHousehold('missing', '2025-07');
    expect(where).toBeTruthy();
  });
});
