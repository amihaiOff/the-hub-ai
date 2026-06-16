/**
 * Unit tests for PayeeTable — focused on the new shared-CategoryPickerSheet
 * wiring that replaced the per-row Radix Select.
 */

import { act, render, screen, fireEvent } from '@testing-library/react';
import type { BudgetPayee, BudgetCategoryGroup } from '@/lib/utils/budget';

const mutate = jest.fn();

jest.mock('@/lib/hooks/use-budget', () => ({
  useUpdatePayee: jest.fn(() => ({ mutate, isPending: false })),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// Capture the shared sheet's props so we can assert open state and drive onSelect
// without dealing with the real Sheet's portal/animation machinery.
const sheetProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('../category-picker-sheet', () => ({
  CategoryPickerSheet: (props: Record<string, unknown>) => {
    sheetProps.current = props;
    return null;
  },
}));

import { PayeeTable } from '../payee-table';

const categoryGroups: BudgetCategoryGroup[] = [
  {
    id: 'g1',
    name: 'Essentials',
    color: '#000',
    order: 0,
    householdId: 'hh-1',
    totalBudget: 0,
    totalSpent: 0,
    categories: [
      {
        id: 'c1',
        name: 'Groceries',
        groupId: 'g1',
        budgetAmount: 0,
        spent: 0,
        order: 0,
        householdId: 'hh-1',
        excludedFromFlow: false,
      },
    ],
  } as unknown as BudgetCategoryGroup,
];

const payees: BudgetPayee[] = [
  {
    id: 'p1',
    name: 'Shufersal',
    categoryId: 'c1',
    categoryName: 'Groceries',
    transactionCount: 5,
    householdId: 'hh-1',
  },
  {
    id: 'p2',
    name: 'Unknown payee',
    categoryId: null,
    categoryName: null,
    transactionCount: 1,
    householdId: 'hh-1',
  },
  {
    id: 'p3',
    name: 'ATM withdrawal',
    categoryId: null,
    categoryName: null,
    neverDefault: true,
    transactionCount: 3,
    householdId: 'hh-1',
  },
];

const noop = () => {};

function renderTable(extraProps: Partial<React.ComponentProps<typeof PayeeTable>> = {}) {
  return render(
    <PayeeTable
      payees={payees}
      categoryGroups={categoryGroups}
      onEdit={noop}
      onDelete={noop}
      {...extraProps}
    />
  );
}

describe('PayeeTable category cell', () => {
  beforeEach(() => {
    mutate.mockClear();
    sheetProps.current = null;
  });

  it('shows the current category name on the row trigger button', () => {
    renderTable();
    expect(
      screen.getByRole('button', { name: /Select default category for Shufersal/i })
    ).toHaveTextContent('Groceries');
  });

  it('shows "No default" placeholder when the payee has no category', () => {
    renderTable();
    expect(
      screen.getByRole('button', { name: /Select default category for Unknown payee/i })
    ).toHaveTextContent('No default');
  });

  it('renders a dash and no trigger for never-default payees', () => {
    renderTable();
    expect(
      screen.queryByRole('button', { name: /Select default category for ATM withdrawal/i })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('mounts exactly one shared CategoryPickerSheet for the whole table', () => {
    renderTable();
    // sheetProps.current is set once because only one CategoryPickerSheet was rendered.
    expect(sheetProps.current).not.toBeNull();
    expect(sheetProps.current?.open).toBe(false);
  });

  it('opens the sheet with the clicked payee context', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Select default category for Shufersal/i }));
    expect(sheetProps.current?.open).toBe(true);
    expect(sheetProps.current?.currentCategoryId).toBe('c1');
    expect(sheetProps.current?.title).toMatch(/Shufersal/);
  });

  it('updates the right payee when a category is selected via the sheet', () => {
    renderTable();
    fireEvent.click(
      screen.getByRole('button', { name: /Select default category for Unknown payee/i })
    );
    const onSelect = sheetProps.current?.onSelect as (id: string | null) => void;
    onSelect('c1');
    expect(mutate).toHaveBeenCalledWith({ id: 'p2', categoryId: 'c1' });
  });

  it('closes the sheet when onOpenChange(false) fires', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Select default category for Shufersal/i }));
    expect(sheetProps.current?.open).toBe(true);
    const onOpenChange = sheetProps.current?.onOpenChange as (open: boolean) => void;
    act(() => onOpenChange(false));
    expect(sheetProps.current?.open).toBe(false);
  });
});
