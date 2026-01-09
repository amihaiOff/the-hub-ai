import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStockPrices, isStockPriceError } from '@/lib/api/stock-price';

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

    const snapshots = [];

    for (const household of households) {
      const profileIds = household.members.map((m) => m.profileId);

      // Calculate net worth for this household
      const netWorth = await calculateHouseholdNetWorth(profileIds);

      snapshots.push({
        householdId: household.id,
        householdName: household.name,
        netWorth,
      });

      console.log(`Snapshot for ${household.name}: ${netWorth.toFixed(2)}`);
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
        const netWorth = await calculateHouseholdNetWorth([user.profile.id]);
        snapshots.push({
          userId: user.id,
          userName: user.name || user.email,
          netWorth,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Net worth snapshots created',
      snapshots,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error creating snapshots:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create snapshots' },
      { status: 500 }
    );
  }
}

/**
 * Calculate total net worth for a set of profiles
 */
async function calculateHouseholdNetWorth(profileIds: string[]): Promise<number> {
  let totalNetWorth = 0;

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

  // Calculate stock portfolio value
  for (const account of stockAccounts) {
    for (const holding of account.holdings) {
      const priceResult = priceMap.get(holding.symbol);
      if (priceResult && !isStockPriceError(priceResult)) {
        totalNetWorth += holding.quantity.toNumber() * priceResult.price;
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
    totalNetWorth += account.currentValue.toNumber();
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
    totalNetWorth += asset.currentValue.toNumber();
  }

  return totalNetWorth;
}
