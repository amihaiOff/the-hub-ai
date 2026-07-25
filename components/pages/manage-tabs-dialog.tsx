'use client';

import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCreatePageTab,
  useUpdatePageTab,
  useDeletePageTab,
  type PageTabRow,
} from '@/lib/hooks/use-pages';

interface ManageTabsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  tabs: PageTabRow[];
  activeTabId: string | null;
  onActiveTabChange: (tabId: string) => void;
}

/** Rename, reorder, add and delete a page's tabs. A page keeps ≥1 tab. */
export function ManageTabsDialog({
  open,
  onOpenChange,
  pageId,
  tabs,
  activeTabId,
  onActiveTabChange,
}: ManageTabsDialogProps) {
  const createTab = useCreatePageTab();
  const updateTab = useUpdatePageTab();
  const deleteTab = useDeletePageTab();

  const rename = (tab: PageTabRow, next: string) => {
    const title = next.trim();
    if (title === tab.title) return;
    updateTab.mutate({ pageId, tabId: tab.id, patch: { title } });
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= tabs.length) return;
    if (updateTab.isPending) return;
    const a = tabs[index];
    const b = tabs[target];
    // Swap absolute sortOrder values. Chain the two writes so the second only
    // runs once the first has landed: if the first PATCH fails, the second never
    // fires, so the tabs can't end up sharing a sortOrder.
    updateTab.mutate(
      { pageId, tabId: a.id, patch: { sortOrder: b.sortOrder } },
      {
        onSuccess: () =>
          updateTab.mutate({ pageId, tabId: b.id, patch: { sortOrder: a.sortOrder } }),
      }
    );
  };

  const remove = (tab: PageTabRow) => {
    if (tabs.length <= 1) return;
    deleteTab.mutate(
      { pageId, tabId: tab.id },
      {
        onSuccess: () => {
          if (activeTabId === tab.id) {
            const next = tabs.find((t) => t.id !== tab.id);
            if (next) onActiveTabChange(next.id);
          }
        },
      }
    );
  };

  const add = () => {
    createTab.mutate({ pageId }, { onSuccess: (tab) => onActiveTabChange(tab.id) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Manage tabs</DialogTitle>
          <DialogDescription>Rename, reorder, add or remove this page&apos;s tabs.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {tabs.map((tab, i) => (
            <div key={tab.id} className="flex items-center gap-2">
              <Input
                defaultValue={tab.title}
                placeholder={`Tab ${i + 1}`}
                onBlur={(e) => rename(tab, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="h-9 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-8 w-8"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-8 w-8"
                aria-label="Move down"
                disabled={i === tabs.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive h-8 w-8"
                aria-label="Delete tab"
                disabled={tabs.length <= 1 || deleteTab.isPending}
                onClick={() => remove(tab)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={createTab.isPending}
          className="w-full"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add tab
        </Button>
      </DialogContent>
    </Dialog>
  );
}
