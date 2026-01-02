'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Building2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoldingsTable } from './holdings-table';
import { AddHoldingDialog } from './add-holding-dialog';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { useDeleteAccount } from '@/lib/hooks/use-portfolio';
import { formatCurrency, formatPercent } from '@/lib/utils/portfolio';
import type { AccountSummary } from '@/lib/utils/portfolio';

interface AccountCardProps {
  account: AccountSummary;
}

export function AccountCard({ account }: AccountCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const deleteAccount = useDeleteAccount();
  const isPositive = account.totalGainLoss >= 0;

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-left hover:opacity-80">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <CardTitle className="text-lg">{account.name}</CardTitle>
                  {account.broker && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {account.broker}
                    </div>
                  )}
                </div>
              </button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-lg font-bold tabular-nums">
                  {formatCurrency(account.totalValue)}
                </div>
                <Badge
                  variant="outline"
                  className={
                    isPositive
                      ? 'border-green-500/50 text-green-500'
                      : 'border-red-500/50 text-red-500'
                  }
                >
                  {isPositive ? '+' : ''}
                  {formatPercent(account.totalGainLossPercent)}
                </Badge>
              </div>
              <DeleteConfirmDialog
                title={`Delete ${account.name}?`}
                description={`This will permanently delete the account "${account.name}" and all its holdings. This action cannot be undone.`}
                onConfirm={() => deleteAccount.mutateAsync(account.id)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {account.holdings.length} holding{account.holdings.length !== 1 ? 's' : ''}
              </div>
              <AddHoldingDialog accountId={account.id} accountName={account.name} />
            </div>
            <HoldingsTable holdings={account.holdings} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
