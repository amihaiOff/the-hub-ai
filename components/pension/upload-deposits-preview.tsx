'use client';

import { AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatSalaryMonth, formatDepositDate, formatCurrency } from '@/lib/utils/pension';
import { cn } from '@/lib/utils';
import type { PreviewDeposit } from './upload-deposits-dialog';

interface UploadDepositsPreviewProps {
  deposits: PreviewDeposit[];
  onToggleDeposit: (index: number) => void;
  onToggleAll: () => void;
}

export function UploadDepositsPreview({
  deposits,
  onToggleDeposit,
  onToggleAll,
}: UploadDepositsPreviewProps) {
  const nonDuplicates = deposits.filter((d) => !d.isDuplicate);
  const allSelected = nonDuplicates.length > 0 && nonDuplicates.every((d) => d.isSelected);
  const someSelected = nonDuplicates.some((d) => d.isSelected);

  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label="Select all"
                className={someSelected && !allSelected ? 'data-[state=checked]:bg-primary/50' : ''}
              />
            </TableHead>
            <TableHead>Salary Month</TableHead>
            <TableHead className="hidden sm:table-cell">Deposit Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead className="hidden sm:table-cell">Employer</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deposits.map((deposit, index) => (
            <TableRow
              key={index}
              className={cn(
                deposit.isDuplicate && 'bg-amber-500/5',
                !deposit.isSelected && !deposit.isDuplicate && 'opacity-50'
              )}
            >
              <TableCell>
                <Checkbox
                  checked={deposit.isSelected}
                  onCheckedChange={() => onToggleDeposit(index)}
                  disabled={deposit.isDuplicate}
                  aria-label={`Select deposit for ${formatSalaryMonth(deposit.salaryMonth)}`}
                />
              </TableCell>
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
                {deposit.isDuplicate ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Duplicate
                  </span>
                ) : deposit.isSelected ? (
                  <span className="text-xs text-green-600 dark:text-green-400">Ready</span>
                ) : (
                  <span className="text-muted-foreground text-xs">Skipped</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
