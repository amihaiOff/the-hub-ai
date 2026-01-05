'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Building2, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DepositsTable } from './deposits-table';
import { AddDepositDialog } from './add-deposit-dialog';
import { EditAccountDialog } from './edit-account-dialog';
import { DeleteConfirmDialog } from '@/components/portfolio/delete-confirm-dialog';
import { useDeletePensionAccount } from '@/lib/hooks/use-pension';
import {
  formatCurrency,
  formatFeePercent,
  getAccountTypeName,
  type PensionAccountSummary,
} from '@/lib/utils/pension';

interface AccountCardProps {
  account: PensionAccountSummary;
}

export function AccountCard({ account }: AccountCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteAccount = useDeletePensionAccount();

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="px-3 pb-3 sm:px-6">
          {/* Row 1: Account info (left) + Value (right, prominent) */}
          <div className="flex items-start justify-between">
            <CollapsibleTrigger asChild>
              <button
                className="flex items-center gap-2 text-left hover:opacity-80"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${account.accountName} account details`}
              >
                {isOpen ? (
                  <ChevronDown className="text-muted-foreground h-4 w-4" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-4 w-4" />
                )}
                <div>
                  <CardTitle className="text-lg">{account.accountName}</CardTitle>
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Building2 className="h-3 w-3" />
                    {account.providerName}
                  </div>
                </div>
              </button>
            </CollapsibleTrigger>
            <div className="text-right">
              <div className="text-xl font-bold tabular-nums sm:text-2xl">
                {formatCurrency(account.currentValue)}
              </div>
              <Badge variant="outline" className="border-primary/50 text-primary">
                {getAccountTypeName(account.type)}
              </Badge>
            </div>
          </div>

          {/* Row 2: Stats (left) + Action buttons (right) */}
          <div className="border-border/50 mt-3 flex items-center justify-between border-t pt-3">
            {/* Stats */}
            <div className="text-muted-foreground flex items-center gap-4 text-sm">
              <div>
                <span className="text-foreground font-medium">{account.depositsCount}</span>{' '}
                deposits
              </div>
              <div className="hidden sm:block">
                Fees: {formatFeePercent(account.feeFromDeposit)} /{' '}
                {formatFeePercent(account.feeFromTotal)}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              <AddDepositDialog accountId={account.id} accountName={account.accountName} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Account options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Dialogs */}
          <EditAccountDialog
            accountId={account.id}
            providerName={account.providerName}
            accountName={account.accountName}
            currentValue={account.currentValue}
            feeFromDeposit={account.feeFromDeposit}
            feeFromTotal={account.feeFromTotal}
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
          />
          <DeleteConfirmDialog
            title={`Delete ${account.accountName}?`}
            description={`This will permanently delete the account "${account.accountName}" and all its deposits. This action cannot be undone.`}
            onConfirm={() => deleteAccount.mutateAsync(account.id)}
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          />
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="mb-4">
              <div className="text-muted-foreground text-sm">
                Total deposited:{' '}
                <span className="text-foreground font-medium">
                  {formatCurrency(account.totalDeposits)}
                </span>
              </div>
            </div>
            <DepositsTable deposits={account.deposits} accountId={account.id} />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
