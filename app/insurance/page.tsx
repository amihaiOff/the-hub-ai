'use client';

import { useState } from 'react';
import { Shield, Trash2 } from 'lucide-react';
import { useInsurancePolicies, useDeleteInsurancePolicy } from '@/lib/hooks/use-insurance';
import type { InsurancePolicyData } from '@/lib/hooks/use-insurance';
import { ImportExcelDialog } from '@/components/insurance/import-excel-dialog';
import { Button } from '@/components/ui/button';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

export default function InsurancePage() {
  const { data: grouped, isLoading, error } = useInsurancePolicies();
  const deletePolicy = useDeleteInsurancePolicy();

  const profiles = grouped ? Object.values(grouped) : [];
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  // Determine the active profile to show
  const effectiveProfileId = activeProfileId ?? profiles[0]?.profile.id ?? null;
  const activeGroup = effectiveProfileId ? grouped?.[effectiveProfileId] : null;

  // Group policies by mainBranch for the active profile
  const policiesByBranch: Record<string, InsurancePolicyData[]> = {};
  if (activeGroup) {
    for (const policy of activeGroup.policies) {
      if (!policiesByBranch[policy.mainBranch]) {
        policiesByBranch[policy.mainBranch] = [];
      }
      policiesByBranch[policy.mainBranch].push(policy);
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('האם למחוק פוליסה זו?')) return;
    try {
      await deletePolicy.mutateAsync(id);
    } catch {
      // error handled by mutation
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Shield className="text-primary h-7 w-7" />
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">ביטוחים</h1>
        </div>
        {activeGroup && effectiveProfileId && (
          <ImportExcelDialog
            profileId={effectiveProfileId}
            profileName={activeGroup.profile.name}
          />
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-4">
          שגיאה בטעינת נתוני הביטוחים. אנא נסה שוב.
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-muted h-32 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {/* Content */}
      {!isLoading && !error && (
        <>
          {profiles.length === 0 ? (
            /* Empty state */
            <div className="border-border flex h-64 items-center justify-center rounded-lg border border-dashed">
              <div className="text-center">
                <Shield className="text-muted-foreground mx-auto h-12 w-12" />
                <p className="text-muted-foreground mt-2 text-lg font-medium">אין נתוני ביטוח</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  ייבא קובץ Excel מפורטל &ldquo;הר הביטוח&rdquo; כדי להתחיל
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Profile Tabs */}
              {profiles.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {profiles.map(({ profile }) => (
                    <button
                      key={profile.id}
                      onClick={() => setActiveProfileId(profile.id)}
                      className={cn(
                        'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                        effectiveProfileId === profile.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: profile.color ?? '#3b82f6' }}
                      />
                      {profile.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Policies Table */}
              {activeGroup && Object.keys(policiesByBranch).length > 0 ? (
                <div className="space-y-6">
                  {Object.entries(policiesByBranch).map(([branch, policies]) => (
                    <BranchSection
                      key={branch}
                      branch={branch}
                      policies={policies}
                      onDelete={handleDelete}
                      isDeleting={deletePolicy.isPending}
                    />
                  ))}
                </div>
              ) : (
                <div className="border-border flex h-48 items-center justify-center rounded-lg border border-dashed">
                  <div className="text-center">
                    <Shield className="text-muted-foreground mx-auto h-10 w-10" />
                    <p className="text-muted-foreground mt-2 text-sm">אין ביטוחים עבור פרופיל זה</p>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

interface BranchSectionProps {
  branch: string;
  policies: InsurancePolicyData[];
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function BranchSection({ branch, policies, onDelete, isDeleting }: BranchSectionProps) {
  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border">
      {/* Branch Header */}
      <div className="bg-muted/50 border-border border-b px-4 py-3">
        <h2 className="text-base font-semibold">{branch}</h2>
        <p className="text-muted-foreground text-xs">{policies.length} פוליסות</p>
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">ענף (משני)</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">סוג מוצר</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">חברה</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                תקופת ביטוח
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                פרטים נוספים
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                פרמיה בש&quot;ח
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">סוג פרמיה</th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                מספר פוליסה
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                סיווג תכנית
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {policies.map((policy) => (
              <PolicyRow
                key={policy.id}
                policy={policy}
                onDelete={onDelete}
                isDeleting={isDeleting}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="divide-border divide-y lg:hidden">
        {policies.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} onDelete={onDelete} isDeleting={isDeleting} />
        ))}
      </div>
    </div>
  );
}

interface PolicyRowProps {
  policy: InsurancePolicyData;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function PolicyRow({ policy, onDelete, isDeleting }: PolicyRowProps) {
  return (
    <tr className="border-border hover:bg-muted/30 border-b transition-colors last:border-0">
      <td className="px-4 py-3">{policy.subBranch ?? '—'}</td>
      <td className="px-4 py-3">{policy.productType ?? '—'}</td>
      <td className="px-4 py-3 font-medium">{policy.company ?? '—'}</td>
      <td className="px-4 py-3 text-xs">{policy.insurancePeriod ?? '—'}</td>
      <td
        className="max-w-[180px] truncate px-4 py-3 text-xs"
        title={policy.additionalDetails ?? ''}
      >
        {policy.additionalDetails ?? '—'}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {policy.premiumIls != null ? formatCurrencyILS(policy.premiumIls) : '—'}
      </td>
      <td className="px-4 py-3">{policy.premiumType ?? '—'}</td>
      <td className="px-4 py-3 text-xs tabular-nums">{policy.policyNumber ?? '—'}</td>
      <td className="px-4 py-3 text-xs">{policy.planClassification ?? '—'}</td>
      <td className="px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(policy.id)}
          disabled={isDeleting}
          className="text-muted-foreground hover:text-destructive h-7 w-7"
          aria-label="מחק פוליסה"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function PolicyCard({ policy, onDelete, isDeleting }: PolicyRowProps) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {policy.company && <span className="font-medium">{policy.company}</span>}
            {policy.subBranch && (
              <span className="text-muted-foreground text-xs">{policy.subBranch}</span>
            )}
          </div>
          {policy.productType && (
            <p className="text-muted-foreground text-sm">{policy.productType}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {policy.premiumIls != null && (
              <span className="text-sm font-medium tabular-nums">
                {formatCurrencyILS(policy.premiumIls)}
                {policy.premiumType && (
                  <span className="text-muted-foreground font-normal"> / {policy.premiumType}</span>
                )}
              </span>
            )}
            {policy.policyNumber && (
              <span className="text-muted-foreground text-xs tabular-nums">
                פוליסה: {policy.policyNumber}
              </span>
            )}
          </div>
          {policy.insurancePeriod && (
            <p className="text-muted-foreground text-xs">{policy.insurancePeriod}</p>
          )}
          {policy.planClassification && (
            <p className="text-muted-foreground text-xs">{policy.planClassification}</p>
          )}
          {policy.additionalDetails && (
            <p className="text-muted-foreground line-clamp-2 text-xs">{policy.additionalDetails}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(policy.id)}
          disabled={isDeleting}
          className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
          aria-label="מחק פוליסה"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
