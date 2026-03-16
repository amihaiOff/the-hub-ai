'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Loader2, Plus, Search } from 'lucide-react';
import {
  usePayees,
  useCategoryGroups,
  useDeletePayee,
  usePayeeCategoryRules,
  useDeletePayeeCategoryRule,
} from '@/lib/hooks/use-budget';
import { type BudgetPayee, type PayeeCategoryRule } from '@/lib/utils/budget';
import {
  PayeeTable,
  EditPayeeDialog,
  PayeeRulesTable,
  AddPayeeRuleDialog,
  EditPayeeRuleDialog,
} from '@/components/budget';

export default function PayeesPage() {
  const [activeTab, setActiveTab] = useState('payees');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPayee, setEditingPayee] = useState<BudgetPayee | null>(null);
  const [editingRule, setEditingRule] = useState<PayeeCategoryRule | null>(null);
  const [showAddRuleDialog, setShowAddRuleDialog] = useState(false);

  const { data: payees = [], isLoading, error } = usePayees();
  const { data: categoryGroups = [] } = useCategoryGroups();
  const { data: rules = [], isLoading: isLoadingRules } = usePayeeCategoryRules(
    activeTab === 'rules'
  );
  const deletePayee = useDeletePayee();
  const deleteRule = useDeletePayeeCategoryRule();

  const filteredPayees = payees.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeletePayee = async (payee: BudgetPayee) => {
    if (confirm(`Delete payee "${payee.name}"? It will be removed from all transactions.`)) {
      await deletePayee.mutateAsync(payee.id);
    }
  };

  const handleDeleteRule = async (rule: PayeeCategoryRule) => {
    if (confirm(`Delete rule "${rule.name}"?`)) {
      try {
        await deleteRule.mutateAsync(rule.id);
      } catch {
        // Error is handled by TanStack Query's error state
      }
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Payees</h1>

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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Tabs + contextual controls on the same row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Payees: search box */}
          {activeTab === 'payees' && (
            <div className="relative w-full max-w-sm sm:w-auto sm:min-w-[220px]">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search payees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {/* Rules: action buttons */}
          {activeTab === 'rules' && (
            <Button size="sm" onClick={() => setShowAddRuleDialog(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Rule
            </Button>
          )}

          <TabsList className="ml-auto">
            <TabsTrigger value="payees">Payees</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>
        </div>

        {/* Payees Tab */}
        <TabsContent value="payees" className="space-y-4">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
          )}

          {/* Payees Table */}
          {!isLoading && (
            <div className="lg:border-border/40 lg:bg-card/80 lg:shadow-glow lg:rounded-3xl lg:border lg:py-6 lg:backdrop-blur-xl">
              <h2 className="px-0 pb-4 text-lg font-semibold lg:px-6">
                All Payees
                {filteredPayees.length !== payees.length && (
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    ({filteredPayees.length} of {payees.length})
                  </span>
                )}
              </h2>
              <div className="lg:px-6">
                <PayeeTable
                  payees={filteredPayees}
                  categoryGroups={categoryGroups}
                  onEdit={setEditingPayee}
                  onDelete={handleDeletePayee}
                />
              </div>
            </div>
          )}

          {/* Edit Dialog */}
          <EditPayeeDialog
            payee={editingPayee}
            open={!!editingPayee}
            onOpenChange={(open) => !open && setEditingPayee(null)}
          />
        </TabsContent>

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          {/* Loading State */}
          {isLoadingRules && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
          )}

          {/* Rules Table */}
          {!isLoadingRules && (
            <div className="lg:border-border/40 lg:bg-card/80 lg:shadow-glow lg:rounded-3xl lg:border lg:py-6 lg:backdrop-blur-xl">
              <h2 className="px-0 pb-4 text-lg font-semibold lg:px-6">
                Categorization Rules
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  ({rules.length})
                </span>
              </h2>
              <div className="lg:px-6">
                <PayeeRulesTable
                  rules={rules}
                  onEdit={setEditingRule}
                  onDelete={handleDeleteRule}
                />
              </div>
            </div>
          )}

          {/* Add / Edit Rule Dialogs */}
          <AddPayeeRuleDialog open={showAddRuleDialog} onOpenChange={setShowAddRuleDialog} />
          <EditPayeeRuleDialog
            rule={editingRule}
            open={!!editingRule}
            onOpenChange={(open) => !open && setEditingRule(null)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
