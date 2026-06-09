'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Loader2, MoreVertical, Pencil, Trash2, Wand2 } from 'lucide-react';
import {
  type PayeeCategoryRule,
  RULE_OPERATOR_LABELS,
  type RuleOperator,
} from '@/lib/utils/budget';
import { useUpdatePayeeCategoryRule, useApplyPayeeCategoryRule } from '@/lib/hooks/use-budget';
import { useState } from 'react';

interface PayeeRulesTableProps {
  rules: PayeeCategoryRule[];
  onEdit: (rule: PayeeCategoryRule) => void;
  onDelete: (rule: PayeeCategoryRule) => void;
}

export function PayeeRulesTable({ rules, onEdit, onDelete }: PayeeRulesTableProps) {
  const updateRule = useUpdatePayeeCategoryRule();
  const applyRule = useApplyPayeeCategoryRule();
  const [applyResult, setApplyResult] = useState<{
    ruleId: string;
    matched: number;
    total: number;
  } | null>(null);
  const [applyError, setApplyError] = useState<{ ruleId: string; message: string } | null>(null);

  const handleToggleActive = (rule: PayeeCategoryRule) => {
    updateRule.mutate({ id: rule.id, isActive: !rule.isActive });
  };

  const handleApplyRule = async (rule: PayeeCategoryRule) => {
    setApplyError(null);
    try {
      const result = await applyRule.mutateAsync(rule.id);
      setApplyResult({ ruleId: rule.id, ...result });
      setTimeout(() => setApplyResult(null), 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply rule';
      setApplyError({ ruleId: rule.id, message });
      setTimeout(() => setApplyError(null), 8000);
    }
  };

  if (rules.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <p>No rules created yet</p>
        <p className="mt-1 text-sm">
          Rules auto-categorize new payees by matching their name during import
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-muted-foreground px-2 py-2 text-left text-xs font-medium tracking-wider uppercase sm:px-4 sm:py-3">
              Rule
            </th>
            <th className="text-muted-foreground hidden px-2 py-2 text-left text-xs font-medium tracking-wider uppercase sm:table-cell sm:px-4 sm:py-3">
              Match
            </th>
            <th className="text-muted-foreground px-2 py-2 text-left text-xs font-medium tracking-wider uppercase sm:px-4 sm:py-3">
              Category
            </th>
            <th className="text-muted-foreground px-2 py-2 text-center text-xs font-medium tracking-wider uppercase sm:px-4 sm:py-3">
              Active
            </th>
            <th className="w-8 px-1 py-2 sm:w-10 sm:px-2 sm:py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rules.map((rule) => (
            <tr key={rule.id} className="hover:bg-muted/50 transition-colors">
              <td className="px-2 py-2 sm:px-4 sm:py-3">
                <span className="text-sm font-medium">{rule.name}</span>
                <div className="text-muted-foreground text-xs sm:hidden">
                  {RULE_OPERATOR_LABELS[rule.operator as RuleOperator]} &quot;{rule.value}&quot;
                </div>
                {applyResult?.ruleId === rule.id && (
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {applyResult.matched} of {applyResult.total} payees matched
                  </div>
                )}
                {applyError?.ruleId === rule.id && (
                  <div className="text-destructive mt-0.5 text-xs">Error: {applyError.message}</div>
                )}
              </td>
              <td className="hidden px-2 py-2 sm:table-cell sm:px-4 sm:py-3">
                <span className="text-muted-foreground text-sm">
                  {RULE_OPERATOR_LABELS[rule.operator as RuleOperator]}
                </span>{' '}
                <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  {rule.value}
                </span>
              </td>
              <td className="px-2 py-2 sm:px-4 sm:py-3">
                {rule.markNeverDefault ? (
                  <span
                    className="border-border bg-muted text-muted-foreground rounded-sm border px-1.5 py-0.5 text-[10px] leading-none uppercase"
                    title="Marks matching payees as never-default"
                  >
                    Never default
                  </span>
                ) : (
                  <span className="text-sm">{rule.categoryName}</span>
                )}
              </td>
              <td className="px-2 py-2 text-center sm:px-4 sm:py-3">
                <Switch
                  checked={rule.isActive}
                  onCheckedChange={() => handleToggleActive(rule)}
                  disabled={updateRule.isPending}
                  aria-label={`Toggle rule ${rule.name}`}
                />
              </td>
              <td className="px-1 py-2 sm:px-2 sm:py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleApplyRule(rule)}
                      disabled={applyRule.isPending}
                    >
                      {applyRule.isPending && applyRule.variables === rule.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-4 w-4" />
                      )}
                      Apply to Existing
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(rule)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(rule)} className="text-destructive">
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
