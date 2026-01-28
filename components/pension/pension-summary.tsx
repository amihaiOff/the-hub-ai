'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Building2, ChevronDown, ChevronRight, Wallet } from 'lucide-react';
import { ProfileAvatar } from '@/components/shared/profile-avatar';
import { formatCurrency, type PensionAccountSummary, type Owner } from '@/lib/utils/pension';

interface ProfileBalance {
  profile: Owner;
  totalValue: number;
}

interface PensionSummaryProps {
  totalValue: number;
  accountsCount: number;
  accounts?: PensionAccountSummary[];
  isLoading?: boolean;
}

/**
 * Calculate total balance by profile from accounts
 * Each account can have multiple owners, so we split the account value equally among owners
 */
function calculateBalanceByProfile(accounts: PensionAccountSummary[]): ProfileBalance[] {
  const profileTotals = new Map<string, { profile: Owner; totalValue: number }>();

  for (const account of accounts) {
    const owners = account.owners ?? [];
    if (owners.length === 0) continue;

    // Split account value equally among owners
    const valuePerOwner = account.currentValue / owners.length;

    for (const owner of owners) {
      const existing = profileTotals.get(owner.id);
      if (existing) {
        existing.totalValue += valuePerOwner;
      } else {
        profileTotals.set(owner.id, {
          profile: owner,
          totalValue: valuePerOwner,
        });
      }
    }
  }

  // Sort by total value descending
  return Array.from(profileTotals.values()).sort((a, b) => b.totalValue - a.totalValue);
}

export function PensionSummary({
  totalValue,
  accountsCount,
  accounts = [],
  isLoading,
}: PensionSummaryProps) {
  const [isProfileBreakdownOpen, setIsProfileBreakdownOpen] = useState(false);

  const profileBalances = useMemo(() => calculateBalanceByProfile(accounts), [accounts]);
  const hasMultipleProfiles = profileBalances.length > 1;

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4">
      <Card className="p-2 sm:p-0">
        <CardHeader className="hidden flex-row items-center justify-between space-y-0 pb-2 sm:flex">
          <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
          <Wallet className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="p-0 text-center sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="bg-muted mx-auto h-6 w-16 animate-pulse rounded sm:h-8 sm:w-32" />
          ) : (
            <>
              <p className="text-muted-foreground mb-0.5 text-[10px] sm:hidden">Total Balance</p>
              <div className="text-sm font-bold tabular-nums sm:text-2xl">
                {formatCurrency(totalValue)}
              </div>
              <p className="text-muted-foreground hidden text-xs sm:block">Across all accounts</p>

              {/* Collapsible profile breakdown */}
              {hasMultipleProfiles && (
                <Collapsible
                  open={isProfileBreakdownOpen}
                  onOpenChange={setIsProfileBreakdownOpen}
                  className="mt-3"
                >
                  <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 text-xs transition-colors">
                    {isProfileBreakdownOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>By profile</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {profileBalances.map(({ profile, totalValue: profileTotal }) => (
                      <div
                        key={profile.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <ProfileAvatar
                            name={profile.name}
                            image={profile.image}
                            color={profile.color}
                            size="xs"
                          />
                          <span className="text-muted-foreground">{profile.name}</span>
                        </div>
                        <span className="font-medium tabular-nums">
                          {formatCurrency(profileTotal)}
                        </span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="p-2 sm:p-0">
        <CardHeader className="hidden flex-row items-center justify-between space-y-0 pb-2 sm:flex">
          <CardTitle className="text-sm font-medium">Accounts</CardTitle>
          <Building2 className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="p-0 text-center sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="bg-muted mx-auto h-6 w-10 animate-pulse rounded sm:h-8 sm:w-16" />
          ) : (
            <>
              <p className="text-muted-foreground mb-0.5 text-[10px] sm:hidden">Accounts</p>
              <div className="text-sm font-bold tabular-nums sm:text-2xl">{accountsCount}</div>
              <p className="text-muted-foreground hidden text-xs sm:block">Pension & Hishtalmut</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
