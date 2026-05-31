import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStockPrices, isStockPriceError } from '@/lib/api/stock-price';
import { fetchExchangeRates, ExchangeRates } from '@/lib/api/exchange-rates';
import { withCronLog } from '@/lib/utils/cron-logger';

// Extend timeout for snapshot creation with many holdings
export const maxDuration = 60;

/**
 * GET /api/cron/create-snapshot
 * Creates net worth snapshots on the 1st and 15th of each month
 *
 * Protected by CRON_SECRET in production
 */
export async function GET(request: NextRequest) {
  // Verify cron secret in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return withCronLog('/api/cron/create-snapshot', async () => {
    try {
      // Get all households to create snapshots for each
      const households = await prisma.household.findMany({
        include: {
          members: {
            include: {
              profile: true,
            },
          },
        },
      });

      // Fetch exchange rates once for all households
      const rates = await fetchExchangeRates();

      const snapshots = [];
      const today = new Date();
      // Normalize to date-only (midnight UTC) for the snapshot date
      const snapshotDate = new Date(
        Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
      );

      for (const household of households) {
        const profileIds = household.members.map((m) => m.profileId);

        // Calculate net worth for this household
        const breakdown = await calculateHouseholdNetWorth(profileIds, rates);

        // Find all users in this household and persist a snapshot for each
        const memberUserIds = household.members
          .map((m) => m.profile?.userId)
          .filter((id): id is string => id != null);

        for (const memberId of memberUserIds) {
          await prisma.netWorthSnapshot.upsert({
            where: {
              userId_date: { userId: memberId, date: snapshotDate },
            },
            update: {
              netWorth: breakdown.netWorth,
              portfolio: breakdown.portfolio,
              pension: breakdown.pension,
              assets: breakdown.assets,
            },
            create: {
              userId: memberId,
              date: snapshotDate,
              netWorth: breakdown.netWorth,
              portfolio: breakdown.portfolio,
              pension: breakdown.pension,
              assets: breakdown.assets,
            },
          });
        }

        snapshots.push({
          householdId: household.id,
          householdName: household.name,
          netWorth: breakdown.netWorth,
        });

        console.log(`Snapshot for ${household.name}: ${breakdown.netWorth.toFixed(2)}`);
      }

      // Also create snapshot for users without households (legacy)
      const usersWithoutHousehold = await prisma.user.findMany({
        where: {
          profile: {
            householdMemberships: {
              none: {},
            },
          },
        },
        include: {
          profile: true,
        },
      });

      for (const user of usersWithoutHousehold) {
        if (user.profile) {
          const breakdown = await calculateHouseholdNetWorth([user.profile.id], rates);

          await prisma.netWorthSnapshot.upsert({
            where: {
              userId_date: { userId: user.id, date: snapshotDate },
            },
            update: {
              netWorth: breakdown.netWorth,
              portfolio: breakdown.portfolio,
              pension: breakdown.pension,
              assets: breakdown.assets,
            },
            create: {
              userId: user.id,
              date: snapshotDate,
              netWorth: breakdown.netWorth,
              portfolio: breakdown.portfolio,
              pension: breakdown.pension,
              assets: breakdown.assets,
            },
          });

          snapshots.push({
            userId: user.id,
            userName: user.name || user.email,
            netWorth: breakdown.netWorth,
          });
        }
      }

      return {
        body: {
          success: true,
          message: 'Net worth snapshots created',
          snapshots,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('Error creating snapshots:', error);
      return {
        body: { success: false, error: 'Failed to create snapshots' },
        status: 500,
      };
    }
  });
}

interface NetWorthBreakdown {
  portfolio: number;
  pension: number;
  assets: number;
  netWorth: number;
}

/**
 * Calculate total net worth for a set of profiles (in ILS)
 * Returns breakdown by category for snapshot storage
 */
async function calculateHouseholdNetWorth(
  profileIds: string[],
  rates: ExchangeRates | null
): Promise<NetWorthBreakdown> {
  let portfolioTotal = 0;
  let pensionTotal = 0;
  let assetsTotal = 0;

  // 1. Stock portfolio value
  const stockAccounts = await prisma.stockAccount.findMany({
    where: {
      owners: {
        some: {
          profileId: { in: profileIds },
        },
      },
    },
    include: {
      holdings: true,
    },
  });

  // Get all unique symbols
  const allSymbols = [...new Set(stockAccounts.flatMap((a) => a.holdings.map((h) => h.symbol)))];

  // Fetch current prices
  const priceMap = await getStockPrices(allSymbols);

  // Calculate stock portfolio value (convert to ILS)
  for (const account of stockAccounts) {
    // Get the rate for this account's currency to convert to ILS
    const accountRate =
      rates?.[account.currency.toUpperCase() as keyof ExchangeRates] || rates?.USD || 1;
    for (const holding of account.holdings) {
      const priceResult = priceMap.get(holding.symbol);
      if (priceResult && !isStockPriceError(priceResult)) {
        // Price is in the stock's native currency; convert via the price currency rate
        const priceCurrencyRate =
          rates?.[priceResult.currency.toUpperCase() as keyof ExchangeRates] || accountRate;
        portfolioTotal += holding.quantity.toNumber() * priceResult.price * priceCurrencyRate;
      }
    }
  }

  // 2. Pension account values
  const pensionAccounts = await prisma.pensionAccount.findMany({
    where: {
      owners: {
        some: {
          profileId: { in: profileIds },
        },
      },
    },
  });

  for (const account of pensionAccounts) {
    pensionTotal += account.currentValue.toNumber();
  }

  // 3. Misc assets (positive for assets, negative for debts)
  const miscAssets = await prisma.miscAsset.findMany({
    where: {
      owners: {
        some: {
          profileId: { in: profileIds },
        },
      },
    },
  });

  for (const asset of miscAssets) {
    assetsTotal += asset.currentValue.toNumber();
  }

  return {
    portfolio: portfolioTotal,
    pension: pensionTotal,
    assets: assetsTotal,
    netWorth: portfolioTotal + pensionTotal + assetsTotal,
  };
}
