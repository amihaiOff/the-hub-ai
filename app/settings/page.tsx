'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Home, Users, ChevronRight, Download, Upload, Loader2, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient as useQC } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHouseholdContext } from '@/lib/contexts/household-context';
import { useQueryClient } from '@tanstack/react-query';
import { AccountNamesSettings } from '@/components/budget';
import { PartnerPhoneSettings } from '@/components/settings/partner-phone-settings';
import { BillingCycleSettings } from '@/components/settings/billing-cycle-settings';
import { SnapshotDaySettings } from '@/components/settings/snapshot-day-settings';
import { AiCategorizationSettings } from '@/components/settings/ai-categorization-settings';
import { SyncAliasesSettings } from '@/components/settings/sync-aliases-settings';

const settingsLinks = [
  {
    href: '/settings/household',
    title: 'Household',
    description: 'Manage household members and roles',
    icon: Home,
  },
  {
    href: '/settings/profiles',
    title: 'Profiles',
    description: 'Manage family member profiles',
    icon: Users,
  },
];

function useCcGenericPayees() {
  const qc = useQC();

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

export default function SettingsPage() {
  const { activeHousehold, isLoading } = useHouseholdContext();
  const queryClient = useQueryClient();
  const { query: ccQuery, add: ccAdd, remove: ccRemove } = useCcGenericPayees();
  const [newCcName, setNewCcName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restoreResult, setRestoreResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const response = await fetch('/api/backup');
      if (!response.ok) {
        throw new Error('Backup failed');
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch
        ? filenameMatch[1]
        : `hub-ai-backup-${new Date().toISOString().split('T')[0]}.zip`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Backup error:', error);
      alert('Failed to create backup. Please try again.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        alert('Please select a valid backup ZIP file');
        return;
      }
      setSelectedFile(file);
      setShowRestoreConfirm(true);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleRestore = async () => {
    if (!selectedFile) return;

    setIsRestoring(true);
    setShowRestoreConfirm(false);
    setRestoreResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/restore', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setRestoreResult({
          success: true,
          message: `Database restored successfully from backup dated ${new Date(data.metadata.backupDate).toLocaleDateString()}`,
        });
        // Invalidate all queries to refresh data
        queryClient.invalidateQueries();
      } else {
        setRestoreResult({
          success: false,
          message: data.error || 'Restore failed',
        });
      }
    } catch (error) {
      console.error('Restore error:', error);
      setRestoreResult({
        success: false,
        message: 'Failed to restore backup. Please try again.',
      });
    } finally {
      setIsRestoring(false);
      setSelectedFile(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl font-bold tracking-tight">Settings</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-muted h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-4xl font-bold tracking-tight">Settings</h1>
        {activeHousehold && <p className="text-muted-foreground">{activeHousehold.name}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settingsLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href}>
              <Card className="hover:bg-muted/50 h-full transition-colors">
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
                    <Icon className="text-primary h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{link.title}</CardTitle>
                    <CardDescription>{link.description}</CardDescription>
                  </div>
                  <ChevronRight className="text-muted-foreground h-5 w-5" />
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Data Management Section */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>Backup and restore your financial data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button onClick={handleBackup} disabled={isBackingUp} className="flex-1">
              {isBackingUp ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isBackingUp ? 'Creating Backup...' : 'Download Backup'}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRestoring}
              className="flex-1"
            >
              {isRestoring ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isRestoring ? 'Restoring...' : 'Restore from Backup'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {restoreResult && (
            <div
              className={`rounded-lg p-3 text-sm ${
                restoreResult.success
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-red-500/10 text-red-500'
              }`}
            >
              {restoreResult.message}
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            Backup includes all users, profiles, accounts, holdings, deposits, and snapshots.
            Restoring will replace all existing data.
          </p>
        </CardContent>
      </Card>

      {/* Budget Settings Section */}
      <Card>
        <CardHeader>
          <CardTitle>Budget Settings</CardTitle>
          <CardDescription>
            Configure how transactions are processed and deduplicated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Generic credit card payee names</p>
            <p className="text-muted-foreground text-xs">
              Foreign purchases appear twice — once from your bank (generic name) and once from your
              credit card feed (real merchant). Add the generic names your bank uses so they are
              automatically removed when the real transaction exists with the same amount.
            </p>

            <div className="mt-3 space-y-2">
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
            </div>

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
              <p className="text-xs text-red-500">{(ccAdd.error as Error).message}</p>
            )}
          </div>

          <div className="border-border/60 border-t pt-4">
            <AccountNamesSettings />
          </div>

          <div className="border-border/60 border-t pt-4">
            <PartnerPhoneSettings />
          </div>

          <div className="border-border/60 border-t pt-4">
            <BillingCycleSettings />
          </div>

          <div className="border-border/60 border-t pt-4">
            <SnapshotDaySettings />
          </div>

          <div className="border-border/60 border-t pt-4">
            <AiCategorizationSettings />
          </div>
        </CardContent>
      </Card>

      {/* Sync Aliases Section */}
      <Card>
        <CardHeader>
          <CardTitle>Data sync</CardTitle>
          <CardDescription>
            Pin stable aliases for each synced entity so re-linked accounts collapse into the same
            row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyncAliasesSettings />
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <Dialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Restore</DialogTitle>
            <DialogDescription>
              This will <span className="font-semibold text-red-500">delete all existing data</span>{' '}
              and replace it with the backup contents.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-3">
            <p className="text-sm">
              <span className="font-medium">Selected file:</span> {selectedFile?.name}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRestoreConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRestore}>
              Yes, Restore Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
