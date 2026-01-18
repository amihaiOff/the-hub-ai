import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import JSZip from 'jszip';

/**
 * GET /api/backup
 * Creates a full database backup as a downloadable ZIP file
 * Contains JSON files for each table with all data
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all data from all tables
    const [
      users,
      profiles,
      households,
      householdMembers,
      stockAccounts,
      stockAccountOwners,
      stockHoldings,
      stockPriceHistory,
      pensionAccounts,
      pensionAccountOwners,
      pensionDeposits,
      miscAssets,
      miscAssetOwners,
      netWorthSnapshots,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.profile.findMany(),
      prisma.household.findMany(),
      prisma.householdMember.findMany(),
      prisma.stockAccount.findMany(),
      prisma.stockAccountOwner.findMany(),
      prisma.stockHolding.findMany(),
      prisma.stockPriceHistory.findMany(),
      prisma.pensionAccount.findMany(),
      prisma.pensionAccountOwner.findMany(),
      prisma.pensionDeposit.findMany(),
      prisma.miscAsset.findMany(),
      prisma.miscAssetOwner.findMany(),
      prisma.netWorthSnapshot.findMany(),
    ]);

    // Create backup metadata
    const metadata = {
      backupDate: new Date().toISOString(),
      schemaVersion: '1.0',
      createdBy: user.email,
      counts: {
        users: users.length,
        profiles: profiles.length,
        households: households.length,
        householdMembers: householdMembers.length,
        stockAccounts: stockAccounts.length,
        stockAccountOwners: stockAccountOwners.length,
        stockHoldings: stockHoldings.length,
        stockPriceHistory: stockPriceHistory.length,
        pensionAccounts: pensionAccounts.length,
        pensionAccountOwners: pensionAccountOwners.length,
        pensionDeposits: pensionDeposits.length,
        miscAssets: miscAssets.length,
        miscAssetOwners: miscAssetOwners.length,
        netWorthSnapshots: netWorthSnapshots.length,
      },
    };

    // Create ZIP file
    const zip = new JSZip();

    // Add metadata
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    // Add each table as a separate JSON file
    // Convert Decimal and Date fields to serializable format
    zip.file('users.json', JSON.stringify(users, jsonSerializer, 2));
    zip.file('profiles.json', JSON.stringify(profiles, jsonSerializer, 2));
    zip.file('households.json', JSON.stringify(households, jsonSerializer, 2));
    zip.file('household_members.json', JSON.stringify(householdMembers, jsonSerializer, 2));
    zip.file('stock_accounts.json', JSON.stringify(stockAccounts, jsonSerializer, 2));
    zip.file('stock_account_owners.json', JSON.stringify(stockAccountOwners, jsonSerializer, 2));
    zip.file('stock_holdings.json', JSON.stringify(stockHoldings, jsonSerializer, 2));
    zip.file('stock_price_history.json', JSON.stringify(stockPriceHistory, jsonSerializer, 2));
    zip.file('pension_accounts.json', JSON.stringify(pensionAccounts, jsonSerializer, 2));
    zip.file(
      'pension_account_owners.json',
      JSON.stringify(pensionAccountOwners, jsonSerializer, 2)
    );
    zip.file('pension_deposits.json', JSON.stringify(pensionDeposits, jsonSerializer, 2));
    zip.file('misc_assets.json', JSON.stringify(miscAssets, jsonSerializer, 2));
    zip.file('misc_asset_owners.json', JSON.stringify(miscAssetOwners, jsonSerializer, 2));
    zip.file('net_worth_snapshots.json', JSON.stringify(netWorthSnapshots, jsonSerializer, 2));

    // Generate ZIP as Blob
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // Format date for filename
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `hub-ai-backup-${dateStr}.zip`;

    // Return as downloadable file
    return new NextResponse(zipBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error creating backup:', error);
    return NextResponse.json({ success: false, error: 'Failed to create backup' }, { status: 500 });
  }
}

/**
 * JSON serializer that handles Decimal types
 * Uses string representation to preserve financial precision
 */
function jsonSerializer(_key: string, value: unknown): unknown {
  // Handle Prisma Decimal type - convert to string to preserve precision
  // JavaScript numbers lose precision for financial calculations
  if (value !== null && typeof value === 'object' && 'toFixed' in value && 'toString' in value) {
    return (value as { toString: () => string }).toString();
  }
  return value;
}
