'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PartnerContact {
  id: string;
  name: string;
  phone: string;
}

export function PartnerPhoneSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['settings', 'partner-contacts'],
    queryFn: async () => {
      const res = await fetch('/api/settings/partner-contacts');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as PartnerContact[];
    },
  });

  const add = useMutation({
    mutationFn: async (input: { name: string; phone: string }) => {
      const res = await fetch('/api/settings/partner-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'partner-contacts'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/partner-contacts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'partner-contacts'] }),
  });

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const canSubmit = newName.trim() !== '' && newPhone.trim() !== '' && !add.isPending;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">WhatsApp contacts</p>
      <p className="text-muted-foreground text-xs">
        Used by the &quot;Ask&quot; button on a transaction. Add one or more people you might
        forward a transaction question to (e.g. spouse, parent). Phone in international format like{' '}
        <code>+972501234567</code> or Israeli local <code>0501234567</code>.
      </p>

      <div className="mt-3 space-y-2">
        {query.isLoading && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        )}
        {query.data?.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{c.name}</div>
              <div className="text-muted-foreground truncate text-xs">{c.phone}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
              onClick={() => remove.mutate(c.id)}
              disabled={remove.isPending}
              aria-label={`Delete ${c.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {query.data?.length === 0 && (
          <p className="text-muted-foreground text-xs">No contacts configured yet.</p>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          add.mutate(
            { name: newName.trim(), phone: newPhone.trim() },
            {
              onSuccess: () => {
                setNewName('');
                setNewPhone('');
              },
            }
          );
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name (e.g. Wife)"
          className="flex-1 text-sm"
        />
        <Input
          type="tel"
          inputMode="tel"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          placeholder="+972501234567"
          className="flex-1 text-sm"
        />
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {add.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </form>
      {add.isError && <p className="text-xs text-red-500">{(add.error as Error).message}</p>}
    </div>
  );
}
