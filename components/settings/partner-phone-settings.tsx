'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PartnerPhoneSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['settings', 'partner-phone'],
    queryFn: async () => {
      const res = await fetch('/api/settings/partner-phone');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as { phone: string | null };
    },
  });

  // `null` means "not edited yet — display the server value". Once the user
  // types, we switch to a controlled string. This avoids a useEffect that
  // syncs server data into state (which the lint rule rightly flags).
  const [edited, setEdited] = useState<string | null>(null);
  const serverValue = query.data?.phone ?? '';
  const value = edited ?? serverValue;

  const save = useMutation({
    mutationFn: async (phone: string | null) => {
      const res = await fetch('/api/settings/partner-phone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as { phone: string | null };
    },
    onSuccess: () => {
      setEdited(null);
      qc.invalidateQueries({ queryKey: ['settings', 'partner-phone'] });
    },
  });

  const trimmed = value.trim();
  const dirty = trimmed !== serverValue;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Partner phone number</p>
      <p className="text-muted-foreground text-xs">
        Used by the &quot;Ask partner on WhatsApp&quot; button on a transaction. Enter in
        international format, e.g. <code>+972501234567</code>, or local Israeli format starting with{' '}
        <code>0</code>.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(trimmed === '' ? null : trimmed);
        }}
      >
        <Input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => setEdited(e.target.value)}
          placeholder="+972501234567"
          className="flex-1 text-sm"
          disabled={query.isLoading}
        />
        <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </form>
      {save.isError && <p className="text-xs text-red-500">{(save.error as Error).message}</p>}
      {save.isSuccess && !dirty && <p className="text-xs text-green-500">Saved.</p>}
    </div>
  );
}
