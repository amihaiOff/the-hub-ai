/**
 * Unit tests for CategoryTransactionsMini component
 * Tests table format rendering, transaction display, and sorting
 */

import { render, screen } from '@testing-library/react';
import type { BudgetTransaction, BudgetPayee } from '@/lib/utils/budget';

// Mock the budget utilities
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

// Import after mocks
import { CategoryTransactionsMini } from '../category-transactions-mini';

const mockPayees: BudgetPayee[] = [
  {
    id: 'payee-1',
    name: 'Supermarket A',
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

describe('CategoryTransactionsMini', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Empty state', () => {
    it('should display empty message when no transactions', () => {
      render(<CategoryTransactionsMini transactions={[]} payees={mockPayees} />);
      expect(screen.getByText('No transactions in this category')).toBeInTheDocument();
    });
  });

  describe('Table structure', () => {
    it('should render as a proper table', () => {
      const transactions = [createMockTransaction()];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('should have correct table headers', () => {
      const transactions = [createMockTransaction()];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Payee')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });

    it('should have hidden columns for responsive design', () => {
      const transactions = [createMockTransaction()];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      // Method column should have responsive hiding
      const methodHeader = screen.getByText('Method');
      expect(methodHeader.closest('th')?.className).toContain('hidden');
      expect(methodHeader.closest('th')?.className).toContain('sm:table-cell');

      // Notes column should also have responsive hiding
      const notesHeader = screen.getByText('Notes');
      expect(notesHeader.closest('th')?.className).toContain('hidden');
      expect(notesHeader.closest('th')?.className).toContain('lg:table-cell');
    });
  });

  describe('Transaction display', () => {
    it('should display transaction date correctly', () => {
      const transactions = [createMockTransaction({ transactionDate: '2024-06-15' })];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.getByText('15/06/2024')).toBeInTheDocument();
    });

    it('should display payee name correctly', () => {
      const transactions = [createMockTransaction({ payeeId: 'payee-1' })];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.getByText('Supermarket A')).toBeInTheDocument();
    });

    it('should display "Unknown" for missing payee', () => {
      const transactions = [createMockTransaction({ payeeId: null })];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('should display expense amount with minus sign', () => {
      const transactions = [createMockTransaction({ type: 'expense', amountIls: 100 })];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      // Find the amount cell using the table structure
      const table = screen.getByRole('table');
      const rows = table.querySelectorAll('tbody tr');
      const amountCell = rows[0].querySelector('td:last-child');
      expect(amountCell?.textContent).toContain('-');
    });

    it('should display income amount with plus sign and green color', () => {
      const transactions = [createMockTransaction({ type: 'income', amountIls: 1000 })];
      const { container } = render(
        <CategoryTransactionsMini transactions={transactions} payees={mockPayees} />
      );

      const amountCell = container.querySelector('td:last-child');
      expect(amountCell?.textContent).toContain('+');
      expect(amountCell?.querySelector('.text-green-500')).toBeInTheDocument();
    });

    it('should display payment method', () => {
      const transactions = [createMockTransaction({ paymentMethod: 'credit_card' })];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.getByText('credit_card')).toBeInTheDocument();
    });

    it('should display installment info when present', () => {
      const transactions = [
        createMockTransaction({
          paymentNumber: 2,
          totalPayments: 6,
        }),
      ];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.getByText('(2/6)')).toBeInTheDocument();
    });

    it('should display notes when present', () => {
      const transactions = [createMockTransaction({ notes: 'Weekly groceries' })];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.getByText('Weekly groceries')).toBeInTheDocument();
    });

    it('should display dash for empty notes', () => {
      const transactions = [createMockTransaction({ notes: null })];
      const { container } = render(
        <CategoryTransactionsMini transactions={transactions} payees={mockPayees} />
      );

      // Find the notes cell (4th td in the row)
      const notesCell = container.querySelector('tbody tr td:nth-child(4)');
      expect(notesCell?.textContent).toBe('\u2014'); // em dash
    });
  });

  describe('Transaction sorting', () => {
    it('should sort transactions by date descending (newest first)', () => {
      const transactions = [
        createMockTransaction({ id: 'tx-1', transactionDate: '2024-06-10', notes: 'First' }),
        createMockTransaction({ id: 'tx-2', transactionDate: '2024-06-20', notes: 'Third' }),
        createMockTransaction({ id: 'tx-3', transactionDate: '2024-06-15', notes: 'Second' }),
      ];
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      const rows = screen.getAllByRole('row').slice(1); // Skip header row
      expect(rows[0].textContent).toContain('20/06/2024');
      expect(rows[1].textContent).toContain('15/06/2024');
      expect(rows[2].textContent).toContain('10/06/2024');
    });
  });

  describe('Transaction limiting', () => {
    it('should limit to 5 transactions', () => {
      const transactions = Array.from({ length: 10 }, (_, i) =>
        createMockTransaction({
          id: `tx-${i}`,
          transactionDate: `2024-06-${String(i + 1).padStart(2, '0')}`,
        })
      );
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      const rows = screen.getAllByRole('row').slice(1); // Skip header
      expect(rows).toHaveLength(5);
    });

    it('should show "more transactions" indicator when more than 5', () => {
      const transactions = Array.from({ length: 8 }, (_, i) =>
        createMockTransaction({
          id: `tx-${i}`,
          transactionDate: `2024-06-${String(i + 1).padStart(2, '0')}`,
        })
      );
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.getByText('+3 more transactions')).toBeInTheDocument();
    });

    it('should not show "more" indicator when exactly 5 transactions', () => {
      const transactions = Array.from({ length: 5 }, (_, i) =>
        createMockTransaction({
          id: `tx-${i}`,
          transactionDate: `2024-06-${String(i + 1).padStart(2, '0')}`,
        })
      );
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.queryByText(/more transactions/)).not.toBeInTheDocument();
    });

    it('should not show "more" indicator when fewer than 5 transactions', () => {
      const transactions = Array.from({ length: 3 }, (_, i) =>
        createMockTransaction({
          id: `tx-${i}`,
          transactionDate: `2024-06-${String(i + 1).padStart(2, '0')}`,
        })
      );
      render(<CategoryTransactionsMini transactions={transactions} payees={mockPayees} />);

      expect(screen.queryByText(/more transactions/)).not.toBeInTheDocument();
    });
  });

  describe('Row hover state', () => {
    it('should have hover class on transaction rows', () => {
      const transactions = [createMockTransaction()];
      const { container } = render(
        <CategoryTransactionsMini transactions={transactions} payees={mockPayees} />
      );

      const dataRow = container.querySelector('tbody tr');
      expect(dataRow?.className).toContain('hover:bg-muted');
    });
  });

  describe('Tabular numbers', () => {
    it('should use tabular-nums class for date column', () => {
      const transactions = [createMockTransaction()];
      const { container } = render(
        <CategoryTransactionsMini transactions={transactions} payees={mockPayees} />
      );

      const dateCell = container.querySelector('tbody tr td:first-child');
      expect(dateCell?.className).toContain('tabular-nums');
    });

    it('should use tabular-nums class for amount column', () => {
      const transactions = [createMockTransaction()];
      const { container } = render(
        <CategoryTransactionsMini transactions={transactions} payees={mockPayees} />
      );

      const amountCell = container.querySelector('tbody tr td:last-child');
      expect(amountCell?.className).toContain('tabular-nums');
    });
  });
});
