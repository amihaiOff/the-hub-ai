/**
 * Integration tests for /api/settings/billing-cycle. Covers both
 * handlers (GET reads the household's start day; PUT validates and
 * updates it) plus every guard: unauthenticated, invalid start day,
 * DB failure.
 */

const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
}));

const mockPrisma = {
  household: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';

const ctx = { activeHousehold: { id: 'hh-1' } };

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/settings/billing-cycle', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/settings/billing-cycle', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('returns the stored start day', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.household.findUnique.mockResolvedValue({ billingCycleStartDay: 10 });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.startDay).toBe(10);
  });

  it('defaults to 1 when the household row has no stored value', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.household.findUnique.mockResolvedValue(null);
    const res = await GET();
    const json = await res.json();
    expect(json.data.startDay).toBe(1);
  });
});

describe('PUT /api/settings/billing-cycle', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await PUT(req({ startDay: 10 }));
    expect(res.status).toBe(401);
  });

  it('400 on invalid startDay', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const res = await PUT(req({ startDay: 5 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/startDay/);
  });

  it('400 on missing/wrong-typed startDay', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const res = await PUT(req({}));
    expect(res.status).toBe(400);
  });

  it('updates the household and echoes the new start day', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.household.update.mockResolvedValue({ billingCycleStartDay: 10 });
    const res = await PUT(req({ startDay: 10 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.startDay).toBe(10);
    expect(mockPrisma.household.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'hh-1' }, data: { billingCycleStartDay: 10 } })
    );
  });

  it('500 when the DB update throws', async () => {
    // Silence the console.error the route emits when it catches the DB failure.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.household.update.mockRejectedValue(new Error('boom'));
    const res = await PUT(req({ startDay: 2 }));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
