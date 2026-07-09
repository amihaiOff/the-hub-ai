'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Banknote, Landmark, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  useMoneytorAccounts,
  useUpdateMoneytorAccount,
  type MoneytorAccountRow,
} from '@/lib/hooks/use-moneytor';
import { cn } from '@/lib/utils';

function formatIls(value: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Bank-account grouping: the only signal we have is `subtype` from Moneytor.
 *   'balance' → checking accounts ("Current Accounts")
 *   everything else (saving, etc.) → deposits / FX bucket
 * If we ever let the user override the bucket, replace this with a stored
 * field on MoneytorAccount.
 */
function bankBucket(account: MoneytorAccountRow): 'current' | 'deposits' {
  return account.subtype === 'balance' ? 'current' : 'deposits';
}

/**
 * Debt grouping: split credit cards out from the rest of the debt (loans and
 * mortgages) so revolving card balances aren't mixed in with long-term debt.
 *
 * `subtype` carries Moneytor's raw `debtType`, which is free-form and
 * locale-dependent, so we can't rely on a single literal value. We detect a
 * credit card by matching common English/Hebrew credit-card terms and Israeli
 * issuer names in either the subtype or the account name (case-insensitive;
 * Hebrew has no case so the lowercase compare is a no-op for it). Everything
 * else — consumer loans and mortgages — falls into the "Debt" bucket.
 */
const CREDIT_CARD_TERMS = [
  'credit',
  'card',
  'visa',
  'mastercard',
  'amex',
  'diners',
  'אשראי', // "credit"
  'כרטיס', // "card"
  'ויזה', // Visa
  'מאסטרקארד', // Mastercard
  'ישראכרט', // Isracard
  'כאל', // Cal
  'לאומי קארד', // Leumi Card
  'מקס', // Max
  'דיינרס', // Diners
];

function isCreditCard(account: MoneytorAccountRow): boolean {
  const haystack = `${account.subtype ?? ''} ${account.name ?? ''}`.toLowerCase();
  return CREDIT_CARD_TERMS.some((term) => haystack.includes(term));
}

function debtBucket(account: MoneytorAccountRow): 'credit_card' | 'debt' {
  return isCreditCard(account) ? 'credit_card' : 'debt';
}

interface EditableSubtitleProps {
  accountId: string;
  value: string | null;
  placeholder?: string;
  className?: string;
}

function EditableSubtitle({
  accountId,
  value,
  placeholder = 'Add a note',
  className,
}: EditableSubtitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const update = useUpdateMoneytorAccount();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = () => {
    // Seed the draft from the current upstream value each time we enter edit
    // mode, so stale React state from a previous edit doesn't carry over.
    setDraft(value ?? '');
    setEditing(true);
  };

  const save = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setEditing(false);
      setDraft(value ?? '');
      return;
    }
    const next = draft.trim();
    const current = value ?? '';
    if (next === current) {
      setEditing(false);
      return;
    }
    update.mutate({ id: accountId, customSubtitle: next || null });
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelledRef.current = true;
            e.currentTarget.blur();
          }
        }}
        className={cn(
          'text-muted-foreground bg-transparent text-xs outline-none',
          'focus-visible:border-ring/40 focus-visible:ring-ring/30 focus-visible:rounded-sm focus-visible:border focus-visible:px-1 focus-visible:ring-2',
          className
        )}
        placeholder={placeholder}
        aria-label="Edit account subtitle"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className={cn(
        'text-muted-foreground hover:text-foreground/80 cursor-text text-left text-xs transition-colors',
        !value && 'italic opacity-60',
        className
      )}
      aria-label="Edit account subtitle"
    >
      {value || placeholder}
    </button>
  );
}

function AccountRow({ account, isDebt }: { account: MoneytorAccountRow; isDebt: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{account.name}</div>
        <EditableSubtitle accountId={account.id} value={account.customSubtitle} />
      </div>
      <div
        dir="ltr"
        className={cn(
          'shrink-0 font-semibold tabular-nums',
          isDebt && 'text-rose-500 dark:text-rose-400'
        )}
      >
        {formatIls(account.balanceInBase)}
      </div>
    </div>
  );
}

