const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
}));

const mockPrisma = {
  moneytorAccount: { findMany: jest.fn(), updateMany: jest.fn() },
  moneytorPensionFund: { findMany: jest.fn(), updateMany: jest.fn() },
  moneytorRealEstate: { findMany: jest.fn(), updateMany: jest.fn() },
};

jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { PATCH } from '../[kind]/[id]/route';

const ctx = { activeHousehold: { id: 'hh-1' } };

function patchReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/settings/sync-aliases/account/id', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function params(kind: string, id: string) {
  return { params: Promise.resolve({ kind, id }) };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('GET /api/settings/sync-aliases', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns accounts / pensions / real estate with subtitles', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorAccount.findMany.mockResolvedValue([
      {
        id: 'a1',
        productId: 'p1',
        name: 'Checking',
        form: 'bank',
        institution: 'Bank Hapoalim',
        stableKey: 'sk-1',
        userCanonicalId: null,
      },
      {
        id: 'a2',
        productId: 'p2',
        name: 'Card',
        form: 'debt',
        institution: null,
        stableKey: null,
        userCanonicalId: 'user-card',
      },
    ]);
    mockPrisma.moneytorPensionFund.findMany.mockResolvedValue([
      {
        id: 'pn1',
        productId: 'pp1',
        name: 'Route A',
        institution: 'Menora',
        routeName: 'General',
        stableKey: 'sk-pn',
        userCanonicalId: null,
      },
    ]);
    mockPrisma.moneytorRealEstate.findMany.mockResolvedValue([
      {
        id: 're1',
        productId: 'rp1',
        name: 'Apartment',
        address: '5 Yehuda St',
        stableKey: null,
        userCanonicalId: null,
      },
      {
        // A row with no address and no institution — subtitle should end up null
        id: 're2',
        productId: 'rp2',
        name: 'Land',
        address: null,
        stableKey: null,
        userCanonicalId: null,
      },
    ]);

    const res = await GET();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.accounts).toHaveLength(2);
    expect(json.data.accounts[0].subtitle).toBe('Bank Hapoalim');
    expect(json.data.accounts[1].subtitle).toBeNull();
    expect(json.data.pensions[0].subtitle).toBe('Menora · General');
    expect(json.data.realEstate[1].subtitle).toBeNull();
  });
});

describe('PATCH /api/settings/sync-aliases/[kind]/[id]', () => {
  it('401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const res = await PATCH(patchReq({ userCanonicalId: 'x' }), params('account', 'a1'));
    expect(res.status).toBe(401);
  });

  it('400 on schema failure (too long)', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const long = 'x'.repeat(201);
    const res = await PATCH(patchReq({ userCanonicalId: long }), params('account', 'a1'));
    expect(res.status).toBe(400);
  });

  it('400 on unknown kind', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    const res = await PATCH(patchReq({ userCanonicalId: 'x' }), params('mystery', 'a1'));
    expect(res.status).toBe(400);
  });

  it('404 when the row is not found', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorAccount.updateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(patchReq({ userCanonicalId: 'x' }), params('account', 'a1'));
    expect(res.status).toBe(404);
  });

  it('updates an account and echoes the value', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorAccount.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(patchReq({ userCanonicalId: 'alias-1' }), params('account', 'a1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.userCanonicalId).toBe('alias-1');
  });

  it('clears the alias when an empty string is sent', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorAccount.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(patchReq({ userCanonicalId: '' }), params('account', 'a1'));
    const json = await res.json();
    expect(json.data.userCanonicalId).toBeNull();
  });

  it('updates a pension row', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorPensionFund.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(patchReq({ userCanonicalId: 'p' }), params('pension', 'p1'));
    expect(res.status).toBe(200);
  });

  it('updates a real-estate row', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorRealEstate.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(patchReq({ userCanonicalId: 'r' }), params('realEstate', 'r1'));
    expect(res.status).toBe(200);
  });

  it('500 on generic DB failure', async () => {
    mockGetCurrentContext.mockResolvedValue(ctx);
    mockPrisma.moneytorAccount.updateMany.mockRejectedValue(new Error('nope'));
    const res = await PATCH(patchReq({ userCanonicalId: 'x' }), params('account', 'a1'));
    expect(res.status).toBe(500);
  });
});
