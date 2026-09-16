'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { usePageShare, useSharePage, useUnsharePage } from '@/lib/hooks/use-pages';

/**
 * Turns public link-sharing on/off for a page, and picks view vs edit access.
 * Fetches its own share state via `usePageShare` (only while open) rather
 * than trusting a `shareToken` prop off the general page payload — that
 * payload deliberately never carries the raw token (see use-pages.ts).
 */
export function SharePageDialog({
  open,
  onOpenChange,
  pageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
}) {
  const { data: info, isLoading } = usePageShare(pageId, { enabled: open });
  const share = useSharePage();
  const unshare = useUnsharePage();
  const [copied, setCopied] = useState(false);

  const shareToken = info?.shareToken ?? null;
  const isShared = !!shareToken;
  const access = info?.shareAccess ?? 'view';
  const url =
    shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/share/${shareToken}`
      : '';
  const pending = share.isPending || unshare.isPending;

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Share this page</DialogTitle>
          <DialogDescription>
            Anyone with the link can open it — no account needed.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium">Share via link</span>
              <Switch
                checked={isShared}
                disabled={pending}
                onCheckedChange={(checked) => {
                  if (checked) share.mutate({ id: pageId, input: { access } });
                  else unshare.mutate(pageId);
                }}
              />
            </div>

            {isShared && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {(['view', 'edit'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (mode !== access) share.mutate({ id: pageId, input: { access: mode } });
                      }}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm capitalize',
                        access === mode
                          ? 'border-primary/60 bg-primary/10 text-primary'
                          : 'border-border/60 hover:bg-muted/50'
                      )}
                    >
                      {mode === 'view' ? 'Can view' : 'Can edit'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="border-border/60 bg-muted/30 flex-1 truncate rounded-lg border px-3 py-2 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={copy}
                    aria-label="Copy link"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

                <button
                  type="button"
                  disabled={pending}
                  onClick={() => share.mutate({ id: pageId, input: { access, regenerate: true } })}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
                >
                  {share.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Regenerate link (the old one stops working)
                </button>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
