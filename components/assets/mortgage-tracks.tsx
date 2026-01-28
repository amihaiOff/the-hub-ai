'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency, formatInterestRate } from '@/lib/utils/assets';

export interface MortgageTrackInput {
  id?: string;
  name: string;
  amount: string;
  interestRate: string;
  monthlyPayment: string;
  maturityDate: Date | undefined;
}

interface MortgageTracksProps {
  tracks: MortgageTrackInput[];
  onTracksChange: (tracks: MortgageTrackInput[]) => void;
  disabled?: boolean;
}

const createEmptyTrack = (): MortgageTrackInput => ({
  name: '',
  amount: '',
  interestRate: '',
  monthlyPayment: '',
  maturityDate: undefined,
});

export function MortgageTracks({ tracks, onTracksChange, disabled }: MortgageTracksProps) {
  const [expandedTracks, setExpandedTracks] = useState<Record<number, boolean>>({});

  const addTrack = () => {
    onTracksChange([...tracks, createEmptyTrack()]);
    // Auto-expand the new track
    setExpandedTracks((prev) => ({ ...prev, [tracks.length]: true }));
  };

  const removeTrack = (index: number) => {
    const newTracks = tracks.filter((_, i) => i !== index);
    onTracksChange(newTracks);
    // Clean up expanded state
    const newExpanded = { ...expandedTracks };
    delete newExpanded[index];
    setExpandedTracks(newExpanded);
  };

  const updateTrack = (
    index: number,
    field: keyof MortgageTrackInput,
    value: string | Date | undefined
  ) => {
    const newTracks = [...tracks];
    newTracks[index] = { ...newTracks[index], [field]: value };
    onTracksChange(newTracks);
  };

  const toggleTrackExpanded = (index: number) => {
    setExpandedTracks((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  // Calculate totals
  const totals = tracks.reduce(
    (acc, track) => {
      const amount = parseFloat(track.amount) || 0;
      const payment = parseFloat(track.monthlyPayment) || 0;
      const rate = parseFloat(track.interestRate) || 0;
      return {
        amount: acc.amount + amount,
        payment: acc.payment + payment,
        weightedRate: acc.weightedRate + amount * rate,
      };
    },
    { amount: 0, payment: 0, weightedRate: 0 }
  );
  const avgRate = totals.amount > 0 ? totals.weightedRate / totals.amount : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Mortgage Tracks</Label>
        <Button type="button" variant="outline" size="sm" onClick={addTrack} disabled={disabled}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Track
        </Button>
      </div>

      {tracks.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Add tracks to break down your mortgage into separate portions with different rates.
        </p>
      )}

      <div className="space-y-2">
        {tracks.map((track, index) => (
          <Card key={index} className="border-border/50">
            <Collapsible
              open={expandedTracks[index]}
              onOpenChange={() => toggleTrackExpanded(index)}
            >
              <CollapsibleTrigger asChild>
                <div className="hover:bg-muted/50 flex cursor-pointer items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    {expandedTracks[index] ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    <span className="font-medium">{track.name || `Track ${index + 1}`}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {track.amount && (
                      <span className="text-muted-foreground">
                        {formatCurrency(parseFloat(track.amount) || 0)}
                      </span>
                    )}
                    {track.interestRate && (
                      <span className="text-muted-foreground">
                        {formatInterestRate(parseFloat(track.interestRate) || 0)}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrack(index);
                      }}
                      disabled={disabled}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3 border-t pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`track-${index}-name`} className="text-xs">
                        Track Name *
                      </Label>
                      <Input
                        id={`track-${index}-name`}
                        value={track.name}
                        onChange={(e) => updateTrack(index, 'name', e.target.value)}
                        placeholder="e.g., Fixed Rate, Prime"
                        disabled={disabled}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`track-${index}-amount`} className="text-xs">
                        Amount (ILS) *
                      </Label>
                      <Input
                        id={`track-${index}-amount`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={track.amount}
                        onChange={(e) => updateTrack(index, 'amount', e.target.value)}
                        placeholder="e.g., 500000"
                        disabled={disabled}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`track-${index}-rate`} className="text-xs">
                        Interest Rate (%) *
                      </Label>
                      <Input
                        id={`track-${index}-rate`}
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={track.interestRate}
                        onChange={(e) => updateTrack(index, 'interestRate', e.target.value)}
                        placeholder="e.g., 4.5"
                        disabled={disabled}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`track-${index}-payment`} className="text-xs">
                        Monthly Payment (ILS)
                      </Label>
                      <Input
                        id={`track-${index}-payment`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={track.monthlyPayment}
                        onChange={(e) => updateTrack(index, 'monthlyPayment', e.target.value)}
                        placeholder="e.g., 3000"
                        disabled={disabled}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`track-${index}-maturity`} className="text-xs">
                        Maturity Date
                      </Label>
                      <DatePicker
                        id={`track-${index}-maturity`}
                        date={track.maturityDate}
                        onDateChange={(date) => updateTrack(index, 'maturityDate', date)}
                        placeholder="Select maturity date"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {/* Totals summary */}
      {tracks.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total Amount: </span>
              <span className="font-medium">{formatCurrency(totals.amount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total Payment: </span>
              <span className="font-medium">{formatCurrency(totals.payment)}/mo</span>
            </div>
            <div>
              <span className="text-muted-foreground">Weighted Avg Rate: </span>
              <span className="font-medium">{formatInterestRate(avgRate)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to convert from API format to form input format
export function tracksFromApi(
  tracks?: {
    id?: string;
    name: string;
    amount: number;
    interestRate: number;
    monthlyPayment: number | null;
    maturityDate: Date | string | null;
    sortOrder?: number;
  }[]
): MortgageTrackInput[] {
  if (!tracks || tracks.length === 0) return [];
  return tracks.map((track) => ({
    id: track.id,
    name: track.name,
    amount: track.amount.toString(),
    interestRate: track.interestRate.toString(),
    monthlyPayment: track.monthlyPayment?.toString() || '',
    maturityDate: track.maturityDate ? new Date(track.maturityDate) : undefined,
  }));
}

// Helper to convert from form input format to API format
export function tracksToApi(tracks: MortgageTrackInput[]): {
  id?: string;
  name: string;
  amount: number;
  interestRate: number;
  monthlyPayment: number | null;
  maturityDate: string | null;
  sortOrder: number;
}[] {
  return tracks
    .filter((track) => track.name.trim() && track.amount)
    .map((track, index) => ({
      id: track.id,
      name: track.name.trim(),
      amount: parseFloat(track.amount) || 0,
      interestRate: parseFloat(track.interestRate) || 0,
      monthlyPayment: track.monthlyPayment ? parseFloat(track.monthlyPayment) : null,
      maturityDate: track.maturityDate ? format(track.maturityDate, 'yyyy-MM-dd') : null,
      sortOrder: index,
    }));
}
