/**
 * Additional unit tests for budget hooks — covers hooks NOT exercised by
 * use-budget.test.tsx (newer AI hooks, payee-rule hooks, account-name hooks,
 * analysis, moneytor sync, savings update/delete, riseup mapping, imports,
 * tag CRUD, category/group CRUD, blacklisted payees, billing-cycle).
 *
 * Every mutation's success path runs its `onSuccess` invalidation callback,
 * and error paths run the `fetchApi` failure branch, so this raises both the
 * FUNCTIONS and BRANCHES coverage metrics for lib/hooks/use-budget.ts.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useBillingCycleStartDay,
  useBlacklistedPayees,
  useBudgetAnalysis,
  useCategorizationLogs,
  usePayeeCategoryRules,
  useAccountNames,
  useAccountNameIdentifiers,
  useSyncMoneytor,
  useSuggestCategories,
  useSuggestionAction,
  useCreateCategory,
  useMergeCategory,
  useCreateCategoryGroup,
  useDeleteCategoryGroup,
  useReorderCategoryGroups,
  useCreatePayee,
  useUpdatePayee,
  useDeletePayee,
  useCreatePayeeCategoryRule,
  useUpdatePayeeCategoryRule,
  useDeletePayeeCategoryRule,
  useApplyPayeeCategoryRule,
  useCreateAccountName,
  useUpdateAccountName,
  useDeleteAccountName,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  useMergeTags,
  useUpdateRiseupCategoryMapping,
  useApplyRiseupMappings,
  useImportTransactions,
  useUpdateSavingsEntry,
  useDeleteSavingsEntry,
} from '../use-budget';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Only type imports come from '@/lib/utils/budget' in the source, so a minimal
// mock is safe. Mirror the existing test file's mock to stay consistent.
jest.mock('@/lib/utils/budget', () => ({
  ...jest.requireActual('@/lib/utils/budget'),
  getCurrentMonth: jest.fn(() => '2024-06'),
}));

// Helper: envelope the fetchApi/{success,data} shape expects.
function ok<T>(data: T) {
  return { ok: true, json: () => Promise.resolve({ success: true, data }) };
}
function fail(error = 'API request failed') {
  return { ok: false, json: () => Promise.resolve({ success: false, error }) };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('Budget Hooks — extra coverage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── Queries ──────────────────────────────────────────────────────────

  describe('useBillingCycleStartDay', () => {
    it('returns the fetched startDay once loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { startDay: 10 } }),
      });

      const { result } = renderHook(() => useBillingCycleStartDay(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current).toBe(10));
      expect(mockFetch).toHaveBeenCalledWith('/api/settings/billing-cycle');
    });

    it('defaults to 1 while loading', () => {
      mockFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves
      const { result } = renderHook(() => useBillingCycleStartDay(), {
        wrapper: createWrapper(),
      });
      expect(result.current).toBe(1);
    });

    it('defaults to 1 when the API reports failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'nope' }),
      });
      const { result } = renderHook(() => useBillingCycleStartDay(), {
        wrapper: createWrapper(),
      });
      // Query errors, hook keeps the default.
      await waitFor(() => expect(mockFetch).toHaveBeenCalled());
      expect(result.current).toBe(1);
    });
  });

  describe('useBlacklistedPayees', () => {
    it('fetches blacklisted payees from the include=blacklisted endpoint', async () => {
      const payees = [{ id: 'p-1', name: 'Spam Co', isBlacklisted: true }];
      mockFetch.mockResolvedValueOnce(ok(payees));

      const { result } = renderHook(() => useBlacklistedPayees(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(payees);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/payees?include=blacklisted',
        expect.any(Object)
      );
    });

    it('does not fetch when disabled', async () => {
      const { result } = renderHook(() => useBlacklistedPayees(false), {
        wrapper: createWrapper(),
      });
      // Give React Query a tick; query should stay idle.
      await Promise.resolve();
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('useBudgetAnalysis', () => {
    it('fetches analysis for a date range', async () => {
      const analysis = { monthlyTotals: [], groups: [], tags: [] };
      mockFetch.mockResolvedValueOnce(ok(analysis));

      const { result } = renderHook(() => useBudgetAnalysis('2024-01-01', '2024-06-30'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(analysis);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/analysis?startDate=2024-01-01&endDate=2024-06-30',
        expect.any(Object)
      );
    });
  });

  describe('useCategorizationLogs', () => {
    it('fetches AI categorization logs', async () => {
      const logs = [
        {
          id: 'log-1',
          transactionName: 'SuperPharm',
          status: 'suggested',
          resultCategoryName: 'Health',
          confidence: 0.92,
          reasoning: 'pharmacy',
          createdAt: '2024-06-01T00:00:00Z',
        },
      ];
      mockFetch.mockResolvedValueOnce(ok(logs));

      const { result } = renderHook(() => useCategorizationLogs(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(logs);
      expect(mockFetch).toHaveBeenCalledWith('/api/budget/categorization-logs', expect.any(Object));
    });

    it('surfaces API errors', async () => {
      mockFetch.mockResolvedValueOnce(fail('boom'));
      const { result } = renderHook(() => useCategorizationLogs(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('usePayeeCategoryRules', () => {
    it('fetches payee category rules', async () => {
      const rules = [{ id: 'r-1', name: 'Groceries', operator: 'contains', value: 'shufersal' }];
      mockFetch.mockResolvedValueOnce(ok(rules));

      const { result } = renderHook(() => usePayeeCategoryRules(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(rules);
      expect(mockFetch).toHaveBeenCalledWith('/api/budget/payee-rules', expect.any(Object));
    });

    it('does not fetch when disabled', async () => {
      const { result } = renderHook(() => usePayeeCategoryRules(false), {
        wrapper: createWrapper(),
      });
      await Promise.resolve();
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('useAccountNames', () => {
    it('fetches account-name mappings', async () => {
      const names = [{ id: 'a-1', accountNumber: '1234', name: 'Checking' }];
      mockFetch.mockResolvedValueOnce(ok(names));

      const { result } = renderHook(() => useAccountNames(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(names);
      expect(mockFetch).toHaveBeenCalledWith('/api/budget/account-names', expect.any(Object));
    });
  });

  describe('useAccountNameIdentifiers', () => {
    it('fetches distinct identifiers', async () => {
      const identifiers = [{ accountNumber: '1234', count: 5, samplePayee: 'Store' }];
      mockFetch.mockResolvedValueOnce(ok(identifiers));

      const { result } = renderHook(() => useAccountNameIdentifiers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(identifiers);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/account-names/identifiers',
        expect.any(Object)
      );
    });

    it('does not fetch when disabled', async () => {
      const { result } = renderHook(() => useAccountNameIdentifiers(false), {
        wrapper: createWrapper(),
      });
      await Promise.resolve();
      expect(result.current.fetchStatus).toBe('idle');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── Moneytor sync (custom {ok} envelope) ───────────────────────────────

  describe('useSyncMoneytor', () => {
    it('resolves with the sync result on success', async () => {
      const syncResult = {
        ok: true,
        fetched: 10,
        upserted: 8,
        budgetCreated: 8,
        budgetSkipped: 0,
        latestDate: '2024-06-15',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(syncResult),
      });

      const { result } = renderHook(() => useSyncMoneytor(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync();
      });

      expect(data).toEqual(syncResult);
      expect(mockFetch).toHaveBeenCalledWith('/api/moneytor/sync', { method: 'POST' });
    });

    it('throws when the response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ ok: false, error: 'token expired', code: 'RENEW' }),
      });

      const { result } = renderHook(() => useSyncMoneytor(), { wrapper: createWrapper() });

      await act(async () => {
        await expect(result.current.mutateAsync()).rejects.toThrow('token expired');
      });
    });
  });

  // ─── AI categorization mutations ────────────────────────────────────────

  describe('useSuggestCategories', () => {
    it('posts to the suggest endpoint with a limit', async () => {
      const res = { processed: 5, suggested: 3, lowConfidence: 1, noMatch: 1, errors: 0 };
      mockFetch.mockResolvedValueOnce(ok(res));

      const { result } = renderHook(() => useSuggestCategories(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({ limit: 5 });
      });

      expect(data).toEqual(res);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/suggest',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ limit: 5 }),
        })
      );
    });

    it('defaults to an empty body when no input given', async () => {
      const res = { processed: 0, suggested: 0, lowConfidence: 0, noMatch: 0, errors: 0 };
      mockFetch.mockResolvedValueOnce(ok(res));

      const { result } = renderHook(() => useSuggestCategories(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync(undefined);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/suggest',
        expect.objectContaining({ body: JSON.stringify({}) })
      );
    });
  });

  describe('useSuggestionAction', () => {
    it('approves a suggestion', async () => {
      mockFetch.mockResolvedValueOnce(ok({ id: 'tx-1', action: 'approve' }));

      const { result } = renderHook(() => useSuggestionAction(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({ id: 'tx-1', action: 'approve' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/tx-1/suggestion',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'approve' }),
        })
      );
    });

    it('dismisses a suggestion', async () => {
      mockFetch.mockResolvedValueOnce(ok({ id: 'tx-2', action: 'dismiss' }));

      const { result } = renderHook(() => useSuggestionAction(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({ id: 'tx-2', action: 'dismiss' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/tx-2/suggestion',
        expect.objectContaining({ body: JSON.stringify({ action: 'dismiss' }) })
      );
    });
  });

  // ─── Category / group mutations ─────────────────────────────────────────

  describe('useCreateCategory', () => {
    it('creates a category', async () => {
      const cat = { id: 'cat-1', name: 'Groceries', groupId: 'g-1', budget: 1000, isMust: true };
      mockFetch.mockResolvedValueOnce(ok(cat));

      const { result } = renderHook(() => useCreateCategory(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({
          name: 'Groceries',
          groupId: 'g-1',
          budget: 1000,
          isMust: true,
        });
      });

      expect(data).toEqual(cat);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/categories',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('useMergeCategory', () => {
    it('merges categories', async () => {
      const res = { targetCategoryId: 'cat-2', transactionsMoved: 4, payeesUpdated: 1 };
      mockFetch.mockResolvedValueOnce(ok(res));

      const { result } = renderHook(() => useMergeCategory(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({
          sourceCategoryId: 'cat-1',
          targetCategoryId: 'cat-2',
        });
      });

      expect(data).toEqual(res);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/categories/merge',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ sourceCategoryId: 'cat-1', targetCategoryId: 'cat-2' }),
        })
      );
    });
  });

  describe('useCreateCategoryGroup', () => {
    it('creates a category group', async () => {
      const group = { id: 'g-1', name: 'Bills', categories: [] };
      mockFetch.mockResolvedValueOnce(ok(group));

      const { result } = renderHook(() => useCreateCategoryGroup(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({ name: 'Bills' });
      });

      expect(data).toEqual(group);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/category-groups',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Bills' }) })
      );
    });
  });

  describe('useDeleteCategoryGroup', () => {
    it('deletes a category group', async () => {
      mockFetch.mockResolvedValueOnce(ok({ id: 'g-1' }));

      const { result } = renderHook(() => useDeleteCategoryGroup(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync('g-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/category-groups/g-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('useReorderCategoryGroups', () => {
    it('posts the reordered groups', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));
      const groups = [
        { id: 'g-1', sortOrder: 0 },
        { id: 'g-2', sortOrder: 1 },
      ];

      const { result } = renderHook(() => useReorderCategoryGroups(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync(groups);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/category-groups/reorder',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ groups }) })
      );
    });
  });

  // ─── Payee mutations ────────────────────────────────────────────────────

  describe('useCreatePayee', () => {
    it('creates a payee', async () => {
      const payee = { id: 'p-1', name: 'Store', categoryId: 'cat-1' };
      mockFetch.mockResolvedValueOnce(ok(payee));

      const { result } = renderHook(() => useCreatePayee(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({ name: 'Store', categoryId: 'cat-1' });
      });

      expect(data).toEqual(payee);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/payees',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('useUpdatePayee', () => {
    it('updates a payee, stripping id from the body', async () => {
      const payee = { id: 'p-1', name: 'Renamed' };
      mockFetch.mockResolvedValueOnce(ok(payee));

      const { result } = renderHook(() => useUpdatePayee(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({ id: 'p-1', name: 'Renamed', isBlacklisted: true });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/payees/p-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Renamed', isBlacklisted: true }),
        })
      );
    });
  });

  describe('useDeletePayee', () => {
    it('deletes a payee', async () => {
      mockFetch.mockResolvedValueOnce(ok({ id: 'p-1' }));

      const { result } = renderHook(() => useDeletePayee(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync('p-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/payees/p-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // ─── Payee category rules ───────────────────────────────────────────────

  describe('useCreatePayeeCategoryRule', () => {
    it('creates a rule', async () => {
      const rule = { id: 'r-1', name: 'Groceries', operator: 'contains', value: 'shufersal' };
      mockFetch.mockResolvedValueOnce(ok(rule));

      const { result } = renderHook(() => useCreatePayeeCategoryRule(), {
        wrapper: createWrapper(),
      });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({
          name: 'Groceries',
          operator: 'contains',
          value: 'shufersal',
          categoryId: 'cat-1',
        });
      });

      expect(data).toEqual(rule);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/payee-rules',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('useUpdatePayeeCategoryRule', () => {
    it('updates a rule, stripping id from the body', async () => {
      const rule = { id: 'r-1', name: 'Renamed', operator: 'equals', value: 'x' };
      mockFetch.mockResolvedValueOnce(ok(rule));

      const { result } = renderHook(() => useUpdatePayeeCategoryRule(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ id: 'r-1', name: 'Renamed', isActive: false });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/payee-rules/r-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Renamed', isActive: false }),
        })
      );
    });
  });

  describe('useDeletePayeeCategoryRule', () => {
    it('deletes a rule', async () => {
      mockFetch.mockResolvedValueOnce(ok({ id: 'r-1' }));

      const { result } = renderHook(() => useDeletePayeeCategoryRule(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('r-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/payee-rules/r-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('useApplyPayeeCategoryRule', () => {
    it('applies a rule and returns match counts', async () => {
      const res = { matched: 12, total: 30 };
      mockFetch.mockResolvedValueOnce(ok(res));

      const { result } = renderHook(() => useApplyPayeeCategoryRule(), {
        wrapper: createWrapper(),
      });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync('r-1');
      });

      expect(data).toEqual(res);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/payee-rules/r-1/apply',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ─── Account name mutations ─────────────────────────────────────────────

  describe('useCreateAccountName', () => {
    it('creates an account name', async () => {
      const acct = { id: 'a-1', accountNumber: '1234', name: 'Checking' };
      mockFetch.mockResolvedValueOnce(ok(acct));

      const { result } = renderHook(() => useCreateAccountName(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({ accountNumber: '1234', name: 'Checking' });
      });

      expect(data).toEqual(acct);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/account-names',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('useUpdateAccountName', () => {
    it('updates an account name, stripping id', async () => {
      const acct = { id: 'a-1', accountNumber: '1234', name: 'Savings' };
      mockFetch.mockResolvedValueOnce(ok(acct));

      const { result } = renderHook(() => useUpdateAccountName(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({ id: 'a-1', name: 'Savings' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/account-names/a-1',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Savings' }) })
      );
    });
  });

  describe('useDeleteAccountName', () => {
    it('deletes an account name', async () => {
      mockFetch.mockResolvedValueOnce(ok({ id: 'a-1' }));

      const { result } = renderHook(() => useDeleteAccountName(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync('a-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/account-names/a-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // ─── Tag mutations ──────────────────────────────────────────────────────

  describe('useCreateTag', () => {
    it('creates a tag', async () => {
      const tag = { id: 't-1', name: 'Essential', color: '#EF4444' };
      mockFetch.mockResolvedValueOnce(ok(tag));

      const { result } = renderHook(() => useCreateTag(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({ name: 'Essential', color: '#EF4444' });
      });

      expect(data).toEqual(tag);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/tags',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Essential', color: '#EF4444' }),
        })
      );
    });
  });

  describe('useUpdateTag', () => {
    it('updates a tag, stripping id', async () => {
      const tag = { id: 't-1', name: 'Renamed', color: '#00FF00' };
      mockFetch.mockResolvedValueOnce(ok(tag));

      const { result } = renderHook(() => useUpdateTag(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({ id: 't-1', name: 'Renamed', color: '#00FF00' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/tags/t-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Renamed', color: '#00FF00' }),
        })
      );
    });
  });

  describe('useDeleteTag', () => {
    it('deletes a tag', async () => {
      mockFetch.mockResolvedValueOnce(ok({ id: 't-1' }));

      const { result } = renderHook(() => useDeleteTag(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync('t-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/tags/t-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('useMergeTags', () => {
    it('merges tags via PUT on the collection endpoint', async () => {
      mockFetch.mockResolvedValueOnce(ok({ id: 't-target' }));

      const { result } = renderHook(() => useMergeTags(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync({
          sourceTagIds: ['t-1', 't-2'],
          targetTagId: 't-target',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/tags',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ sourceTagIds: ['t-1', 't-2'], targetTagId: 't-target' }),
        })
      );
    });
  });

  // ─── Riseup mapping / apply, imports ────────────────────────────────────

  describe('useUpdateRiseupCategoryMapping', () => {
    it('updates a riseup → budget category mapping', async () => {
      const mapped = {
        id: 'rc-1',
        name: 'Food',
        isDeleted: false,
        budgetCategoryId: 'cat-1',
        householdId: 'h-1',
      };
      mockFetch.mockResolvedValueOnce(ok(mapped));

      const { result } = renderHook(() => useUpdateRiseupCategoryMapping(), {
        wrapper: createWrapper(),
      });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({ id: 'rc-1', budgetCategoryId: 'cat-1' });
      });

      expect(data).toEqual(mapped);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/riseup-categories',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ id: 'rc-1', budgetCategoryId: 'cat-1' }),
        })
      );
    });

    it('clears a mapping with null', async () => {
      const mapped = {
        id: 'rc-1',
        name: 'Food',
        isDeleted: false,
        budgetCategoryId: null,
        householdId: 'h-1',
      };
      mockFetch.mockResolvedValueOnce(ok(mapped));

      const { result } = renderHook(() => useUpdateRiseupCategoryMapping(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ id: 'rc-1', budgetCategoryId: null });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/riseup-categories',
        expect.objectContaining({
          body: JSON.stringify({ id: 'rc-1', budgetCategoryId: null }),
        })
      );
    });
  });

  describe('useApplyRiseupMappings', () => {
    it('applies mappings and returns updated count', async () => {
      mockFetch.mockResolvedValueOnce(ok({ updated: 7 }));

      const { result } = renderHook(() => useApplyRiseupMappings(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync();
      });

      expect(data).toEqual({ updated: 7 });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/riseup-categories/apply',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('useImportTransactions', () => {
    it('imports transactions and returns the result', async () => {
      const res = { created: 2, duplicatesSkipped: 1, payeesCreated: ['New Store'] };
      mockFetch.mockResolvedValueOnce(ok(res));

      const { result } = renderHook(() => useImportTransactions(), { wrapper: createWrapper() });

      const input = {
        transactions: [
          {
            type: 'expense' as const,
            transactionDate: '2024-06-01',
            amountIls: 100,
            payeeName: 'New Store',
          },
        ],
      };

      let data;
      await act(async () => {
        data = await result.current.mutateAsync(input);
      });

      expect(data).toEqual(res);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/transactions/import',
        expect.objectContaining({ method: 'POST', body: JSON.stringify(input) })
      );
    });

    it('propagates import errors', async () => {
      mockFetch.mockResolvedValueOnce(fail('bad file'));

      const { result } = renderHook(() => useImportTransactions(), { wrapper: createWrapper() });

      await act(async () => {
        await expect(result.current.mutateAsync({ transactions: [] })).rejects.toThrow('bad file');
      });
    });
  });

  // ─── Savings update / delete ────────────────────────────────────────────

  describe('useUpdateSavingsEntry', () => {
    it('updates a savings entry via PUT', async () => {
      const res = { id: 's-1', month: '2025-03', amount: 4000 };
      mockFetch.mockResolvedValueOnce(ok(res));

      const { result } = renderHook(() => useUpdateSavingsEntry(), { wrapper: createWrapper() });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({ month: '2025-03', amount: 4000 });
      });

      expect(data).toEqual(res);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/savings',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ month: '2025-03', amount: 4000 }),
        })
      );
    });
  });

  describe('useDeleteSavingsEntry', () => {
    it('deletes a savings entry by month', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true }));

      const { result } = renderHook(() => useDeleteSavingsEntry(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.mutateAsync('2025-03');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget/savings',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ month: '2025-03' }),
        })
      );
    });

    it('propagates delete errors', async () => {
      mockFetch.mockResolvedValueOnce(fail('not found'));

      const { result } = renderHook(() => useDeleteSavingsEntry(), { wrapper: createWrapper() });

      await act(async () => {
        await expect(result.current.mutateAsync('2025-03')).rejects.toThrow('not found');
      });
    });
  });
});
