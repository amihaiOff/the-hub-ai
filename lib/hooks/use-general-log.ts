import { useQuery } from '@tanstack/react-query';

interface UnreadCountResponse {
  success: boolean;
  data?: { unreadCount: number };
  error?: string;
}

/**
 * Small poll of the general-log unread count for the nav badge dot.
 * Refetches on window focus so opening the tab clears/updates promptly.
 */
export function useGeneralLogUnreadCount() {
  return useQuery({
    queryKey: ['labs', 'general-log-unread'],
    queryFn: async (): Promise<number> => {
      const res = await fetch('/api/labs/general-log/unread-count');
      const json: UnreadCountResponse = await res.json();
      if (!json.success || !json.data) return 0;
      return json.data.unreadCount;
    },
    // Poll every 5 min so cron-generated events surface without a full reload.
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });
}
