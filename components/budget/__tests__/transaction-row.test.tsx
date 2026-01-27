/**
 * Unit tests for TransactionRow component
 * Tests rendering, inline category dropdown, and mutation handling
 */

import { render, screen, fireEvent } from '@testing-library/react';
import type {
  BudgetTransaction,
  BudgetCategoryGroup,
  BudgetPayee,
  BudgetTag,
} from '@/lib/utils/budget';

import type { useUpdateTransaction as UseUpdateTransactionType } from '@/lib/hooks/use-budget';

// Mock TanStack Query hooks
const mockMutate = jest.fn();
jest.mock('@/lib/hooks/use-budget', () => ({
  useUpdateTransaction: jest.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}));

// Mock utility functions
jest.mock('@/lib/utils/budget', () => ({
  formatDate: jest.fn((dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }),
  formatCurrencyILS: jest.fn((value: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }),
  getPayeeName: jest.fn((payeeId: string | null, payees: BudgetPayee[]) => {
    if (!payeeId) return 'Unknown';
    const payee = payees.find((p) => p.id === payeeId);
    return payee?.name || 'Unknown';
  }),
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// Import after mocks
import { TransactionRow } from '../transaction-row';
import { useUpdateTransaction } from '@/lib/hooks/use-budget';

const mockUseUpdateTransaction = useUpdateTransaction as jest.MockedFunction<
  typeof useUpdateTransaction
>;

const mockPayees: BudgetPayee[] = [
  {
    id: 'payee-1',
    name: 'Test Payee',
    categoryId: 'cat-1',
    transactionCount: 10,
    householdId: 'hh-1',
  },
  {
    id: 'payee-2',
    name: 'Gas Station',
    categoryId: 'cat-2',
    transactionCount: 5,
    householdId: 'hh-1',
  },
];

const mockTags: BudgetTag[] = [
  {
    id: 'tag-1',
    name: 'Essential',
    color: '#EF4444',
    transactionCount: 25,
    householdId: 'hh-1',
  },
  {
    id: 'tag-2',
    name: 'Fun',
    color: '#8B5CF6',
    transactionCount: 18,
    householdId: 'hh-1',
  },
  {
    id: 'tag-3',
    name: 'Work',
    color: '#10B981',
    transactionCount: 5,
    householdId: 'hh-1',
  },
];

const mockCategoryGroups: BudgetCategoryGroup[] = [
  {
    id: 'group-1',
    name: 'Bills & Utilities',
    sortOrder: 1,
    householdId: 'hh-1',
    categories: [
      {
        id: 'cat-1',
        name: 'Rent',
        groupId: 'group-1',
        budget: 5000,
        isMust: true,
        sortOrder: 1,
        householdId: 'hh-1',
      },
      {
        id: 'cat-2',
        name: 'Electricity',
        groupId: 'group-1',
        budget: 400,
        isMust: true,
        sortOrder: 2,
        householdId: 'hh-1',
      },
    ],
  },
  {
    id: 'group-2',
    name: 'Living Expenses',
    sortOrder: 2,
    householdId: 'hh-1',
    categories: [
      {
        id: 'cat-3',
        name: 'Groceries',
        groupId: 'group-2',
        budget: 3000,
        isMust: true,
        sortOrder: 1,
        householdId: 'hh-1',
      },
      {
        id: 'cat-4',
        name: 'Dining Out',
        groupId: 'group-2',
        budget: 800,
        isMust: false,
        sortOrder: 2,
        householdId: 'hh-1',
      },
    ],
  },
];

const createMockTransaction = (overrides: Partial<BudgetTransaction> = {}): BudgetTransaction => ({
  id: `tx-${Date.now()}-${Math.random()}`,
  type: 'expense',
  transactionDate: '2024-06-15',
  paymentDate: '2024-06-15',
  amountIls: 100,
  currency: 'ILS',
  amountOriginal: 100,
  categoryId: 'cat-1',
  payeeId: 'payee-1',
  paymentMethod: 'credit_card',
  paymentNumber: null,
  totalPayments: null,
  notes: null,
  source: 'manual',
  isRecurring: false,
  isSplit: false,
  originalTransactionId: null,
  profileId: null,
  householdId: 'hh-1',
  tagIds: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const defaultProps = {
  categoryGroups: mockCategoryGroups,
  payees: mockPayees,
  tags: mockTags,
  isSelected: false,
  onSelect: jest.fn(),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onSplit: jest.fn(),
};

describe('TransactionRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUpdateTransaction.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      mutateAsync: jest.fn(),
      reset: jest.fn(),
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isError: false,
      isIdle: true,
      isPaused: false,
      isSuccess: false,
      status: 'idle',
      variables: undefined,
      submittedAt: 0,
    } as ReturnType<typeof UseUpdateTransactionType>);
  });

  describe('Basic rendering', () => {
    it('should render without crashing', () => {
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      expect(screen.getByRole('row')).toBeInTheDocument();
    });

    it('should display transaction date', () => {
      const transaction = createMockTransaction({ transactionDate: '2024-06-15' });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      // Date appears in both desktop (hidden td) and mobile (visible div)
      const dateElements = screen.getAllByText('15/06/2024');
      expect(dateElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should display payee name', () => {
      const transaction = createMockTransaction({ payeeId: 'payee-1' });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      expect(screen.getByText('Test Payee')).toBeInTheDocument();
    });

    it('should display "Unknown" for missing payee', () => {
      const transaction = createMockTransaction({ payeeId: null });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('should display expense amount with minus sign', () => {
      const transaction = createMockTransaction({ type: 'expense', amountIls: 100 });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      const row = screen.getByRole('row');
      expect(row.textContent).toContain('-');
    });

    it('should display income amount with plus sign and green color', () => {
      const transaction = createMockTransaction({ type: 'income', amountIls: 1000 });
      const { container } = render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      const row = screen.getByRole('row');
      expect(row.textContent).toContain('+');
      expect(container.querySelector('.text-green-500')).toBeInTheDocument();
    });

    it('should display notes when present', () => {
      const transaction = createMockTransaction({ notes: 'Weekly groceries' });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      expect(screen.getByText('Weekly groceries')).toBeInTheDocument();
    });
  });

  describe('Checkbox selection', () => {
    it('should render checkbox', () => {
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });

    it('should show unchecked when not selected', () => {
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} isSelected={false} />
          </tbody>
        </table>
      );
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('should show checked when selected', () => {
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} isSelected={true} />
          </tbody>
        </table>
      );
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('should call onSelect when checkbox is clicked', () => {
      const onSelect = jest.fn();
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} onSelect={onSelect} />
          </tbody>
        </table>
      );
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(onSelect).toHaveBeenCalledWith(true);
    });
  });

  describe('Tags display', () => {
    it('should display transaction tags', () => {
      const transaction = createMockTransaction({ tagIds: ['tag-1', 'tag-2'] });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      expect(screen.getByText('Essential')).toBeInTheDocument();
      expect(screen.getByText('Fun')).toBeInTheDocument();
    });

    it('should show at most 2 tags visually plus count', () => {
      const transaction = createMockTransaction({ tagIds: ['tag-1', 'tag-2', 'tag-3'] });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      expect(screen.getByText('Essential')).toBeInTheDocument();
      expect(screen.getByText('Fun')).toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('should not show overflow count when 2 or fewer tags', () => {
      const transaction = createMockTransaction({ tagIds: ['tag-1', 'tag-2'] });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument();
    });

    it('should apply tag colors', () => {
      const transaction = createMockTransaction({ tagIds: ['tag-1'] });
      const { container } = render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      const tagBadge = container.querySelector('[style*="background-color"]');
      expect(tagBadge).toHaveStyle({ backgroundColor: '#EF4444' });
    });
  });

  describe('Category dropdown', () => {
    it('should render two category select triggers (desktop and mobile)', () => {
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      // Radix Select uses combobox role for the trigger
      const triggers = screen.getAllByRole('combobox');
      expect(triggers).toHaveLength(2);
    });

    it('should show current category name in the trigger', () => {
      const transaction = createMockTransaction({ categoryId: 'cat-3' });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      // Category cat-3 is "Groceries" in our mock data
      expect(screen.getAllByText('Groceries')).toHaveLength(2);
    });

    it('should show "Uncategorized" when no category is selected for expense', () => {
      const transaction = createMockTransaction({ categoryId: null, type: 'expense' });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      // Both triggers should show "Uncategorized"
      expect(screen.getAllByText('Uncategorized')).toHaveLength(2);
    });

    it('should show "Income" when no category is selected for income', () => {
      const transaction = createMockTransaction({ categoryId: null, type: 'income' });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      expect(screen.getAllByText('Income')).toHaveLength(2);
    });

    it('should have correct aria-label for accessibility', () => {
      const transaction = createMockTransaction({ payeeId: 'payee-1' });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      const triggers = screen.getAllByRole('combobox');
      expect(triggers[0]).toHaveAttribute('aria-label', 'Select category for Test Payee');
      expect(triggers[1]).toHaveAttribute('aria-label', 'Select category for Test Payee');
    });
  });

  describe('Pending state during mutation', () => {
    it('should disable dropdowns when mutation is pending', () => {
      mockUseUpdateTransaction.mockReturnValue({
        mutate: mockMutate,
        isPending: true,
        mutateAsync: jest.fn(),
        reset: jest.fn(),
        context: undefined,
        data: undefined,
        error: null,
        failureCount: 0,
        failureReason: null,
        isError: false,
        isIdle: false,
        isPaused: false,
        isSuccess: false,
        status: 'pending',
        variables: { id: 'tx-123', categoryId: 'cat-1' },
        submittedAt: Date.now(),
      } as ReturnType<typeof UseUpdateTransactionType>);

      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      const triggers = screen.getAllByRole('combobox');
      expect(triggers[0]).toBeDisabled();
      expect(triggers[1]).toBeDisabled();
    });

    it('should not be disabled when mutation is not pending', () => {
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      const triggers = screen.getAllByRole('combobox');
      expect(triggers[0]).not.toBeDisabled();
      expect(triggers[1]).not.toBeDisabled();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty category groups', () => {
      const transaction = createMockTransaction({ categoryId: null });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} categoryGroups={[]} />
          </tbody>
        </table>
      );
      // Should render without crashing
      expect(screen.getByRole('row')).toBeInTheDocument();
    });

    it('should handle empty payees array', () => {
      const transaction = createMockTransaction({ payeeId: 'payee-1' });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} payees={[]} />
          </tbody>
        </table>
      );
      // Should show "Unknown" for the payee
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('should handle empty tags array', () => {
      const transaction = createMockTransaction({ tagIds: ['tag-1'] });
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} tags={[]} />
          </tbody>
        </table>
      );
      // Should render without crashing, no tag badges shown
      expect(screen.getByRole('row')).toBeInTheDocument();
    });
  });

  describe('Actions menu', () => {
    it('should render actions dropdown button', () => {
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    });

    it('should have proper accessible name for actions button', () => {
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      const actionsButton = screen.getByRole('button', { name: /open menu/i });
      expect(actionsButton).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have hover styles on row', () => {
      const transaction = createMockTransaction();
      render(
        <table>
          <tbody>
            <TransactionRow transaction={transaction} {...defaultProps} />
          </tbody>
        </table>
      );
      const row = screen.getByRole('row');
      expect(row.className).toContain('hover:bg-muted');
    });
  });
});
