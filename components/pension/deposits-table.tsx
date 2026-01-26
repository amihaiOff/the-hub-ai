'use client';

import { useState, useMemo } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

  // Get unique years from deposits (sorted descending)
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    deposits.forEach((d) => {
      const date = new Date(d.salaryMonth);
      years.add(date.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [deposits]);

  // Default to most recent year
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    if (availableYears.length > 0) {
      return availableYears[0].toString();
    }
    return 'all';
  });

  // Filter deposits by selected year
  const filteredDeposits = useMemo(() => {
    if (selectedYear === 'all') return deposits;
    const year = parseInt(selectedYear, 10);
    return deposits.filter((d) => {
      const date = new Date(d.salaryMonth);
      return date.getFullYear() === year;
    });
  }, [deposits, selectedYear]);

  if (deposits.length === 0) {
    return <div className="text-muted-foreground py-8 text-center">No deposits recorded yet</div>;
  }

  return (
    <>
      {/* Year filter dropdown */}
      <div className="mb-4 flex justify-end">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[120px]" size="sm" aria-label="Filter deposits by year">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {availableYears.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredDeposits.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center">No deposits for {selectedYear}</div>
      ) : (
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
              {filteredDeposits.map((deposit) => (
                <TableRow key={deposit.id}>
                  <TableCell className="font-medium">
                    {formatSalaryMonth(deposit.salaryMonth)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {formatDepositDate(deposit.depositDate)}
                  </TableCell>
                  <TableCell className={`tabular-nums ${deposit.amount < 0 ? 'text-red-500' : ''}`}>
                    {formatCurrency(deposit.amount)}
                  </TableCell>
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
      )}

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
