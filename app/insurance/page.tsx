'use client';

import { useState } from 'react';
import { Shield, Trash2, ChevronDown } from 'lucide-react';
import { useInsurancePolicies, useDeleteInsurancePolicy } from '@/lib/hooks/use-insurance';
import type { InsurancePolicyData } from '@/lib/hooks/use-insurance';
import { ImportExcelDialog } from '@/components/insurance/import-excel-dialog';
import { Button } from '@/components/ui/button';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { useProfiles } from '@/lib/hooks/use-profiles';
import { useHouseholdContext } from '@/lib/contexts/household-context';

export default function InsurancePage() {
  const { activeHousehold } = useHouseholdContext();
  const { data: allProfiles = [] } = useProfiles(activeHousehold?.id);
  const { data: grouped, isLoading, error } = useInsurancePolicies();
  const deletePolicy = useDeleteInsurancePolicy();

  // Only profiles that have policy data
  const profilesWithData = allProfiles.filter((p) => grouped?.[p.id]?.policies.length);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this policy?')) return;
    try {
      await deletePolicy.mutateAsync(id);
    } catch {
      // error handled by mutation
    }
  };

  // Pick first profile as the default for the import dialog
  const firstProfileId = allProfiles[0]?.id ?? null;
  const firstProfileName = allProfiles[0]?.name ?? '';

  // Grand total across all profiles
  const grandTotal = profilesWithData.reduce((sum, profile) => {
    const policies = grouped![profile.id]?.policies ?? [];
    return sum + policies.reduce((s, p) => s + Number(p.premiumIls ?? 0), 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Shield className="text-primary h-7 w-7" />
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Insurance</h1>
        </div>
        {firstProfileId && (
          <ImportExcelDialog
            profileId={firstProfileId}
            profileName={firstProfileName}
            allProfiles={allProfiles}
          />
        )}
      </div>

      {/* Grand total */}
      {!isLoading && !error && profilesWithData.length > 0 && (
        <div className="bg-card border-border flex items-center justify-between rounded-lg border px-5 py-4">
          <span className="text-muted-foreground text-sm font-medium">Total monthly premium</span>
          <span className="text-xl font-bold tabular-nums">{formatCurrencyILS(grandTotal)}</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-4">
          Failed to load insurance data. Please try again.
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
          {profilesWithData.length === 0 ? (
            <div className="border-border flex h-64 items-center justify-center rounded-lg border border-dashed">
              <div className="text-center">
                <Shield className="text-muted-foreground mx-auto h-12 w-12" />
                <p className="text-muted-foreground mt-2 text-lg font-medium">No insurance data</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Import an Excel file from the &ldquo;הר הביטוח&rdquo; portal to get started
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {profilesWithData.map((profile) => {
                const profileGroup = grouped![profile.id];
                const policiesByBranch: Record<string, InsurancePolicyData[]> = {};
                for (const policy of profileGroup.policies) {
                  if (!policiesByBranch[policy.mainBranch])
                    policiesByBranch[policy.mainBranch] = [];
                  policiesByBranch[policy.mainBranch].push(policy);
                }
                return (
                  <div key={profile.id} className="space-y-4">
                    {/* Profile heading — only shown when multiple profiles have data */}
                    {profilesWithData.length > 1 && (
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: profile.color ?? '#6ab2ff' }}
                        />
                        <h2 className="text-lg font-semibold">{profile.name}</h2>
                      </div>
                    )}
                    <div className="space-y-4">
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
                  </div>
                );
              })}
            </div>
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
  const branchTotal = policies.reduce((sum, p) => sum + Number(p.premiumIls ?? 0), 0);

  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border">
      {/* Branch Header */}
      <div className="bg-muted/50 border-border border-b px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{branch}</h2>
            <p className="text-muted-foreground text-xs">
              {policies.length} {policies.length === 1 ? 'policy' : 'policies'}
            </p>
          </div>
          <span className="font-semibold tabular-nums">{formatCurrencyILS(branchTotal)}</span>
        </div>
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
            {/* Sum row */}
            <tr className="bg-muted/30 border-border border-t">
              <td colSpan={5} className="px-4 py-2.5 text-sm font-medium">
                Total
              </td>
              <td className="px-4 py-2.5 text-sm font-semibold tabular-nums">
                {formatCurrencyILS(branchTotal)}
              </td>
              <td colSpan={4} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="divide-border divide-y lg:hidden">
        {policies.map((policy) => (
          <PolicyCard key={policy.id} policy={policy} onDelete={onDelete} isDeleting={isDeleting} />
        ))}
        {/* Mobile sum row */}
        <div className="bg-muted/30 flex items-center justify-between px-4 py-2.5">
          <span className="text-sm font-medium">Total</span>
          <span className="text-sm font-semibold tabular-nums">
            {formatCurrencyILS(branchTotal)}
          </span>
        </div>
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
          aria-label="Delete policy"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function PolicyCard({ policy, onDelete, isDeleting }: PolicyRowProps) {
  const [expanded, setExpanded] = useState(false);

  const details: { label: string; value: string | null | undefined }[] = [
    { label: 'סוג מוצר', value: policy.productType },
    { label: 'תקופת ביטוח', value: policy.insurancePeriod },
    { label: 'סוג פרמיה', value: policy.premiumType },
    { label: 'מספר פוליסה', value: policy.policyNumber },
    { label: 'סיווג תכנית', value: policy.planClassification },
    { label: 'פרטים נוספים', value: policy.additionalDetails },
  ].filter((d) => d.value);

  return (
    <div>
      {/* Collapsed row — tappable */}
      <div
        className="active:bg-muted/40 flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={() => setExpanded((e) => !e)}
      >
        <ChevronDown
          className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" dir="rtl">
            {policy.subBranch || policy.mainBranch}
          </p>
          {policy.company && (
            <p className="text-muted-foreground truncate text-xs">{policy.company}</p>
          )}
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {policy.premiumIls != null ? formatCurrencyILS(Number(policy.premiumIls)) : '—'}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="bg-muted/20 border-border/40 border-t px-4 pt-2 pb-3">
          <div className="space-y-2">
            {details.map((d) => (
              <div key={d.label} className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground shrink-0 text-xs" dir="rtl">
                  {d.label}
                </span>
                <span className="text-right text-xs" dir="rtl">
                  {d.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(policy.id);
              }}
              disabled={isDeleting}
              className="text-muted-foreground hover:text-destructive h-7 gap-1 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
