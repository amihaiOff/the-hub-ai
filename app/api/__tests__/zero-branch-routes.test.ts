/**
 * Smoke tests for routes that had 0% branch coverage after the codebase
 * review. Each handler follows the same `getCurrentContext() → 401 or
 * happy path` shape, so covering the 401 branch alone lifts each route
 * from 0% to ~50% branches — enough to move the global threshold from
 * 79% → over 85% for one small file's worth of test surface.
 *
 * These are auth-only smoke tests, not full behavioural coverage. Real
 * business-logic tests can be added over time as each route gets a
 * dedicated suite.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    // Only what the routes touch on the auth-null path is needed —
    // typically nothing (they return before hitting the DB). Listing the
    // models here keeps `prisma.X` accessors safe from `undefined` if a
    // route ever guards after an early DB read.
    budgetCategory: { findMany: jest.fn(), update: jest.fn() },
    budgetCategoryGroup: { findMany: jest.fn(), update: jest.fn() },
    budgetPayee: { findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    budgetPayeeCategoryRule: { findMany: jest.fn(), findFirst: jest.fn() },
    budgetTransaction: { findMany: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
    budgetCategorizationLog: { findMany: jest.fn(), groupBy: jest.fn() },
    moneytorDropLog: { findMany: jest.fn() },
    partnerContact: { findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    generalLog: { updateMany: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    moneytorSyncAlias: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    pensionAccount: { findFirst: jest.fn() },
    miscAsset: { findFirst: jest.fn() },
    stockAccount: { findFirst: jest.fn() },
    household: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    householdMember: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    profile: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    taskCategory: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// pages/upload also imports @vercel/blob — stub it so the module loads.
jest.mock('@vercel/blob', () => ({
  put: jest.fn(),
}));

import { getCurrentContext } from '@/lib/auth-utils';
const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;

// Each entry: [label, importer, invocation]. Wrapping the handler behind
// a lazy `import()` keeps modules from loading (and blowing up) until
// their branch is exercised, so a broken route doesn't fail the whole
// suite when its neighbour is fine.
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
// Loader signature is intentionally loose — different routes expose
// different subsets of GET/POST/PUT/PATCH/DELETE, some accept a
// NextRequest, some accept a { params } second arg. We look up the
// method at runtime and invoke it via a permissive cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loader = () => Promise<Record<string, any>>;

const cases: Array<[string, Loader, Method]> = [
  ['budget/categories/reorder POST', () => import('../budget/categories/reorder/route'), 'POST'],
  [
    'budget/category-groups/reorder POST',
    () => import('../budget/category-groups/reorder/route'),
    'POST',
  ],
  [
    'budget/riseup-categories/apply POST',
    () => import('../budget/riseup-categories/apply/route'),
    'POST',
  ],
  ['labs/ai-usage GET', () => import('../labs/ai-usage/route'), 'GET'],
  ['labs/dropped-transactions GET', () => import('../labs/dropped-transactions/route'), 'GET'],
  ['labs/general-log/mark-read POST', () => import('../labs/general-log/mark-read/route'), 'POST'],
  [
    'labs/general-log/unread-count GET',
    () => import('../labs/general-log/unread-count/route'),
    'GET',
  ],
  ['pages/upload POST', () => import('../pages/upload/route'), 'POST'],
  ['settings/partner-contacts GET', () => import('../settings/partner-contacts/route'), 'GET'],
  ['settings/partner-contacts POST', () => import('../settings/partner-contacts/route'), 'POST'],
  [
    'settings/partner-contacts/[id] DELETE',
    () => import('../settings/partner-contacts/[id]/route'),
    'DELETE',
  ],
  ['budget/payee-rules/apply POST', () => import('../budget/payee-rules/apply/route'), 'POST'],
  [
    'budget/payee-rules/[id]/apply POST',
    () => import('../budget/payee-rules/[id]/apply/route'),
    'POST',
  ],
];

describe('unauthenticated smoke tests for previously-uncovered routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentContext.mockResolvedValue(null);
  });

  for (const [label, load, method] of cases) {
    it(`${label} returns 401 when no context`, async () => {
      const mod = await load();
      const handler = mod[method] as
        | ((req: unknown, ctx?: unknown) => Promise<Response>)
        | undefined;
      if (!handler) throw new Error(`route module is missing ${method}`);

      // Some handlers take a NextRequest; some (GET) take nothing.
      // Passing a NextRequest to a zero-arg handler is harmless in Node.
      const req = new NextRequest('http://localhost:3000/api/x', {
        method,
        body:
          method === 'POST' || method === 'PUT' || method === 'PATCH'
            ? JSON.stringify({})
            : undefined,
      });
      // Dynamic-route handlers accept a { params } context — pass an
      // empty stub so they don't NPE reading `await params` before the
      // auth check completes. Real behaviour test would supply real ids.
      const ctx = { params: Promise.resolve({ id: 'x', profileId: 'x', kind: 'x' }) };
      const res = await handler(req, ctx);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { success?: boolean; error?: string };
      expect(body.success).toBe(false);
    });
  }
});
