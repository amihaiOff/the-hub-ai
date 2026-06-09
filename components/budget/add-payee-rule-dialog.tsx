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
import { useCreatePayeeCategoryRule, useCategoryGroups } from '@/lib/hooks/use-budget';
import { type RuleOperator, RULE_OPERATOR_LABELS } from '@/lib/utils/budget';

interface AddPayeeRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddPayeeRuleDialog({ open, onOpenChange }: AddPayeeRuleDialogProps) {
  const [name, setName] = useState('');
  const [operator, setOperator] = useState<RuleOperator>('contains');
  const [value, setValue] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [markNeverDefault, setMarkNeverDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const { data: categoryGroups = [] } = useCategoryGroups();
  const createRule = useCreatePayeeCategoryRule();

  const resetForm = () => {
    setName('');
    setOperator('contains');
    setValue('');
    setCategoryId('');
    setMarkNeverDefault(false);
    setIsActive(true);
  };

  const canSubmit = !!name.trim() && !!value.trim() && (markNeverDefault ? true : !!categoryId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    await createRule.mutateAsync({
      name: name.trim(),
      operator,
      value: value.trim(),
      categoryId: markNeverDefault ? null : categoryId,
      markNeverDefault,
      isActive,
    });

    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Categorization Rule</DialogTitle>
            <DialogDescription>
              Automatically set a default category for new payees matching a pattern.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rule-name">Rule Name</Label>
              <Input
                id="rule-name"
                placeholder="e.g. Supermarkets"
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
                <Label htmlFor="rule-value">Match Value</Label>
                <Input
                  id="rule-value"
                  placeholder="e.g. spotify"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Target Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={markNeverDefault}>
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

            <div className="flex items-start space-x-2">
              <Checkbox
                id="rule-never-default"
                checked={markNeverDefault}
                onCheckedChange={(checked) => setMarkNeverDefault(checked === true)}
                className="mt-0.5"
              />
              <div className="grid gap-1">
                <Label htmlFor="rule-never-default" className="cursor-pointer text-sm font-normal">
                  Never set a default category
                </Label>
                <p className="text-muted-foreground text-xs">
                  Mark matching payees as &quot;never default&quot; instead of assigning a category.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="rule-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(!!checked)}
              />
              <Label htmlFor="rule-active" className="text-sm font-normal">
                Active
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createRule.isPending || !canSubmit}>
              {createRule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
