'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SyncAliasesSettings } from '@/components/settings/sync-aliases-settings';

export default function DataSyncSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="page-title text-4xl font-bold tracking-tight">Data Sync</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync Aliases</CardTitle>
          <CardDescription>
            Pin stable aliases for each synced entity so re-linked accounts collapse into the same
            row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyncAliasesSettings />
        </CardContent>
      </Card>
    </div>
  );
}
