/**
 * Unit tests for CategoryManagerDialog — the modal that lists task categories
 * and lets the user rename, delete (with a confirm step), and add categories.
 *
 * The use-tasks hooks are mocked so the create/update/delete mutations expose
 * a jest.fn `mutate` we can assert against, and useTaskCategories returns a
 * fixed two-row list (Home, Finance).
 *
 * Note on Back handling: the component pushes/pops history entries and clears
 * its sub-row state from a popstate handler. In jsdom history.back() is an
 * async no-op that doesn't fire popstate synchronously, so after Save/Delete
 * the sub-row may not return to view mode within the test. That's expected —
 * these tests assert the MUTATION fired, which is the primary behaviour.
 */

import { render, screen, fireEvent } from '@testing-library/react';

const createMutate = jest.fn();
const updateMutate = jest.fn();
const deleteMutate = jest.fn();

const categories = [
  { id: 'cat-home', name: 'Home', color: null, sortOrder: 0, householdId: 'hh-1' },
  { id: 'cat-finance', name: 'Finance', color: null, sortOrder: 1, householdId: 'hh-1' },
];

jest.mock('@/lib/hooks/use-tasks', () => ({
  useTaskCategories: jest.fn(() => ({ data: categories })),
  useCreateTaskCategory: jest.fn(() => ({ mutate: createMutate, isPending: false })),
  useUpdateTaskCategory: jest.fn(() => ({ mutate: updateMutate, isPending: false })),
  useDeleteTaskCategory: jest.fn(() => ({ mutate: deleteMutate, isPending: false })),
}));

import { CategoryManagerDialog } from '../category-manager-dialog';

function setup() {
  const onOpenChange = jest.fn();
  const utils = render(<CategoryManagerDialog open onOpenChange={onOpenChange} />);
  return { ...utils, onOpenChange };
}

describe('CategoryManagerDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a row for each category name', () => {
    setup();

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Finance' })).toBeInTheDocument();
  });

  it('shows an input pre-filled with the current name when Edit is clicked', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }));

    const input = screen.getByDisplayValue('Home') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls update.mutate with the id and name patch when a rename is saved', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Home' }));
    fireEvent.change(screen.getByDisplayValue('Home'), { target: { value: 'House' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'cat-home', patch: { name: 'House' } },
      expect.anything()
    );
  });

  it('reveals an inline confirm and calls delete.mutate with the id on confirm', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Finance' }));

    expect(screen.getByText('Delete “Finance”?')).toBeInTheDocument();

    // The confirm exposes text buttons (not the icon buttons) named Cancel/Delete.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteMutate).toHaveBeenCalledWith('cat-finance', expect.anything());
  });

  it('shows the New category input and calls create.mutate with the name on save', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));

    const input = screen.getByPlaceholderText('New category');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Health' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(createMutate).toHaveBeenCalledWith({ name: 'Health' }, expect.anything());
  });
});
