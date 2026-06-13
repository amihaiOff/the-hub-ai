/**
 * Integration tests for POST /api/moneytor/force-resync route
 */

import { NextRequest } from 'next/server';

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

// Mock forceResyncMoneytorTransactionsForHousehold
jest.mock('@/lib/api/moneytor-sync', () => {
  class ForceResyncRangeError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ForceResyncRangeError';
    }
  }
  return {
    forceResyncMoneytorTransactionsForHousehold: jest.fn(),
    ForceResyncRangeError,
  };
});

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

import { getCurrentContext } from '@/lib/auth-utils';
import {
  forceResyncMoneytorTransactionsForHousehold,
  ForceResyncRangeError,
} from '@/lib/api/moneytor-sync';
import { MoneytorApiError } from '@/lib/api/moneytor';
import { POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockForceResync = forceResyncMoneytorTransactionsForHousehold as jest.Mock;

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

describe('POST /api/moneytor/force-resync', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/moneytor/force-resync', {
      method: 'POST',
      body: JSON.stringify({ from: '2026-01-01', to: '2026-06-12' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
  });

  it('should return 400 for invalid body', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const request = new NextRequest('http://localhost/api/moneytor/force-resync', {
      method: 'POST',
      body: JSON.stringify({ from: 'invalid-date', to: '2026-06-12' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
  });

  it('should force resync successfully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const resyncResult = {
      householdId: 'household-1',
      from: '2026-01-01',
      to: '2026-06-12',
      deletedMoneytor: 50,
      deletedBudget: 50,
      fetched: 60,
      upserted: 60,
      budgetCreated: 60,
      editsPreserved: 5,
      syncedAt: '2026-06-12T10:00:00.000Z',
    };

    mockForceResync.mockResolvedValue(resyncResult);

    const request = new NextRequest('http://localhost/api/moneytor/force-resync', {
      method: 'POST',
      body: JSON.stringify({ from: '2026-01-01', to: '2026-06-12' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.fetched).toBe(60);
  });

  it('should return 400 for ForceResyncRangeError', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    mockForceResync.mockRejectedValue(new ForceResyncRangeError('Date range too large'));

    const request = new NextRequest('http://localhost/api/moneytor/force-resync', {
      method: 'POST',
      body: JSON.stringify({ from: '2020-01-01', to: '2026-06-12' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Date range too large');
  });

  it('should return appropriate status for MoneytorApiError', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const apiError = new MoneytorApiError('Token expired', 'token_expired', 401);
    mockForceResync.mockRejectedValue(apiError);

    const request = new NextRequest('http://localhost/api/moneytor/force-resync', {
      method: 'POST',
      body: JSON.stringify({ from: '2026-01-01', to: '2026-06-12' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.code).toBe('token_expired');
  });

  it('should return 500 for unexpected errors', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    mockForceResync.mockRejectedValue(new Error('Unexpected error'));

    const request = new NextRequest('http://localhost/api/moneytor/force-resync', {
      method: 'POST',
      body: JSON.stringify({ from: '2026-01-01', to: '2026-06-12' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
  });
});
