'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Loader2, Plus, Search } from 'lucide-react';
import {
  usePayees,
  useBlacklistedPayees,
  useCategoryGroups,
  useDeletePayee,
  useUpdatePayee,
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
  const { data: blacklistedPayees = [], isLoading: isLoadingBlacklist } = useBlacklistedPayees(
    activeTab === 'blacklist'
  );
  const { data: categoryGroups = [] } = useCategoryGroups();
  const { data: rules = [], isLoading: isLoadingRules } = usePayeeCategoryRules(
    activeTab === 'rules'
  );
  const deletePayee = useDeletePayee();
  const updatePayee = useUpdatePayee();
  const deleteRule = useDeletePayeeCategoryRule();

  const filteredPayees = payees.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeletePayee = async (payee: BudgetPayee) => {
    if (confirm(`Delete payee "${payee.name}"? It will be removed from all transactions.`)) {
      await deletePayee.mutateAsync(payee.id);
    }
  };

  const handleBlacklistPayee = async (payee: BudgetPayee) => {
    await updatePayee.mutateAsync({ id: payee.id, isBlacklisted: true });
  };

  const handleRestorePayee = async (payee: BudgetPayee) => {
    await updatePayee.mutateAsync({ id: payee.id, isBlacklisted: false });
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
      <h1 className="page-title text-2xl font-bold tracking-tight lg:text-3xl">Payees</h1>

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
            <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
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
            <div className="lg:border-border lg:bg-card lg:rounded-lg lg:border lg:py-6">
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
                  onBlacklist={handleBlacklistPayee}
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
            <div className="lg:border-border lg:bg-card lg:rounded-lg lg:border lg:py-6">
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

        {/* Blacklist Tab — payees the user has hidden from the app */}
        <TabsContent value="blacklist" className="space-y-4">
          {isLoadingBlacklist && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
          )}

          {!isLoadingBlacklist && (
            <div className="lg:border-border lg:bg-card lg:rounded-lg lg:border lg:py-6">
              <div className="px-0 pb-4 lg:px-6">
                <h2 className="text-lg font-semibold">
                  Blacklisted payees
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    ({blacklistedPayees.length})
                  </span>
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Hidden from every list and aggregate in the app. Their transactions stay in the
                  database for debugging but never count toward summaries or charts.
                </p>
              </div>
              <div className="lg:px-6">
                {blacklistedPayees.length === 0 ? (
                  <div className="text-muted-foreground py-8 text-center text-sm">
                    No blacklisted payees yet. Use the row menu on the Payees tab to hide one.
                  </div>
                ) : (
                  <PayeeTable
                    payees={blacklistedPayees}
                    categoryGroups={categoryGroups}
                    onEdit={setEditingPayee}
                    onDelete={handleDeletePayee}
                    onRestore={handleRestorePayee}
                  />
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
