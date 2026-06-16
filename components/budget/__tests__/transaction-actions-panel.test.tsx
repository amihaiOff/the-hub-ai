/**
 * Unit tests for TransactionActionsPanel — focused on the Account row that resolves a
 * transaction's payment identifier to a friendly account name.
 */

import { render, screen } from '@testing-library/react';
import type {
  BudgetTransaction,
  BudgetCategoryGroup,
  BudgetPayee,
  BudgetTag,
} from '@/lib/utils/budget';
import type { BudgetAccountName } from '@/lib/hooks/use-budget';

// Mock the update hook used by the panel
jest.mock('@/lib/hooks/use-budget', () => ({
  useUpdateTransaction: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}));

// The panel fetches partner contacts via useQuery; tests don't need a real client.
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ data: [], isLoading: false })),
}));

// Mock the budget utils used by the panel
jest.mock('@/lib/utils/budget', () => ({
  getCategoryWithGroup: jest.fn(() => null),
}));

// Mock the picker sheets so we only render the panel content
jest.mock('../category-picker-sheet', () => ({
  CategoryPickerSheet: () => null,
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

function renderPanel(transaction: BudgetTransaction, names: BudgetAccountName[] = accountNames) {
  return render(
    <TransactionActionsPanel
      transaction={transaction}
      categoryGroups={categoryGroups}
      payees={payees}
      tags={tags}
      accountNames={names}
      onEdit={noop}
      onSplit={noop}
      onDelete={noop}
      onPromptPayeeCategory={noop}
    />
  );
}

describe('TransactionActionsPanel account row', () => {
  it('shows the mapped friendly name when the identifier is mapped', () => {
    renderPanel({ ...baseTransaction, paymentIdentifier: '111122223333' });
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Joint Checking')).toBeInTheDocument();
  });

  it('falls back to the raw identifier when there is no mapping', () => {
    renderPanel({ ...baseTransaction, paymentIdentifier: '555566667777' });
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('555566667777')).toBeInTheDocument();
  });

  it('hides the account row when the transaction has no payment identifier', () => {
    renderPanel({ ...baseTransaction, paymentIdentifier: null });
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
  });
});
