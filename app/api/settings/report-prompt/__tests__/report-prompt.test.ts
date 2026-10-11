/**
 * Route tests for GET/PUT /api/settings/report-prompt — the household's
 * editable prompt for the monthly budget-report agent.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    household: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { DEFAULT_REPORT_PROMPT, REPORT_CONTRACT } from '@/lib/budget-report/prompt';
import { GET, PUT } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as unknown as {
  household: { findUnique: jest.Mock; update: jest.Mock };
};

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

function put(body: unknown) {
  return new NextRequest('http://localhost/api/settings/report-prompt', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/settings/report-prompt', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.household.update.mockResolvedValue({});
  });

  describe('GET', () => {
    it('returns 401 without a context', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      expect((await GET()).status).toBe(401);
    });

    it('returns null prompt plus the default and contract when unset', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockPrisma.household.findUnique.mockResolvedValueOnce({ reportPrompt: null });

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toEqual({
        prompt: null,
        defaultPrompt: DEFAULT_REPORT_PROMPT,
        contract: REPORT_CONTRACT,
      });
      expect(mockPrisma.household.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'household-1' } })
      );
    });

    it("returns the household's custom prompt", async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockPrisma.household.findUnique.mockResolvedValueOnce({ reportPrompt: 'Be brief.' });

      const body = await (await GET()).json();
      expect(body.data.prompt).toBe('Be brief.');
      expect(body.data.defaultPrompt).toBe(DEFAULT_REPORT_PROMPT);
    });
  });

  describe('PUT', () => {
    it('returns 401 without a context', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      expect((await PUT(put({ prompt: 'x' }))).status).toBe(401);
      expect(mockPrisma.household.update).not.toHaveBeenCalled();
    });

    it('stores a custom prompt as given', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const res = await PUT(put({ prompt: 'Focus on groceries.' }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.prompt).toBe('Focus on groceries.');
      expect(mockPrisma.household.update).toHaveBeenCalledWith({
        where: { id: 'household-1' },
        data: { reportPrompt: 'Focus on groceries.' },
      });
    });

    it.each([
      ['empty', ''],
      ['whitespace', '   \n\t '],
      ['null', null],
      ['identical to default', DEFAULT_REPORT_PROMPT],
      ['default with surrounding whitespace', `\n  ${DEFAULT_REPORT_PROMPT}  \n`],
    ])('stores null when the prompt is %s', async (_label, prompt) => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const res = await PUT(put({ prompt }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.prompt).toBeNull();
      expect(mockPrisma.household.update).toHaveBeenCalledWith({
        where: { id: 'household-1' },
        data: { reportPrompt: null },
      });
    });

    it.each([
      ['missing prompt', {}],
      ['non-string prompt', { prompt: 5 }],
      ['too long', { prompt: 'x'.repeat(20001) }],
    ])('returns 400 for %s', async (_label, body) => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      const res = await PUT(put(body));
      expect(res.status).toBe(400);
      expect(mockPrisma.household.update).not.toHaveBeenCalled();
    });

    it('returns 500 when the update fails', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      mockPrisma.household.update.mockRejectedValueOnce(new Error('db'));

      const res = await PUT(put({ prompt: 'custom' }));
      expect(res.status).toBe(500);
      (console.error as jest.Mock).mockRestore();
    });
  });
});
