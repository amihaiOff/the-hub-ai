'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { WikiPromptSettings } from '@/components/settings/wiki-prompt-settings';

export default function WikiPromptSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="page-title text-4xl font-bold tracking-tight">Wiki Prompt</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <WikiPromptSettings />
        </CardContent>
      </Card>
    </div>
  );
}
