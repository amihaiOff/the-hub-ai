'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useUpdatePayeeCategoryRule, useCategoryGroups } from '@/lib/hooks/use-budget';
import {
  type PayeeCategoryRule,
  type RuleOperator,
  RULE_OPERATOR_LABELS,
} from '@/lib/utils/budget';

interface EditPayeeRuleDialogProps {
  rule: PayeeCategoryRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditPayeeRuleForm({
  rule,
  onOpenChange,
}: {
  rule: PayeeCategoryRule;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(rule.name);
  const [operator, setOperator] = useState<RuleOperator>(rule.operator as RuleOperator);
  const [value, setValue] = useState(rule.value);
  const [categoryId, setCategoryId] = useState(rule.categoryId);
  const [isActive, setIsActive] = useState(rule.isActive);

  const { data: categoryGroups = [] } = useCategoryGroups();
  const updateRule = useUpdatePayeeCategoryRule();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !value.trim() || !categoryId) return;

    await updateRule.mutateAsync({
      id: rule.id,
      name: name.trim(),
      operator,
      value: value.trim(),
      categoryId,
      isActive,
    });

    onOpenChange(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit Categorization Rule</DialogTitle>
        <DialogDescription>
          Update the pattern matching rule for payee categorization.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="edit-rule-name">Rule Name</Label>
          <Input
            id="edit-rule-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Operator</Label>
            <Select value={operator} onValueChange={(v) => setOperator(v as RuleOperator)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(RULE_OPERATOR_LABELS) as [RuleOperator, string][]).map(
                  ([op, label]) => (
                    <SelectItem key={op} value={op}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-rule-value">Match Value</Label>
            <Input
              id="edit-rule-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Target Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categoryGroups.map((group) => (
                <SelectGroup key={group.id}>
                  <SelectLabel className="text-foreground text-xs font-semibold tracking-wide uppercase">
                    {group.name}
                  </SelectLabel>
                  {group.categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="edit-rule-active"
            checked={isActive}
            onCheckedChange={(checked) => setIsActive(!!checked)}
          />
          <Label htmlFor="edit-rule-active" className="text-sm font-normal">
            Active
          </Label>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={updateRule.isPending || !name.trim() || !value.trim() || !categoryId}
        >
          {updateRule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditPayeeRuleDialog({ rule, open, onOpenChange }: EditPayeeRuleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {rule && <EditPayeeRuleForm key={rule.id} rule={rule} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
