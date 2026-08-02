'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AccountNamesSettings } from '@/components/budget';
import { PartnerPhoneSettings } from '@/components/settings/partner-phone-settings';
import { BillingCycleSettings } from '@/components/settings/billing-cycle-settings';
import { SnapshotDaySettings } from '@/components/settings/snapshot-day-settings';
import { AiCategorizationSettings } from '@/components/settings/ai-categorization-settings';

function useCcGenericPayees() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['cc-generic-payees'],
    queryFn: async () => {
      const res = await fetch('/api/budget/cc-generic-payees');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as { id: string; name: string }[];
    },
  });

  const add = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/budget/cc-generic-payees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cc-generic-payees'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/budget/cc-generic-payees/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cc-generic-payees'] }),
  });

  return { query, add, remove };
}

export default function BudgetSettingsPage() {
  const { query: ccQuery, add: ccAdd, remove: ccRemove } = useCcGenericPayees();
  const [newCcName, setNewCcName] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="page-title text-4xl font-bold tracking-tight">Budget Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generic credit card payee names</CardTitle>
          <CardDescription>
            Foreign purchases appear twice — once from your bank (generic name) and once from your
            credit card feed (real merchant). Add the generic names your bank uses so they are
            automatically removed when the real transaction exists with the same amount.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ccQuery.isLoading && (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          )}
          {ccQuery.data?.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span>{item.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
                onClick={() => ccRemove.mutate(item.id)}
                disabled={ccRemove.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {ccQuery.data?.length === 0 && (
            <p className="text-muted-foreground text-xs">No names configured yet.</p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newCcName.trim();
              if (!trimmed) return;
              ccAdd.mutate(trimmed, { onSuccess: () => setNewCcName('') });
            }}
          >
            <Input
              value={newCcName}
              onChange={(e) => setNewCcName(e.target.value)}
              placeholder="e.g. מקס איט פיננסים"
              className="flex-1 text-sm"
            />
            <Button type="submit" size="sm" disabled={ccAdd.isPending || !newCcName.trim()}>
              {ccAdd.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </form>
          {ccAdd.isError && (
            <p className="text-destructive text-xs">{(ccAdd.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <AccountNamesSettings />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <PartnerPhoneSettings />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <BillingCycleSettings />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <SnapshotDaySettings />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <AiCategorizationSettings />
        </CardContent>
      </Card>
    </div>
  );
}
