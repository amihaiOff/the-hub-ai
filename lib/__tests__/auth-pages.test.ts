import { NextRequest } from 'next/server';

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

jest.mock('@/lib/auth-api-key', () => ({
  getPagesHouseholdIdFromToken: jest.fn(),
  resolveHouseholdOwnerUserId: jest.fn(),
}));

import { getCurrentContext } from '@/lib/auth-utils';
import { getPagesHouseholdIdFromToken, resolveHouseholdOwnerUserId } from '@/lib/auth-api-key';
import { resolvePagesAccess } from '@/lib/auth-pages';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockTokenHousehold = getPagesHouseholdIdFromToken as jest.MockedFunction<
  typeof getPagesHouseholdIdFromToken
>;
const mockResolveOwner = resolveHouseholdOwnerUserId as jest.MockedFunction<
  typeof resolveHouseholdOwnerUserId
>;

const req = () => new NextRequest('http://localhost/api/pages');

const sessionContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

describe('resolvePagesAccess', () => {
  beforeEach(() => jest.resetAllMocks());

  it('prefers the session: returns the active household + current user', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(sessionContext);
    const result = await resolvePagesAccess(req());
    expect(result).toEqual({ householdId: 'hh-1', userId: 'user-1' });
    // A live session never falls through to the token path.
    expect(mockTokenHousehold).not.toHaveBeenCalled();
  });

  it('falls back to the token: household + resolved owner user', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    mockTokenHousehold.mockResolvedValueOnce('hh-1');
    mockResolveOwner.mockResolvedValueOnce('owner-1');
    const result = await resolvePagesAccess(req());
    expect(result).toEqual({ householdId: 'hh-1', userId: 'owner-1' });
  });

  it('returns null when neither a session nor a valid token is present', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    mockTokenHousehold.mockResolvedValueOnce(null);
    const result = await resolvePagesAccess(req());
    expect(result).toBeNull();
    expect(mockResolveOwner).not.toHaveBeenCalled();
  });

  it('returns null when the token is valid but the household has no login owner', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    mockTokenHousehold.mockResolvedValueOnce('hh-1');
    mockResolveOwner.mockResolvedValueOnce(null);
    const result = await resolvePagesAccess(req());
    expect(result).toBeNull();
  });
});
