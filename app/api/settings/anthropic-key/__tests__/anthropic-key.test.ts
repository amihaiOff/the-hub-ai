/**
 * Integration tests for /api/settings/anthropic-key (GET status + PUT set/clear).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    household: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, PUT } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

function putRequest(body: unknown) {
  return new NextRequest('http://localhost/api/settings/anthropic-key', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

beforeEach(() => jest.resetAllMocks());

describe('GET /api/settings/anthropic-key', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('reports a masked key without leaking the raw value', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({
      anthropicApiKey: 'sk-ant-secret-abcd1234',
    });
    const res = await GET();
    const json = await res.json();
    expect(json.data).toEqual({ hasKey: true, maskedKey: '…1234' });
    expect(JSON.stringify(json)).not.toContain('sk-ant-secret-abcd1234');
    // Scoped to the active household.
    expect((mockPrisma.household.findUnique as jest.Mock).mock.calls[0][0].where).toEqual({
      id: 'hh-1',
    });
  });

  it('reports hasKey=false when no key is stored', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce({ anthropicApiKey: null });
    const res = await GET();
    const json = await res.json();
    expect(json.data).toEqual({ hasKey: false, maskedKey: null });
  });

  it('handles a missing household row (findUnique → null)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET();
    const json = await res.json();
    expect(json.data).toEqual({ hasKey: false, maskedKey: null });
  });
});

describe('PUT /api/settings/anthropic-key', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await PUT(putRequest({ apiKey: 'sk-x' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body (missing apiKey field)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const res = await PUT(putRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when apiKey exceeds the max length', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const res = await PUT(putRequest({ apiKey: 'a'.repeat(501) }));
    expect(res.status).toBe(400);
  });

  it('sets a trimmed key, scoped to the household, and returns the mask', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.update as jest.Mock).mockResolvedValueOnce({
      anthropicApiKey: 'sk-ant-newkey-wxyz',
    });
    const res = await PUT(putRequest({ apiKey: '  sk-ant-newkey-wxyz  ' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.household.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'hh-1' });
    expect(updateCall.data).toEqual({ anthropicApiKey: 'sk-ant-newkey-wxyz' });
    expect(json.data).toEqual({ hasKey: true, maskedKey: '…wxyz' });
  });

  it('clears the key when apiKey is explicit null', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.update as jest.Mock).mockResolvedValueOnce({ anthropicApiKey: null });
    const res = await PUT(putRequest({ apiKey: null }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect((mockPrisma.household.update as jest.Mock).mock.calls[0][0].data).toEqual({
      anthropicApiKey: null,
    });
    expect(json.data).toEqual({ hasKey: false, maskedKey: null });
  });

  it('clears the key when apiKey is an empty/whitespace string', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.update as jest.Mock).mockResolvedValueOnce({ anthropicApiKey: null });
    const res = await PUT(putRequest({ apiKey: '   ' }));
    expect(res.status).toBe(200);
    expect((mockPrisma.household.update as jest.Mock).mock.calls[0][0].data).toEqual({
      anthropicApiKey: null,
    });
  });

  it('returns 500 when the update throws', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.household.update as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await PUT(putRequest({ apiKey: 'sk-x' }));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
