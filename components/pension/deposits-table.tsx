'use client';

import { useState } from 'react';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DeleteConfirmDialog } from '@/components/portfolio/delete-confirm-dialog';
import { EditDepositDialog } from './edit-deposit-dialog';
import { useDeleteDeposit } from '@/lib/hooks/use-pension';
import {
  formatSalaryMonth,
  formatDepositDate,
  formatCurrency,
  type DepositValue,
} from '@/lib/utils/pension';

interface DepositsTableProps {
  deposits: DepositValue[];
  accountId: string;
}

export function DepositsTable({ deposits, accountId }: DepositsTableProps) {
  const [editDeposit, setEditDeposit] = useState<DepositValue | null>(null);
  const [deleteDeposit, setDeleteDeposit] = useState<DepositValue | null>(null);
  const deleteDepositMutation = useDeleteDeposit();

  if (deposits.length === 0) {
    return <div className="text-muted-foreground py-8 text-center">No deposits recorded yet</div>;
  }

  return (
    <>
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Salary Month</TableHead>
              <TableHead className="hidden sm:table-cell">Deposit Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="hidden sm:table-cell">Employer</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deposits.map((deposit) => (
              <TableRow key={deposit.id}>
                <TableCell className="font-medium">
                  {formatSalaryMonth(deposit.salaryMonth)}
                </TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {formatDepositDate(deposit.depositDate)}
                </TableCell>
                <TableCell className="tabular-nums">{formatCurrency(deposit.amount)}</TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {deposit.employer}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Deposit options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditDeposit(deposit)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit deposit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteDeposit(deposit)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete deposit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      {editDeposit && (
        <EditDepositDialog
          depositId={editDeposit.id}
          depositDate={editDeposit.depositDate}
          salaryMonth={editDeposit.salaryMonth}
          amount={editDeposit.amount}
          employer={editDeposit.employer}
          accountId={accountId}
          open={!!editDeposit}
          onOpenChange={(open) => !open && setEditDeposit(null)}
        />
      )}

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        title="Delete Deposit?"
        description={`This will permanently delete the deposit for ${deleteDeposit ? formatSalaryMonth(deleteDeposit.salaryMonth) : ''}. This action cannot be undone.`}
        onConfirm={async () => {
          if (deleteDeposit) {
            await deleteDepositMutation.mutateAsync(deleteDeposit.id);
          }
        }}
        open={!!deleteDeposit}
        onOpenChange={(open) => !open && setDeleteDeposit(null)}
      />
    </>
  );
}
