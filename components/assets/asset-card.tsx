'use client';

import { useState } from 'react';
import {
  MoreVertical,
  Pencil,
  Trash2,
  Landmark,
  CreditCard,
  Home,
  Baby,
  TrendingUp,
  Calendar,
  Percent,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EditAssetDialog } from './edit-asset-dialog';
import { DeleteConfirmDialog } from '@/components/portfolio/delete-confirm-dialog';
import { OwnerBadges } from '@/components/shared/owner-badges';
import { useDeleteAsset } from '@/lib/hooks/use-assets';
import {
  type MiscAsset,
  type MiscAssetType,
  formatCurrency,
  formatInterestRate,
  formatDate,
  formatAssetType,
  isLiability,
  calculateMaturityValue,
  calculatePayoffDate,
  calculateTotalLoanInterest,
  calculateChildSavingsProjection,
  getMonthsUntilDate,
  calculateTrackInterest,
  calculateTrackPayoffDate,
} from '@/lib/utils/assets';

interface AssetCardProps {
  asset: MiscAsset;
}

const ASSET_ICONS: Record<MiscAssetType, typeof Landmark> = {
  bank_deposit: Landmark,
  loan: CreditCard,
  mortgage: Home,
  child_savings: Baby,
};

export function AssetCard({ asset }: AssetCardProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tracksExpanded, setTracksExpanded] = useState(false);
  const deleteAsset = useDeleteAsset();

  const Icon = ASSET_ICONS[asset.type];
  const isDebt = isLiability(asset.type);
  const value = Math.abs(asset.currentValue);
  const hasTracks = asset.mortgageTracks && asset.mortgageTracks.length > 0;

  // Calculate projections based on asset type
  const getProjection = () => {
    switch (asset.type) {
      case 'bank_deposit': {
        if (asset.maturityDate) {
          const months = getMonthsUntilDate(asset.maturityDate);
          const maturityValue = calculateMaturityValue(value, asset.interestRate, months);
          const interest = maturityValue - value;
          return {
            label: 'At Maturity',
            value: maturityValue,
            interest,
            date: asset.maturityDate,
          };
        }
        return null;
      }
      case 'loan':
      case 'mortgage': {
        if (asset.monthlyPayment) {
          const payoffDate = calculatePayoffDate(value, asset.interestRate, asset.monthlyPayment);
          const totalInterest = calculateTotalLoanInterest(
            value,
            asset.interestRate,
            asset.monthlyPayment
          );
          return {
            label: 'Total Interest',
            interest: totalInterest,
            payoffDate,
          };
        }
        return null;
      }
      case 'child_savings': {
        // Project 18 years from now
        const yearsUntil18 = 18;
        const projectedValue = calculateChildSavingsProjection(
          value,
          asset.monthlyDeposit || 0,
          asset.interestRate,
          yearsUntil18
        );
        return {
          label: `Value in ${yearsUntil18} years`,
          value: projectedValue,
          interest: projectedValue - value - (asset.monthlyDeposit || 0) * yearsUntil18 * 12,
        };
      }
      default:
        return null;
    }
  };

  const projection = getProjection();

  return (
    <Card>
      <CardHeader className="px-3 pb-3 sm:px-6">
        {/* Row 1: Asset info (left) + Value (right) */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${isDebt ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
              <Icon className={`h-5 w-5 ${isDebt ? 'text-red-500' : 'text-emerald-500'}`} />
            </div>
            <div>
              <CardTitle className="text-lg">{asset.name}</CardTitle>
              <Badge
                variant="outline"
                className={
                  isDebt
                    ? 'border-red-500/50 text-red-500'
                    : 'border-emerald-500/50 text-emerald-500'
                }
              >
                {formatAssetType(asset.type)}
              </Badge>
              {asset.owners && asset.owners.length > 0 && (
                <OwnerBadges owners={asset.owners} size="xs" className="mt-1" />
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 text-right">
            <div>
              <div
                className={`text-xl font-bold tabular-nums sm:text-2xl ${
                  isDebt
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {isDebt ? '-' : ''}
                {formatCurrency(value)}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Asset options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2: Details */}
        <CardContent className="px-0 pt-4 pb-0">
          <div className="grid gap-3">
            {/* Basic info row */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="text-muted-foreground flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5" />
                <span>{formatInterestRate(asset.interestRate)} APR</span>
              </div>
              {asset.monthlyPayment && (
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>{formatCurrency(asset.monthlyPayment)}/mo payment</span>
                </div>
              )}
              {asset.monthlyDeposit && (
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>{formatCurrency(asset.monthlyDeposit)}/mo deposit</span>
                </div>
              )}
              {asset.maturityDate && (
                <div className="text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatDate(asset.maturityDate)}</span>
                </div>
              )}
            </div>

            {/* Projection row */}
            {projection && (
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{projection.label}</span>
                  <div className="text-right">
                    {'value' in projection && projection.value !== undefined && (
                      <span className="font-medium">{formatCurrency(projection.value)}</span>
                    )}
                    {'interest' in projection &&
                      projection.interest !== null &&
                      projection.interest !== undefined && (
                        <span
                          className={`ml-2 text-xs ${isDebt ? 'text-red-500' : 'text-emerald-500'}`}
                        >
                          {isDebt ? '+' : '+'}
                          {formatCurrency(projection.interest)} interest
                        </span>
                      )}
                    {'payoffDate' in projection && projection.payoffDate && (
                      <div className="text-muted-foreground text-xs">
                        Payoff: {formatDate(projection.payoffDate)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Mortgage tracks collapsible section */}
            {hasTracks && asset.mortgageTracks && (
              <Collapsible open={tracksExpanded} onOpenChange={setTracksExpanded}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    <span className="text-sm font-medium">
                      {asset.mortgageTracks.length} Track
                      {asset.mortgageTracks.length > 1 ? 's' : ''}
                    </span>
                    {tracksExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {asset.mortgageTracks.map((track) => {
                    const trackInterest = calculateTrackInterest(track);
                    const trackPayoff = calculateTrackPayoffDate(track);
                    return (
                      <div key={track.id} className="bg-muted/30 rounded-lg p-3 text-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{track.name}</div>
                            <div className="text-muted-foreground mt-1 flex flex-wrap gap-3 text-xs">
                              <span>{formatCurrency(track.amount)}</span>
                              <span>{formatInterestRate(track.interestRate)}</span>
                              {track.monthlyPayment && (
                                <span>{formatCurrency(track.monthlyPayment)}/mo</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-xs">
                            {trackInterest !== null && (
                              <div className="text-red-500">
                                +{formatCurrency(trackInterest)} int.
                              </div>
                            )}
                            {trackPayoff && (
                              <div className="text-muted-foreground">
                                Payoff: {formatDate(trackPayoff)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </CardContent>
      </CardHeader>

      {/* Dialogs */}
      <EditAssetDialog
        assetId={asset.id}
        type={asset.type}
        name={asset.name}
        currentValue={asset.currentValue}
        interestRate={asset.interestRate}
        monthlyPayment={asset.monthlyPayment}
        monthlyDeposit={asset.monthlyDeposit}
        maturityDate={asset.maturityDate}
        currentOwnerIds={asset.owners?.map((o) => o.id) ?? []}
        mortgageTracks={asset.mortgageTracks}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
      <DeleteConfirmDialog
        title={`Delete ${asset.name}?`}
        description={`This will permanently delete "${asset.name}". This action cannot be undone.`}
        onConfirm={() => deleteAsset.mutateAsync(asset.id)}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      />
    </Card>
  );
}
