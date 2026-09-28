/**
 * Unit tests for getTagMonthTotals (pure aggregation behind TagMonthBreakdown)
 */

import type { BudgetTag, BudgetTransaction } from '@/lib/utils/budget';

jest.mock('@/lib/hooks/use-budget', () => ({
  useTags: jest.fn(),
  useTransactions: jest.fn(),
}));

import { getTagMonthTotals } from '../tag-month-breakdown';

const tag = (id: string) => ({ id, name: id, color: '#000' }) as BudgetTag;
const tx = (partial: Partial<BudgetTransaction>) =>
  ({ type: 'expense', amountIls: 0, tagIds: [], isSplit: false, ...partial }) as BudgetTransaction;

describe('getTagMonthTotals', () => {
  const tags = [tag('a'), tag('b'), tag('c')];

  it('counts a multi-tag transaction toward each tag', () => {
    const result = getTagMonthTotals([tx({ amountIls: 100, tagIds: ['a', 'b'] })], tags);
    expect(result.map((r) => [r.tag.id, r.total, r.count])).toEqual([
      ['a', 100, 1],
      ['b', 100, 1],
    ]);
  });

  it('subtracts income from the tag total', () => {
    const result = getTagMonthTotals(
      [tx({ amountIls: 100, tagIds: ['a'] }), tx({ type: 'income', amountIls: 30, tagIds: ['a'] })],
      tags
    );
    expect(result).toEqual([{ tag: tags[0], total: 70, count: 2 }]);
  });

  it('counts a split parent when its children are untagged', () => {
    const result = getTagMonthTotals(
      [
        tx({ id: 'p', amountIls: 100, tagIds: ['a'], isSplit: true }),
        tx({ id: 'c1', amountIls: 60, originalTransactionId: 'p' }),
        tx({ id: 'c2', amountIls: 40, originalTransactionId: 'p' }),
      ],
      tags
    );
    expect(result).toEqual([{ tag: tags[0], total: 100, count: 1 }]);
  });

  it('counts tagged split children instead of their parent', () => {
    const result = getTagMonthTotals(
      [
        tx({ id: 'p', amountIls: 100, tagIds: ['a'], isSplit: true }),
        tx({ id: 'c1', amountIls: 40, tagIds: ['a'], originalTransactionId: 'p' }),
        tx({ id: 'c2', amountIls: 60, originalTransactionId: 'p' }),
      ],
      tags
    );
    expect(result).toEqual([{ tag: tags[0], total: 40, count: 1 }]);
  });

  it('ignores unknown tag ids and omits tags with no transactions', () => {
    const result = getTagMonthTotals([tx({ amountIls: 50, tagIds: ['ghost', 'b'] })], tags);
    expect(result).toEqual([{ tag: tags[1], total: 50, count: 1 }]);
  });

  it('sorts by total descending', () => {
    const result = getTagMonthTotals(
      [
        tx({ amountIls: 10, tagIds: ['a'] }),
        tx({ amountIls: 300, tagIds: ['b'] }),
        tx({ amountIls: 50, tagIds: ['c'] }),
      ],
      tags
    );
    expect(result.map((r) => r.tag.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns an empty array when there are no transactions', () => {
    expect(getTagMonthTotals([], tags)).toEqual([]);
  });
});
