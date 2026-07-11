/**
 * Tests for GET /api/cron/suggest-categories (the manual/on-demand drain
 * endpoint). The drain loop itself is covered in drain-suggestions.test.ts;
 * here we only verify the auth guard and that the endpoint delegates to it.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    cronRunLog: { create: jest.fn() },
  },
}));

jest.mock('@/lib/ai/drain-suggestions', () => ({
  drainSuggestions: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { drainSuggestions } from '@/lib/ai/drain-suggestions';
import { GET } from '../route';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockDrain = drainSuggestions as jest.MockedFunction<typeof drainSuggestions>;

const drainResult = {
  householdsProcessed: 1,
  processed: 3,
  suggested: 2,
  lowConfidence: 0,
  noMatch: 1,
  errors: 0,
  timedOut: false,
  skipped: [],
};

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cron/suggest-categories', { headers });
}

let originalNodeEnv: string | undefined;
let originalCronSecret: string | undefined;

beforeEach(() => {
  jest.resetAllMocks();
  originalNodeEnv = process.env.NODE_ENV;
  originalCronSecret = process.env.CRON_SECRET;
  (mockPrisma.cronRunLog.create as jest.Mock).mockResolvedValue({});
  mockDrain.mockResolvedValue(drainResult);
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete (process.env as Record<string, unknown>).NODE_ENV;
  else (process.env as Record<string, unknown>).NODE_ENV = originalNodeEnv;
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

describe('auth', () => {
  it('returns 401 in production without the cron secret', async () => {
    (process.env as Record<string, unknown>).NODE_ENV = 'production';
    process.env.CRON_SECRET = 'secret';
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it('proceeds in production with the correct cron secret', async () => {
    (process.env as Record<string, unknown>).NODE_ENV = 'production';
    process.env.CRON_SECRET = 'secret';
    const res = await GET(makeRequest({ authorization: 'Bearer secret' }));
    expect(res.status).toBe(200);
    expect(mockDrain).toHaveBeenCalledTimes(1);
  });
});

describe('delegation', () => {
  it('drains and returns the aggregated results', async () => {
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.results).toEqual(drainResult);
    // A future wall-clock deadline is passed to the drain.
    expect(mockDrain).toHaveBeenCalledWith(expect.any(Number));
  });
});
