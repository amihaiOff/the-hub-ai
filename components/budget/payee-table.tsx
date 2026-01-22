'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { type BudgetPayee, type BudgetCategoryGroup, getCategoryName } from '@/lib/utils/budget';

interface PayeeTableProps {
  payees: BudgetPayee[];
  categoryGroups: BudgetCategoryGroup[];
  onEdit: (payee: BudgetPayee) => void;
  onDelete: (payee: BudgetPayee) => void;
}

export function PayeeTable({ payees, categoryGroups, onEdit, onDelete }: PayeeTableProps) {
  if (payees.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <p>No payees created yet</p>
        <p className="mt-1 text-sm">Payees are automatically created when you add transactions</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-muted-foreground px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
              Payee Name
            </th>
            <th className="text-muted-foreground hidden px-4 py-3 text-left text-xs font-medium tracking-wider uppercase sm:table-cell">
              Default Category
            </th>
            <th className="text-muted-foreground px-4 py-3 text-right text-xs font-medium tracking-wider uppercase">
              Transactions
            </th>
            <th className="w-10 px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {payees.map((payee) => (
            <tr key={payee.id} className="hover:bg-muted/50 transition-colors">
              <td className="px-4 py-3">
                <span className="font-medium">{payee.name}</span>
                <div className="text-muted-foreground text-xs sm:hidden">
                  {payee.categoryId
                    ? getCategoryName(payee.categoryId, categoryGroups)
                    : 'No default category'}
                </div>
              </td>
              <td className="text-muted-foreground hidden px-4 py-3 text-sm sm:table-cell">
                {payee.categoryId ? getCategoryName(payee.categoryId, categoryGroups) : '—'}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{payee.transactionCount}</td>
              <td className="px-4 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(payee)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(payee)} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
