import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types

export interface ShoppingCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ShoppingItem {
  id: string;
  name: string;
  nameHe: string | null;
  categoryId: string;
  categoryName: string;
  isDefault: boolean;
  lastPurchasedAt: string | null;
  warningDays: number | null;
  inCart: boolean;
}

export interface ShoppingWarningItem {
  id: string;
  name: string;
  nameHe: string | null;
  categoryName: string;
  daysSinceLastPurchase: number;
  warningDays: number;
}

export interface ShoppingCartItem {
  id: string;
  itemId: string;
  itemName: string;
  categoryId: string;
  categoryName: string;
  quantity: number;
  checked: boolean;
}

// API response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// API helper function
async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data.data as T;
}

// Query keys
export const shoppingKeys = {
  all: ['shopping'] as const,
  categories: () => [...shoppingKeys.all, 'categories'] as const,
  allItems: () => [...shoppingKeys.all, 'items'] as const,
  items: (search?: string) => [...shoppingKeys.all, 'items', search] as const,
  cart: () => [...shoppingKeys.all, 'cart'] as const,
  warnings: () => [...shoppingKeys.all, 'warnings'] as const,
};

// Query hooks

export function useShoppingCategories() {
  return useQuery({
    queryKey: shoppingKeys.categories(),
    queryFn: async (): Promise<ShoppingCategory[]> => {
      return fetchApi<ShoppingCategory[]>('/api/shopping/categories');
    },
    staleTime: 5 * 60 * 1000, // 5 min - categories rarely change
  });
}

export function useShoppingItems(search?: string) {
  return useQuery({
    queryKey: shoppingKeys.items(search),
    queryFn: async (): Promise<ShoppingItem[]> => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const qs = params.toString();
      return fetchApi<ShoppingItem[]>(`/api/shopping/items${qs ? `?${qs}` : ''}`);
    },
    staleTime: 30_000, // 30s
  });
}

export function useShoppingCart() {
  return useQuery({
    queryKey: shoppingKeys.cart(),
    queryFn: async (): Promise<ShoppingCartItem[]> => {
      return fetchApi<ShoppingCartItem[]>('/api/shopping/cart');
    },
    staleTime: 10_000, // 10s - changes frequently
  });
}

// Mutation hooks

export function useCreateShoppingCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string }): Promise<ShoppingCategory> => {
      return fetchApi<ShoppingCategory>('/api/shopping/categories', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.categories() });
    },
  });
}

export function useCreateShoppingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      categoryId: string;
      nameHe?: string;
      isDefault?: boolean;
      warningDays?: number;
    }): Promise<ShoppingItem> => {
      return fetchApi<ShoppingItem>('/api/shopping/items', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.allItems() });
    },
  });
}

export function useDeleteShoppingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi<{ id: string }>(`/api/shopping/items/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.allItems() });
      queryClient.invalidateQueries({ queryKey: shoppingKeys.cart() });
    },
  });
}

export function useAddToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { itemId: string; quantity?: number }): Promise<ShoppingCartItem> => {
      return fetchApi<ShoppingCartItem>('/api/shopping/cart', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.cart() });
      queryClient.invalidateQueries({ queryKey: shoppingKeys.allItems() });
    },
  });
}

export function useToggleCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      checked,
    }: {
      id: string;
      checked: boolean;
    }): Promise<ShoppingCartItem> => {
      return fetchApi<ShoppingCartItem>(`/api/shopping/cart/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ checked }),
      });
    },
    onMutate: async ({ id, checked }) => {
      await queryClient.cancelQueries({ queryKey: shoppingKeys.cart() });
      const previous = queryClient.getQueryData<ShoppingCartItem[]>(shoppingKeys.cart());
      queryClient.setQueryData<ShoppingCartItem[]>(shoppingKeys.cart(), (old) =>
        old?.map((item) => (item.id === id ? { ...item, checked } : item))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(shoppingKeys.cart(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.cart() });
    },
  });
}

export function useUpdateCartQuantity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      quantity,
    }: {
      id: string;
      quantity: number;
    }): Promise<ShoppingCartItem> => {
      return fetchApi<ShoppingCartItem>(`/api/shopping/cart/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity }),
      });
    },
    onMutate: async ({ id, quantity }) => {
      await queryClient.cancelQueries({ queryKey: shoppingKeys.cart() });
      const previous = queryClient.getQueryData<ShoppingCartItem[]>(shoppingKeys.cart());
      queryClient.setQueryData<ShoppingCartItem[]>(shoppingKeys.cart(), (old) =>
        old?.map((item) => (item.id === id ? { ...item, quantity } : item))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(shoppingKeys.cart(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.cart() });
    },
  });
}

export function useRemoveFromCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await fetchApi<{ id: string }>(`/api/shopping/cart/${id}`, {
        method: 'DELETE',
      });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: shoppingKeys.cart() });
      const previous = queryClient.getQueryData<ShoppingCartItem[]>(shoppingKeys.cart());
      queryClient.setQueryData<ShoppingCartItem[]>(shoppingKeys.cart(), (old) =>
        old?.filter((item) => item.id !== id)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(shoppingKeys.cart(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.cart() });
      queryClient.invalidateQueries({ queryKey: shoppingKeys.allItems() });
    },
  });
}

export function useClearCheckedItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      await fetchApi<{ cleared: number }>('/api/shopping/cart', {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.cart() });
      queryClient.invalidateQueries({ queryKey: shoppingKeys.allItems() });
    },
  });
}

export function useUpdateShoppingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      nameHe?: string | null;
      categoryId?: string;
      isDefault?: boolean;
      warningDays?: number | null;
    }): Promise<ShoppingItem> => {
      return fetchApi<ShoppingItem>(`/api/shopping/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.allItems() });
      queryClient.invalidateQueries({ queryKey: shoppingKeys.cart() });
      queryClient.invalidateQueries({ queryKey: shoppingKeys.warnings() });
    },
  });
}

export function useDeliverCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      missingItemIds?: string[];
    }): Promise<{ delivered: number; keptForNext: number; defaultsAdded: number }> => {
      return fetchApi<{ delivered: number; keptForNext: number; defaultsAdded: number }>(
        '/api/shopping/cart/deliver',
        {
          method: 'POST',
          body: JSON.stringify(input),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingKeys.cart() });
      queryClient.invalidateQueries({ queryKey: shoppingKeys.allItems() });
      queryClient.invalidateQueries({ queryKey: shoppingKeys.warnings() });
    },
  });
}

export function useShoppingWarnings() {
  return useQuery({
    queryKey: shoppingKeys.warnings(),
    queryFn: async (): Promise<ShoppingWarningItem[]> => {
      return fetchApi<ShoppingWarningItem[]>('/api/shopping/items/warnings');
    },
    staleTime: 60_000, // 1 min
  });
}
