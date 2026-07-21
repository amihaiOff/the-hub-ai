/**
 * Unit tests for TransactionActionsPanel — focused on the Account row that resolves a
 * transaction's payment identifier to a friendly account name.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import type {
  BudgetTransaction,
  BudgetCategoryGroup,
  BudgetPayee,
  BudgetTag,
} from '@/lib/utils/budget';
import type { BudgetAccountName } from '@/lib/hooks/use-budget';

// Mock the update hook used by the panel. `mutate` immediately invokes the
// caller's onSuccess so we can exercise the post-update prompt logic.
jest.mock('@/lib/hooks/use-budget', () => ({
  useUpdateTransaction: jest.fn(() => ({
    mutate: (_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    isPending: false,
  })),
}));

// The panel fetches partner contacts via useQuery; tests don't need a real client.
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ data: [], isLoading: false })),
}));

// Mock the budget utils used by the panel. Resolve 'cat-new' to a real group so
// the prompt path isn't short-circuited by a missing group.
jest.mock('@/lib/utils/budget', () => ({
  getCategoryWithGroup: (categoryId: string | null) =>
    categoryId === 'cat-new' ? { categoryName: 'Groceries', groupName: 'Food' } : null,
}));

// Mock the category picker to a button that fires onSelect('cat-new'), so tests
// can drive handleCategorySelect without the real sheet.
jest.mock('../category-picker-sheet', () => ({
  CategoryPickerSheet: (props: { onSelect: (id: string | null) => void }) => (
    <button data-testid="pick-category" onClick={() => props.onSelect('cat-new')}>
      pick
    </button>
  ),
}));
jest.mock('../tag-picker-sheet', () => ({
  TagPickerSheet: () => null,
}));

jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

import { TransactionActionsPanel } from '../transaction-actions-panel';

const categoryGroups: BudgetCategoryGroup[] = [];
const payees: BudgetPayee[] = [];
const tags: BudgetTag[] = [];

const baseTransaction: BudgetTransaction = {
  id: 'tx-1',
  type: 'expense',
  transactionDate: '2024-06-15',
  paymentDate: '2024-06-15',
  amountIls: 100,
  currency: 'ILS',
  amountOriginal: 100,
  categoryId: null,
  payeeId: null,
  paymentMethod: 'credit_card',
  paymentNumber: null,
  totalPayments: null,
  notes: null,
  source: 'moneytor_sync',
  isRecurring: false,
  isSplit: false,
  originalTransactionId: null,
  paymentIdentifier: null,
  excludedFromFlow: false,
  profileId: null,
  householdId: 'hh-1',
  tagIds: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const accountNames: BudgetAccountName[] = [
  { id: 'a-1', accountNumber: '111122223333', name: 'Joint Checking' },
];

const noop = () => {};

function renderPanel(
  transaction: BudgetTransaction,
  names: BudgetAccountName[] = accountNames,
  overrides: {
    payees?: BudgetPayee[];
    onPromptPayeeCategory?: (arg: unknown) => void;
  } = {}
) {
  return render(
    <TransactionActionsPanel
      transaction={transaction}
      categoryGroups={categoryGroups}
      payees={overrides.payees ?? payees}
      tags={tags}
      accountNames={names}
      onEdit={noop}
      onSplit={noop}
      onDelete={noop}
      onPromptPayeeCategory={overrides.onPromptPayeeCategory ?? noop}
    />
  );
}

describe('TransactionActionsPanel account row', () => {
  it('shows the mapped friendly name when the identifier is mapped', () => {
    renderPanel({ ...baseTransaction, paymentIdentifier: '111122223333' });
    expect(screen.getByRole('img', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('Joint Checking')).toBeInTheDocument();
  });

  it('falls back to the raw identifier when there is no mapping', () => {
    renderPanel({ ...baseTransaction, paymentIdentifier: '555566667777' });
    expect(screen.getByRole('img', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('555566667777')).toBeInTheDocument();
  });

  it('hides the account row when the transaction has no payment identifier', () => {
    renderPanel({ ...baseTransaction, paymentIdentifier: null });
    expect(screen.queryByRole('img', { name: 'Account' })).not.toBeInTheDocument();
  });
});

describe('TransactionActionsPanel category select → default-category prompt', () => {
  const makePayee = (over: Partial<BudgetPayee>): BudgetPayee => ({
    id: 'p-1',
    name: 'העברה מהחשבון',
    categoryId: null,
    neverDefault: false,
    transactionCount: 1,
    householdId: 'hh-1',
    ...over,
  });

  it('does NOT prompt to set a default category for a neverDefault payee', () => {
    const onPromptPayeeCategory = jest.fn();
    renderPanel({ ...baseTransaction, payeeId: 'p-1' }, accountNames, {
      payees: [makePayee({ neverDefault: true })],
      onPromptPayeeCategory,
    });

    fireEvent.click(screen.getByTestId('pick-category'));
    expect(onPromptPayeeCategory).not.toHaveBeenCalled();
  });

  it('prompts for a normal (not neverDefault) uncategorized payee', () => {
    const onPromptPayeeCategory = jest.fn();
    renderPanel({ ...baseTransaction, payeeId: 'p-1' }, accountNames, {
      payees: [makePayee({ neverDefault: false })],
      onPromptPayeeCategory,
    });

    fireEvent.click(screen.getByTestId('pick-category'));
    expect(onPromptPayeeCategory).toHaveBeenCalledTimes(1);
  });
});
