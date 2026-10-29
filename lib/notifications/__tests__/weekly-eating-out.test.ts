/**
 * Unit tests for the Saturday-evening eating-out push: Israel-time scheduling
 * (DST-aware), Sunday–Saturday week bounds, and the per-household send.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    generalLog: { findFirst: jest.fn(), create: jest.fn() },
    budgetCategory: { findMany: jest.fn() },
    budgetTransaction: { groupBy: jest.fn() },
  },
}));

jest.mock('../push', () => ({
  sendPushToHousehold: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { sendPushToHousehold } from '../push';
import { isSendTime, israelNow, sendWeeklyEatingOut, weekOf } from '../weekly-eating-out';

const mockPrisma = prisma as unknown as {
  generalLog: { findFirst: jest.Mock; create: jest.Mock };
  budgetCategory: { findMany: jest.Mock };
  budgetTransaction: { groupBy: jest.Mock };
};
const mockSend = sendPushToHousehold as jest.MockedFunction<typeof sendPushToHousehold>;

// Saturday 2026-10-24, 20:30 Israel (summer time, UTC+3).
const SAT_SUMMER = new Date('2026-10-24T17:30:00Z');

describe('israelNow / isSendTime', () => {
  it('Saturday 20:30 Israel in summer time (UTC+3) is send time', () => {
    expect(israelNow(SAT_SUMMER)).toEqual({ date: '2026-10-24', weekday: 6, hour: 20 });
    expect(isSendTime(SAT_SUMMER)).toBe(true);
  });

  it('Saturday 21:30 Israel in summer time is not send time', () => {
    const now = new Date('2026-10-24T18:30:00Z');
    expect(israelNow(now).hour).toBe(21);
    expect(isSendTime(now)).toBe(false);
  });

  it('Saturday 20:30 Israel in winter time (UTC+2) is send time', () => {
    const now = new Date('2026-11-28T18:30:00Z');
    expect(israelNow(now)).toEqual({ date: '2026-11-28', weekday: 6, hour: 20 });
    expect(isSendTime(now)).toBe(true);
  });

  it('Saturday 19:30 Israel in winter time is not send time', () => {
    const now = new Date('2026-11-28T17:30:00Z');
    expect(israelNow(now).hour).toBe(19);
    expect(isSendTime(now)).toBe(false);
  });

  it('Friday 20:30 Israel is not send time', () => {
    const now = new Date('2026-10-23T17:30:00Z');
    expect(israelNow(now)).toEqual({ date: '2026-10-23', weekday: 5, hour: 20 });
    expect(isSendTime(now)).toBe(false);
  });

  it('uses the Israel calendar date, not the UTC date, near midnight', () => {
    // 2026-10-24T22:30Z is already Sunday 01:30 in Israel.
    expect(israelNow(new Date('2026-10-24T22:30:00Z'))).toEqual({
      date: '2026-10-25',
      weekday: 0,
      hour: 1,
    });
  });
});

describe('weekOf', () => {
  it('maps a Saturday to its Sunday–Saturday week', () => {
    expect(weekOf('2026-10-24', 6)).toEqual({ start: '2026-10-18', end: '2026-10-24' });
  });

  it('maps a Sunday to the week it starts', () => {
    expect(weekOf('2026-10-18', 0)).toEqual({ start: '2026-10-18', end: '2026-10-24' });
  });

  it('crosses month and year boundaries', () => {
    expect(weekOf('2027-01-01', 5)).toEqual({ start: '2026-12-27', end: '2027-01-02' });
  });
});

describe('sendWeeklyEatingOut', () => {
  const categories = [
    { id: 'cat-wolt', name: 'Wolt' },
    { id: 'cat-rest', name: 'Restaurant' },
  ];

  function expectedWhere(from: string, to: string) {
    return {
      by: ['categoryId'],
      where: {
        householdId: 'hh-1',
        type: 'expense',
        categoryId: { in: ['cat-wolt', 'cat-rest'] },
        transactionDate: { gte: new Date(from), lte: new Date(to) },
        isDeleted: false,
        isSplit: false,
        excludedFromFlow: false,
        OR: [{ payeeId: null }, { payee: { isBlacklisted: false } }],
      },
      _sum: { amountIls: true },
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.generalLog.findFirst.mockResolvedValue(null);
    mockPrisma.generalLog.create.mockResolvedValue({});
    mockPrisma.budgetCategory.findMany.mockResolvedValue(categories);
    mockSend.mockResolvedValue(1);
  });

  it('skips when this week was already sent', async () => {
    mockPrisma.generalLog.findFirst.mockResolvedValue({ id: 'log-1' });

    await expect(sendWeeklyEatingOut('hh-1', SAT_SUMMER)).resolves.toBe(false);
    expect(mockPrisma.generalLog.findFirst).toHaveBeenCalledWith({
      where: { householdId: 'hh-1', type: 'weekly_eating_out', subjectId: '2026-10-18' },
      select: { id: true },
    });
    expect(mockPrisma.budgetTransaction.groupBy).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPrisma.generalLog.create).not.toHaveBeenCalled();
  });

  it('skips when the household has no Wolt/Restaurant categories', async () => {
    mockPrisma.budgetCategory.findMany.mockResolvedValue([]);

    await expect(sendWeeklyEatingOut('hh-1', SAT_SUMMER)).resolves.toBe(false);
    expect(mockPrisma.budgetCategory.findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'hh-1',
        name: { in: ['Wolt', 'Restaurant'], mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    expect(mockPrisma.budgetTransaction.groupBy).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPrisma.generalLog.create).not.toHaveBeenCalled();
  });

  it('sends the weekly total with a per-category breakdown and logs it', async () => {
    mockPrisma.budgetTransaction.groupBy.mockImplementation(
      async (args: { where: { transactionDate: { gte: Date } } }) =>
        args.where.transactionDate.gte.toISOString().startsWith('2026-10-18')
          ? [
              { categoryId: 'cat-wolt', _sum: { amountIls: '250.50' } },
              { categoryId: 'cat-rest', _sum: { amountIls: '400' } },
            ]
          : [
              { categoryId: 'cat-wolt', _sum: { amountIls: '100' } },
              // A category with no spend can come back with a null sum.
              { categoryId: 'cat-rest', _sum: { amountIls: null } },
            ]
    );

    await expect(sendWeeklyEatingOut('hh-1', SAT_SUMMER)).resolves.toBe(true);

    // This week (Sun 18 – Sat 24) and last week (Sun 11 – Sat 17).
    expect(mockPrisma.budgetTransaction.groupBy).toHaveBeenCalledTimes(2);
    expect(mockPrisma.budgetTransaction.groupBy).toHaveBeenCalledWith(
      expectedWhere('2026-10-18', '2026-10-24')
    );
    expect(mockPrisma.budgetTransaction.groupBy).toHaveBeenCalledWith(
      expectedWhere('2026-10-11', '2026-10-17')
    );

    const title = `Eating out this week: ${formatCurrencyILS(650.5)}`;
    const body =
      `Wolt ${formatCurrencyILS(250.5)} · Restaurant ${formatCurrencyILS(400)}. ` +
      `Last week ${formatCurrencyILS(100)}.`;
    expect(mockSend).toHaveBeenCalledWith('hh-1', {
      title,
      body,
      url: '/budget/transactions',
      tag: 'weekly-eating-out',
    });

    expect(mockPrisma.generalLog.create).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.generalLog.create.mock.calls[0][0];
    expect(data).toEqual({
      householdId: 'hh-1',
      type: 'weekly_eating_out',
      subjectType: 'weekly_summary',
      subjectId: '2026-10-18',
      description: expect.stringContaining(title),
      readAt: expect.any(Date),
    });
    expect(data.description).toContain('2026-10-18');
    expect(data.description).toContain('2026-10-24');

    // The log entry is the once-a-week guard, so it must be written before sending.
    expect(mockPrisma.generalLog.create.mock.invocationCallOrder[0]).toBeLessThan(
      mockSend.mock.invocationCallOrder[0]
    );
  });

  it('does not send when recording the weekly entry fails', async () => {
    mockPrisma.budgetTransaction.groupBy.mockResolvedValue([]);
    mockPrisma.generalLog.create.mockRejectedValue(new Error('db down'));

    await expect(sendWeeklyEatingOut('hh-1', SAT_SUMMER)).rejects.toThrow('db down');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('reports zero for categories with no transactions this week', async () => {
    mockPrisma.budgetTransaction.groupBy.mockResolvedValue([]);

    await expect(sendWeeklyEatingOut('hh-1', SAT_SUMMER)).resolves.toBe(true);
    const msg = mockSend.mock.calls[0][1];
    expect(msg.title).toBe(`Eating out this week: ${formatCurrencyILS(0)}`);
    expect(msg.body).toBe(
      `Wolt ${formatCurrencyILS(0)} · Restaurant ${formatCurrencyILS(0)}. ` +
        `Last week ${formatCurrencyILS(0)}.`
    );
  });

  it('uses the Israel-local week in winter time too', async () => {
    mockPrisma.budgetTransaction.groupBy.mockResolvedValue([]);

    await sendWeeklyEatingOut('hh-1', new Date('2026-11-28T18:30:00Z'));
    expect(mockPrisma.budgetTransaction.groupBy).toHaveBeenCalledWith(
      expectedWhere('2026-11-22', '2026-11-28')
    );
    expect(mockPrisma.budgetTransaction.groupBy).toHaveBeenCalledWith(
      expectedWhere('2026-11-15', '2026-11-21')
    );
    expect(mockPrisma.generalLog.create.mock.calls[0][0].data.subjectId).toBe('2026-11-22');
  });
});
