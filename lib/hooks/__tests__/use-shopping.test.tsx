/**
 * Unit tests for use-shopping.ts hooks
 * Tests React Query hooks for shopping list operations
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useShoppingCategories,
  useShoppingItems,
  useShoppingCart,
  useShoppingWarnings,
  useCreateShoppingCategory,
  useCreateShoppingItem,
  useDeleteShoppingItem,
  useAddToCart,
  useToggleCartItem,
  useUpdateCartQuantity,
  useRemoveFromCart,
  useClearCheckedItems,
  useUpdateShoppingItem,
  useDeliverCart,
  type ShoppingCategory,
  type ShoppingItem,
  type ShoppingCartItem,
  type ShoppingWarningItem,
} from '../use-shopping';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Wrapper component for React Query hooks
function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const mockCategories: ShoppingCategory[] = [
  { id: 'cat-1', name: 'Produce', sortOrder: 1 },
  { id: 'cat-2', name: 'Dairy', sortOrder: 2 },
];

const mockItems: ShoppingItem[] = [
  {
    id: 'item-1',
    name: 'Milk',
    nameHe: 'חלב',
    categoryId: 'cat-2',
    categoryName: 'Dairy',
    isDefault: true,
    lastPurchasedAt: '2026-06-01T00:00:00.000Z',
    warningDays: 7,
    inCart: false,
  },
  {
    id: 'item-2',
    name: 'Apples',
    nameHe: null,
    categoryId: 'cat-1',
    categoryName: 'Produce',
    isDefault: false,
    lastPurchasedAt: null,
    warningDays: null,
    inCart: true,
  },
];

const mockCartItems: ShoppingCartItem[] = [
  {
    id: 'cart-1',
    itemId: 'item-2',
    itemName: 'Apples',
    categoryId: 'cat-1',
    categoryName: 'Produce',
    quantity: 2,
    checked: false,
  },
];

const mockWarnings: ShoppingWarningItem[] = [
  {
    id: 'item-1',
    name: 'Milk',
    nameHe: 'חלב',
    categoryName: 'Dairy',
    daysSinceLastPurchase: 10,
    warningDays: 7,
  },
];

describe('Shopping Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── Query hooks ────────────────────────────────────────────────────────────

  describe('useShoppingCategories', () => {
    it('should fetch categories successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockCategories }),
      });

      const { result } = renderHook(() => useShoppingCategories(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockCategories);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/categories',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Unauthorized' }),
      });

      const { result } = renderHook(() => useShoppingCategories(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Unauthorized');
    });
  });

  describe('useShoppingItems', () => {
    it('should fetch items without search filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockItems }),
      });

      const { result } = renderHook(() => useShoppingItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockItems);
      expect(mockFetch).toHaveBeenCalledWith('/api/shopping/items', expect.any(Object));
    });

    it('should fetch items with search filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [mockItems[0]] }),
      });

      const { result } = renderHook(() => useShoppingItems('milk'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith('/api/shopping/items?search=milk', expect.any(Object));
    });

    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useShoppingItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useShoppingCart', () => {
    it('should fetch cart items successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockCartItems }),
      });

      const { result } = renderHook(() => useShoppingCart(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockCartItems);
      expect(mockFetch).toHaveBeenCalledWith('/api/shopping/cart', expect.any(Object));
    });

    it('should handle API failure for cart', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Not found' }),
      });

      const { result } = renderHook(() => useShoppingCart(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useShoppingWarnings', () => {
    it('should fetch warning items successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockWarnings }),
      });

      const { result } = renderHook(() => useShoppingWarnings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockWarnings);
      expect(mockFetch).toHaveBeenCalledWith('/api/shopping/items/warnings', expect.any(Object));
    });
  });

  // ─── Mutation hooks ──────────────────────────────────────────────────────────

  describe('useCreateShoppingCategory', () => {
    it('should create a category successfully', async () => {
      const newCategory: ShoppingCategory = { id: 'cat-3', name: 'Bakery', sortOrder: 3 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: newCategory }),
      });

      const { result } = renderHook(() => useCreateShoppingCategory(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const created = await result.current.mutateAsync({ name: 'Bakery' });
        expect(created).toEqual(newCategory);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/categories',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Bakery' }),
        })
      );
    });

    it('should handle creation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Category already exists' }),
      });

      const { result } = renderHook(() => useCreateShoppingCategory(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ name: 'Dairy' });
        })
      ).rejects.toThrow('Category already exists');
    });
  });

  describe('useCreateShoppingItem', () => {
    it('should create an item successfully', async () => {
      const newItem = mockItems[0];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: newItem }),
      });

      const { result } = renderHook(() => useCreateShoppingItem(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const created = await result.current.mutateAsync({
          name: 'Milk',
          categoryId: 'cat-2',
          nameHe: 'חלב',
          isDefault: true,
          warningDays: 7,
        });
        expect(created).toEqual(newItem);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/items',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle error when creating item', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Invalid category' }),
      });

      const { result } = renderHook(() => useCreateShoppingItem(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ name: 'Bread', categoryId: 'invalid' });
        })
      ).rejects.toThrow('Invalid category');
    });
  });

  describe('useDeleteShoppingItem', () => {
    it('should delete an item successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'item-1' } }),
      });

      const { result } = renderHook(() => useDeleteShoppingItem(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('item-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/items/item-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('useAddToCart', () => {
    it('should add item to cart successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockCartItems[0] }),
      });

      const { result } = renderHook(() => useAddToCart(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const cartItem = await result.current.mutateAsync({ itemId: 'item-2', quantity: 2 });
        expect(cartItem).toEqual(mockCartItems[0]);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/cart',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ itemId: 'item-2', quantity: 2 }),
        })
      );
    });

    it('should add item without specifying quantity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { ...mockCartItems[0], quantity: 1 } }),
      });

      const { result } = renderHook(() => useAddToCart(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ itemId: 'item-2' });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/cart',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ itemId: 'item-2' }),
        })
      );
    });
  });

  describe('useToggleCartItem', () => {
    it('should toggle cart item checked status successfully', async () => {
      const toggledItem: ShoppingCartItem = { ...mockCartItems[0], checked: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: toggledItem }),
      });

      const { result } = renderHook(() => useToggleCartItem(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const updated = await result.current.mutateAsync({ id: 'cart-1', checked: true });
        expect(updated).toEqual(toggledItem);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/cart/cart-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ checked: true }),
        })
      );
    });

    it('should handle toggle error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Item not found' }),
      });

      const { result } = renderHook(() => useToggleCartItem(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ id: 'nonexistent', checked: true });
        })
      ).rejects.toThrow('Item not found');
    });
  });

  describe('useUpdateCartQuantity', () => {
    it('should update cart item quantity successfully', async () => {
      const updatedItem: ShoppingCartItem = { ...mockCartItems[0], quantity: 5 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: updatedItem }),
      });

      const { result } = renderHook(() => useUpdateCartQuantity(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const updated = await result.current.mutateAsync({ id: 'cart-1', quantity: 5 });
        expect(updated).toEqual(updatedItem);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/cart/cart-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ quantity: 5 }),
        })
      );
    });
  });

  describe('useRemoveFromCart', () => {
    it('should remove item from cart successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'cart-1' } }),
      });

      const { result } = renderHook(() => useRemoveFromCart(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('cart-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/cart/cart-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('useClearCheckedItems', () => {
    it('should clear checked items from cart successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { cleared: 3 } }),
      });

      const { result } = renderHook(() => useClearCheckedItems(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/cart',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('useUpdateShoppingItem', () => {
    it('should update a shopping item successfully', async () => {
      const updatedItem = { ...mockItems[0], name: 'Whole Milk' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: updatedItem }),
      });

      const { result } = renderHook(() => useUpdateShoppingItem(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const updated = await result.current.mutateAsync({ id: 'item-1', name: 'Whole Milk' });
        expect(updated).toEqual(updatedItem);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/items/item-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Whole Milk' }),
        })
      );
    });

    it('should update warningDays to null', async () => {
      const updatedItem = { ...mockItems[0], warningDays: null };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: updatedItem }),
      });

      const { result } = renderHook(() => useUpdateShoppingItem(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ id: 'item-1', warningDays: null });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/items/item-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ warningDays: null }),
        })
      );
    });
  });

  describe('useDeliverCart', () => {
    it('should deliver cart successfully', async () => {
      const deliveryResult = { delivered: 3, keptForNext: 1, defaultsAdded: 2 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: deliveryResult }),
      });

      const { result } = renderHook(() => useDeliverCart(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const res = await result.current.mutateAsync({ missingItemIds: ['item-3'] });
        expect(res).toEqual(deliveryResult);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/cart/deliver',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ missingItemIds: ['item-3'] }),
        })
      );
    });

    it('should deliver cart without missing items', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { delivered: 5, keptForNext: 0, defaultsAdded: 3 },
        }),
      });

      const { result } = renderHook(() => useDeliverCart(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({});
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shopping/cart/deliver',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ─── Cache invalidation ──────────────────────────────────────────────────────

  describe('Cache Invalidation', () => {
    it('should invalidate categories cache after creating category', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'cat-3', name: 'Bakery', sortOrder: 3 } }),
      });

      const { result } = renderHook(() => useCreateShoppingCategory(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ name: 'Bakery' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['shopping', 'categories']) })
      );
    });

    it('should invalidate cart cache after adding to cart', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockCartItems[0] }),
      });

      const { result } = renderHook(() => useAddToCart(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ itemId: 'item-2' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['shopping', 'cart']) })
      );
    });
  });
});
