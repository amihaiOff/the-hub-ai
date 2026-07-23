import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { householdVisibleWhere } from '@/lib/utils/household-scope';
import { simulateTrack, type RateType } from '@/lib/utils/mortgage';
import { loadBoiPrimeHistory } from '@/lib/api/boi-prime';

/**
 * GET /api/assets
 * Get the active household's misc-assets summary — every item visible to
 * any member, per H1 of the codebase review. Also uses integer-cents
 * accumulation on totals.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;

    const [assets, primeHistory] = await Promise.all([
      prisma.miscAsset.findMany({
        where: householdVisibleWhere(householdId),
        include: {
          owners: {
            include: {
              profile: {
                select: { id: true, name: true, image: true, color: true },
              },
            },
          },
          mortgageTracks: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      loadBoiPrimeHistory(),
    ]);

    // Cent-accumulate to avoid float drift when summing many Decimals.
    const toCents = (v: unknown) => Math.round(Number(v) * 100);
    const fromCents = (c: number) => c / 100;
    let totalAssetsCents = 0;
    let totalLiabilitiesCents = 0;
    const now = new Date();

    const items = assets.map((asset: (typeof assets)[0]) => {
      const tracks = asset.mortgageTracks.map((track) => {
        const canSimulate =
          track.originationPrincipal != null &&
          track.originationDate != null &&
          track.paymentDay != null &&
          track.termMonths != null &&
          track.rateType != null;

        if (!canSimulate) {
          return {
            id: track.id,
            name: track.name,
            amount: Number(track.amount),
            interestRate: Number(track.interestRate),
            monthlyPayment: track.monthlyPayment ? Number(track.monthlyPayment) : null,
            maturityDate: track.maturityDate,
            sortOrder: track.sortOrder,
            simulated: null,
          };
        }

        const sim = simulateTrack(
          {
            originationPrincipal: Number(track.originationPrincipal),
            originationDate: track.originationDate!,
            paymentDay: track.paymentDay!,
            termMonths: track.termMonths!,
            rateType: track.rateType! as RateType,
            initialAnnualRate: Number(track.interestRate),
            rateSpread: track.rateSpread != null ? Number(track.rateSpread) : undefined,
          },
          now,
          primeHistory
        );

        return {
          id: track.id,
          name: track.name,
          // Simulated balance overrides the cached `amount`.
          amount: sim.currentBalance,
          interestRate: sim.effectiveRate,
          monthlyPayment: sim.monthlyPayment,
          maturityDate: track.maturityDate,
          sortOrder: track.sortOrder,
          simulated: {
            currentBalance: sim.currentBalance,
            paymentsMade: sim.paymentsMade,
            principalPaid: sim.principalPaid,
            interestPaid: sim.interestPaid,
            monthlyPayment: sim.monthlyPayment,
            effectiveRate: sim.effectiveRate,
            nextPaymentDate: sim.nextPaymentDate,
            nextResetDate: sim.nextResetDate,
          },
        };
      });

      // Mortgages with simulated tracks: overall current value = sum of
      // (negative) simulated track balances. Non-mortgage assets keep the
      // stored current_value.
      const hasSimulation = tracks.some((t) => t.simulated != null);
      let effectiveCents: number;
      if (asset.type === 'mortgage' && hasSimulation) {
        const trackSumCents = tracks.reduce((acc, t) => acc + toCents(t.amount), 0);
        effectiveCents = -trackSumCents; // mortgage is a liability
      } else {
        effectiveCents = toCents(asset.currentValue);
      }

      if (effectiveCents >= 0) {
        totalAssetsCents += effectiveCents;
      } else {
        totalLiabilitiesCents += Math.abs(effectiveCents);
      }

      return {
        id: asset.id,
        type: asset.type,
        name: asset.name,
        currentValue: fromCents(effectiveCents),
        interestRate: Number(asset.interestRate),
        monthlyPayment: asset.monthlyPayment ? Number(asset.monthlyPayment) : null,
        monthlyDeposit: asset.monthlyDeposit ? Number(asset.monthlyDeposit) : null,
        maturityDate: asset.maturityDate,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        owners: asset.owners.map((o) => ({
          id: o.profile.id,
          name: o.profile.name,
          image: o.profile.image,
          color: o.profile.color,
        })),
        mortgageTracks: tracks,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        householdId,
        totalAssets: fromCents(totalAssetsCents),
        totalLiabilities: fromCents(totalLiabilitiesCents),
        netValue: fromCents(totalAssetsCents - totalLiabilitiesCents),
        itemsCount: assets.length,
        items,
      },
    });
  } catch (error) {
    console.error('Error fetching assets data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch assets data' },
      { status: 500 }
    );
  }
}
