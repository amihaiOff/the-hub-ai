'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { usePayees, useCategoryGroups, useDeletePayee } from '@/lib/hooks/use-budget';
import { type BudgetPayee } from '@/lib/utils/budget';
import { PayeeTable, EditPayeeDialog } from '@/components/budget';

export default function PayeesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPayee, setEditingPayee] = useState<BudgetPayee | null>(null);

  const { data: payees = [], isLoading, error } = usePayees();
  const { data: categoryGroups = [] } = useCategoryGroups();
  const deletePayee = useDeletePayee();

  const filteredPayees = payees.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeletePayee = async (payee: BudgetPayee) => {
    if (confirm(`Delete payee "${payee.name}"? It will be removed from all transactions.`)) {
      await deletePayee.mutateAsync(payee.id);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">Payees</h1>
          <p className="text-muted-foreground text-sm">Manage payees and set default categories</p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="text-destructive h-5 w-5" />
            <div>
              <p className="text-destructive font-medium">Failed to load payees</p>
              <p className="text-muted-foreground text-sm">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search payees..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      )}

      {/* Payees Table */}
      {!isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              All Payees
              {filteredPayees.length !== payees.length && (
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  ({filteredPayees.length} of {payees.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            <PayeeTable
              payees={filteredPayees}
              categoryGroups={categoryGroups}
              onEdit={setEditingPayee}
              onDelete={handleDeletePayee}
            />
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <EditPayeeDialog
        payee={editingPayee}
        open={!!editingPayee}
        onOpenChange={(open) => !open && setEditingPayee(null)}
      />
    </div>
  );
}
