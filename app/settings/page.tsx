'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Home, Users, ChevronRight, Download, Upload, Loader2 } from 'lucide-react';
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

export default function SettingsPage() {
  const { activeHousehold, isLoading } = useHouseholdContext();
  const queryClient = useQueryClient();
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
        <h1 className="text-2xl font-bold">Settings</h1>
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
        <h1 className="text-2xl font-bold">Settings</h1>
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
