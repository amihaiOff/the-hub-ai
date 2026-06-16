'use client';

import { useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useAccountNames,
  useAccountNameIdentifiers,
  useCreateAccountName,
  useUpdateAccountName,
  useDeleteAccountName,
} from '@/lib/hooks/use-budget';

/**
 * Settings block for mapping transaction payment identifiers (account numbers) to friendly
 * names. The friendly name is displayed in the transaction details on the budget screen.
 */
export function AccountNamesSettings() {
  const { data: mappings = [], isLoading } = useAccountNames();
  const { data: identifiers = [] } = useAccountNameIdentifiers();
  const createMapping = useCreateAccountName();
  const updateMapping = useUpdateAccountName();
  const deleteMapping = useDeleteAccountName();

  const [newNumber, setNewNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Identifiers that don't yet have a friendly name, offered as a pick-list.
  const mappedNumbers = new Set(mappings.map((m) => m.accountNumber));
  const unmappedIdentifiers = identifiers.filter((i) => !mappedNumbers.has(i.accountNumber));

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const accountNumber = newNumber.trim();
    const name = newName.trim();
    if (!accountNumber || !name) return;
    createMapping.mutate(
      { accountNumber, name },
      {
        onSuccess: () => {
          setNewNumber('');
          setNewName('');
        },
      }
    );
  };

  const handleSaveEdit = (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    updateMapping.mutate(
      { id, name },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditingName('');
        },
      }
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Account names</p>
      <p className="text-muted-foreground text-xs">
        Transactions from Moneytor and credit-card imports carry an account identifier instead of a
        readable name. Map each identifier to a friendly name and it will be shown in the
        transaction details.
      </p>

      <div className="mt-3 space-y-2">
        {isLoading && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        )}
        {mappings.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground shrink-0 font-mono text-xs">
              {item.accountNumber}
            </span>
            {editingId === item.id ? (
              <>
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="h-7 flex-1 text-sm"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-green-600"
                  onClick={() => handleSaveEdit(item.id)}
                  disabled={updateMapping.isPending || !editingName.trim()}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-6 w-6 p-0"
                  onClick={() => setEditingId(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate">{item.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-6 w-6 p-0"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingName(item.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
                  onClick={() => deleteMapping.mutate(item.id)}
                  disabled={deleteMapping.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
        {!isLoading && mappings.length === 0 && (
          <p className="text-muted-foreground text-xs">No account names configured yet.</p>
        )}
      </div>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleAdd}>
        <Input
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="Account identifier"
          list="account-identifier-options"
          className="text-sm sm:w-44"
        />
        <datalist id="account-identifier-options">
          {unmappedIdentifiers.map((i) => (
            <option key={i.accountNumber} value={i.accountNumber}>
              {i.samplePayee ? `${i.samplePayee} · ${i.count} txns` : `${i.count} txns`}
            </option>
          ))}
        </datalist>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. Visa ·1234 / Checking"
          className="flex-1 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          disabled={createMapping.isPending || !newNumber.trim() || !newName.trim()}
        >
          {createMapping.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </form>
      {createMapping.isError && (
        <p className="text-xs text-red-500">{(createMapping.error as Error).message}</p>
      )}
    </div>
  );
}
