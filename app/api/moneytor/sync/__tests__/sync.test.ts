/**
 * Integration tests for /api/moneytor/sync route
 */

// Mock syncMoneytorForHousehold
jest.mock('@/lib/api/moneytor-sync', () => ({
  syncMoneytorForHousehold: jest.fn(),
}));

// Mock MoneytorApiError - constructor matches real positional signature
jest.mock('@/lib/api/moneytor', () => ({
  MoneytorApiError: class MockMoneytorApiError extends Error {
    code: string;
    renewUrl?: string;
    status?: number;
    constructor(message: string, code: string, status?: number, renewUrl?: string) {
      super(message);
      this.name = 'MoneytorApiError';
      this.code = code;
      this.status = status;
      this.renewUrl = renewUrl;
    }
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { getCurrentContext } from '@/lib/auth-utils';
import { syncMoneytorForHousehold } from '@/lib/api/moneytor-sync';
import { MoneytorApiError } from '@/lib/api/moneytor';
import type { MoneytorSyncSummary } from '@/lib/api/moneytor-sync';
import { POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockSync = syncMoneytorForHousehold as jest.Mock;

const mockContext = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  profile: { id: 'profile-1', name: 'Test Profile', image: null, color: null, userId: 'user-1' },
  households: [
    { id: 'household-1', name: 'Test Household', description: null, role: 'owner' as const },
  ],
  activeHousehold: {
    id: 'household-1',
    name: 'Test Household',
    description: null,
    role: 'owner' as const,
  },
  householdProfiles: [
    {
      id: 'profile-1',
      name: 'Test Profile',
      image: null,
      color: null,
      role: 'owner' as const,
      hasUser: true,
    },
  ],
};

const makeSyncSummary = (overrides: Partial<MoneytorSyncSummary> = {}): MoneytorSyncSummary => ({
  householdId: 'household-1',
  fetched: 120,
  upserted: 15,
  stockAccounts: 2,
  stocksUpserted: 30,
  snapshotsUpserted: 0,
  accountsUpserted: 2,
  accountSnapshotsUpserted: 2,
  pensionFundsUpserted: 0,
  pensionSnapshotsUpserted: 0,
  budgetCreated: 10,
  budgetSkipped: 5,
  latestDate: '2026-06-12',
  syncedAt: '2026-06-12T10:00:00.000Z',
  ...overrides,
});

describe('POST /api/moneytor/sync', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should sync successfully and return summary', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockSync.mockResolvedValue(makeSyncSummary());

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.fetched).toBe(120);
    expect(data.upserted).toBe(15);
    expect(data.stockAccounts).toBe(2);
    expect(data.stocksUpserted).toBe(30);
    expect(mockSync).toHaveBeenCalledWith('household-1');
  });

  it('should return error details when MoneytorApiError with status is thrown', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const apiError = new MoneytorApiError(
      'Token expired',
      'token_expired',
      401,
      'https://moneytor.io/renew'
    );
    mockSync.mockRejectedValue(apiError);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Token expired');
    expect(data.code).toBe('token_expired');
    expect(data.renewUrl).toBe('https://moneytor.io/renew');
  });

  it('should return 400 default status for MoneytorApiError without status', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const apiError = new MoneytorApiError('Invalid token', 'invalid_token');
    mockSync.mockRejectedValue(apiError);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  it('should return 500 for unexpected errors', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockSync.mockRejectedValue(new Error('Unexpected DB failure'));

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
    expect(data.code).toBe('unknown');
  });
});