function SubSection({
  title,
  accounts,
  isDebt,
}: {
  title?: string;
  accounts: MoneytorAccountRow[];
  isDebt: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        {title && (
          <div className="border-border/40 border-b px-4 py-3">
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
        )}
        <div className="divide-border/30 divide-y px-4">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} isDebt={isDebt} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DebtSection({ accounts, total }: { accounts: MoneytorAccountRow[]; total: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-border/30 divide-y px-4">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} isDebt />
          ))}
        </div>
        {accounts.length > 0 && (
          <div className="border-border/40 flex items-center justify-between border-t px-4 py-3">
            <span className="text-base font-medium">Total</span>
            <span
              dir="ltr"
              className="text-lg font-semibold text-rose-500 tabular-nums dark:text-rose-400"
            >
              {formatIls(total)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  iconColor,
}: {
  icon: typeof Landmark;
  label: string;
  iconColor: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', iconColor)}
      >
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="text-xl font-bold">{label}</h2>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-muted-foreground text-sm">
      No Moneytor accounts synced yet. Click <span className="font-medium">Sync now</span> on{' '}
      <Link href="/moneytor-trnx" className="underline">
        Moneytor Trnx
      </Link>{' '}
      to pull bank and debt balances.
    </p>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <div className="flex-1 space-y-1">
            <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
            <div className="bg-muted h-3 w-1/4 animate-pulse rounded" />
          </div>
          <div className="bg-muted h-4 w-20 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

export function MoneytorBalancesCard() {
  const { data, isLoading } = useMoneytorAccounts();

  const accounts = data?.accounts ?? [];
  const banks = accounts.filter((a) => a.form === 'bank');
  const debts = accounts.filter((a) => a.form === 'debt');

  const currentBanks = banks.filter((a) => bankBucket(a) === 'current');
  const depositBanks = banks.filter((a) => bankBucket(a) === 'deposits');
  const creditCards = debts.filter((a) => debtBucket(a) === 'credit_card');
  const otherDebts = debts.filter((a) => debtBucket(a) === 'debt');
  const creditCardsTotal = creditCards.reduce((s, a) => s + a.balanceInBase, 0);
  const otherDebtsTotal = otherDebts.reduce((s, a) => s + a.balanceInBase, 0);

  if (isLoading && accounts.length === 0) {
    return (
      <div>
        <Skeleton />
      </div>
    );
  }

  if (accounts.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Bank Accounts */}
        {banks.length > 0 && (
          <div>
            <SectionHeader
              icon={Landmark}
              label="Bank Accounts"
              iconColor="bg-blue-500/15 text-blue-400"
            />
            <div className="space-y-4">
              {currentBanks.length > 0 && <SubSection accounts={currentBanks} isDebt={false} />}
              {depositBanks.length > 0 && (
                <SubSection title="Deposits & Forex" accounts={depositBanks} isDebt={false} />
              )}
            </div>
          </div>
        )}

        {/* Credit cards get their own section; consumer loans and mortgages
            are grouped together under "Debt". */}
        {(creditCards.length > 0 || otherDebts.length > 0) && (
          <div className="space-y-6">
            {creditCards.length > 0 && (
              <div>
                <SectionHeader
                  icon={CreditCard}
                  label="Credit Cards"
                  iconColor="bg-rose-500/15 text-rose-400"
                />
                <DebtSection accounts={creditCards} total={creditCardsTotal} />
              </div>
            )}
            {otherDebts.length > 0 && (
              <div>
                <SectionHeader
                  icon={Banknote}
                  label="Debt"
                  iconColor="bg-amber-500/15 text-amber-400"
                />
                <DebtSection accounts={otherDebts} total={otherDebtsTotal} />
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-right text-xs">
        Synced {formatRelative(data?.asOf ?? null)}
      </p>
    </div>
  );
}
