import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import JSZip from 'jszip';
import { HouseholdRole, PensionAccountType, MiscAssetType } from '@prisma/client';

interface BackupMetadata {
  backupDate: string;
  schemaVersion: string;
  createdBy: string;
  counts: Record<string, number>;
}

/**
 * POST /api/restore
 * Restores the database from a backup ZIP file
 * WARNING: This will DELETE all existing data before restoring
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    // Read and parse ZIP file
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Validate backup structure - check for metadata
    const metadataFile = zip.file('metadata.json');
    if (!metadataFile) {
      return NextResponse.json(
        { success: false, error: 'Invalid backup: missing metadata.json' },
        { status: 400 }
      );
    }

    const metadata: BackupMetadata = JSON.parse(await metadataFile.async('string'));

    // Check schema version compatibility
    if (metadata.schemaVersion !== '1.0') {
      return NextResponse.json(
        { success: false, error: `Unsupported schema version: ${metadata.schemaVersion}` },
        { status: 400 }
      );
    }

    // Parse all JSON files from the backup
    const parseFile = async <T>(filename: string): Promise<T[]> => {
      const file = zip.file(filename);
      if (!file) return [];
      const content = await file.async('string');
      return JSON.parse(content) as T[];
    };

    // Parse all data
    const users = await parseFile<Record<string, unknown>>('users.json');
    const profiles = await parseFile<Record<string, unknown>>('profiles.json');
    const households = await parseFile<Record<string, unknown>>('households.json');
    const householdMembers = await parseFile<Record<string, unknown>>('household_members.json');
    const stockAccounts = await parseFile<Record<string, unknown>>('stock_accounts.json');
    const stockAccountOwners = await parseFile<Record<string, unknown>>(
      'stock_account_owners.json'
    );
    const stockHoldings = await parseFile<Record<string, unknown>>('stock_holdings.json');
    const stockPriceHistory = await parseFile<Record<string, unknown>>('stock_price_history.json');
    const pensionAccounts = await parseFile<Record<string, unknown>>('pension_accounts.json');
    const pensionAccountOwners = await parseFile<Record<string, unknown>>(
      'pension_account_owners.json'
    );
    const pensionDeposits = await parseFile<Record<string, unknown>>('pension_deposits.json');
    const miscAssets = await parseFile<Record<string, unknown>>('misc_assets.json');
    const miscAssetOwners = await parseFile<Record<string, unknown>>('misc_asset_owners.json');
    const netWorthSnapshots = await parseFile<Record<string, unknown>>('net_worth_snapshots.json');

    // Execute operations sequentially without transaction
    // Neon serverless doesn't support long-running transactions well
    // If restore fails midway, database may be in partial state - user should retry

    // Delete all existing data in reverse order of dependencies
    console.log('Deleting existing data...');
    await prisma.netWorthSnapshot.deleteMany();
    await prisma.stockPriceHistory.deleteMany();
    await prisma.stockHolding.deleteMany();
    await prisma.stockAccountOwner.deleteMany();
    await prisma.stockAccount.deleteMany();
    await prisma.pensionDeposit.deleteMany();
    await prisma.pensionAccountOwner.deleteMany();
    await prisma.pensionAccount.deleteMany();
    await prisma.miscAssetOwner.deleteMany();
    await prisma.miscAsset.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();

    // Insert data in order of dependencies (parents before children)
    console.log('Restoring data...');

    // 1. Users
    if (users.length > 0) {
      await prisma.user.createMany({
        data: users.map((u) => ({
          id: u.id as string,
          email: u.email as string,
          name: u.name as string | null,
          image: u.image as string | null,
          createdAt: new Date(u.createdAt as string),
          updatedAt: new Date(u.updatedAt as string),
        })),
      });
    }

    // 2. Profiles
    if (profiles.length > 0) {
      await prisma.profile.createMany({
        data: profiles.map((p) => ({
          id: p.id as string,
          name: p.name as string,
          image: p.image as string | null,
          color: p.color as string | null,
          userId: p.userId as string | null,
          createdAt: new Date(p.createdAt as string),
          updatedAt: new Date(p.updatedAt as string),
        })),
      });
    }

    // 3. Households
    if (households.length > 0) {
      await prisma.household.createMany({
        data: households.map((h) => ({
          id: h.id as string,
          name: h.name as string,
          description: h.description as string | null,
          createdAt: new Date(h.createdAt as string),
          updatedAt: new Date(h.updatedAt as string),
        })),
      });
    }

    // 4. Household Members
    if (householdMembers.length > 0) {
      await prisma.householdMember.createMany({
        data: householdMembers.map((hm) => ({
          id: hm.id as string,
          householdId: hm.householdId as string,
          profileId: hm.profileId as string,
          role: hm.role as HouseholdRole,
          joinedAt: new Date(hm.joinedAt as string),
        })),
      });
    }

    // 5. Stock Accounts
    if (stockAccounts.length > 0) {
      await prisma.stockAccount.createMany({
        data: stockAccounts.map((sa) => ({
          id: sa.id as string,
          name: sa.name as string,
          broker: sa.broker as string | null,
          currency: sa.currency as string,
          userId: sa.userId as string | null,
          createdAt: new Date(sa.createdAt as string),
          updatedAt: new Date(sa.updatedAt as string),
        })),
      });
    }

    // 6. Stock Account Owners
    if (stockAccountOwners.length > 0) {
      await prisma.stockAccountOwner.createMany({
        data: stockAccountOwners.map((sao) => ({
          id: sao.id as string,
          accountId: sao.accountId as string,
          profileId: sao.profileId as string,
        })),
      });
    }

    // 7. Stock Holdings
    if (stockHoldings.length > 0) {
      await prisma.stockHolding.createMany({
        data: stockHoldings.map((sh) => ({
          id: sh.id as string,
          symbol: sh.symbol as string,
          quantity: sh.quantity as number,
          avgCostBasis: sh.avgCostBasis as number,
          accountId: sh.accountId as string,
          createdAt: new Date(sh.createdAt as string),
          updatedAt: new Date(sh.updatedAt as string),
        })),
      });
    }

    // 8. Stock Price History
    if (stockPriceHistory.length > 0) {
      await prisma.stockPriceHistory.createMany({
        data: stockPriceHistory.map((sph) => ({
          id: sph.id as string,
          symbol: sph.symbol as string,
          price: sph.price as number,
          timestamp: new Date(sph.timestamp as string),
        })),
      });
    }

    // 9. Pension Accounts
    if (pensionAccounts.length > 0) {
      await prisma.pensionAccount.createMany({
        data: pensionAccounts.map((pa) => ({
          id: pa.id as string,
          type: pa.type as PensionAccountType,
          providerName: pa.providerName as string,
          accountName: pa.accountName as string,
          currentValue: pa.currentValue as number,
          feeFromDeposit: pa.feeFromDeposit as number,
          feeFromTotal: pa.feeFromTotal as number,
          userId: pa.userId as string | null,
          createdAt: new Date(pa.createdAt as string),
          updatedAt: new Date(pa.updatedAt as string),
        })),
      });
    }

    // 10. Pension Account Owners
    if (pensionAccountOwners.length > 0) {
      await prisma.pensionAccountOwner.createMany({
        data: pensionAccountOwners.map((pao) => ({
          id: pao.id as string,
          accountId: pao.accountId as string,
          profileId: pao.profileId as string,
        })),
      });
    }

    // 11. Pension Deposits
    if (pensionDeposits.length > 0) {
      await prisma.pensionDeposit.createMany({
        data: pensionDeposits.map((pd) => ({
          id: pd.id as string,
          depositDate: new Date(pd.depositDate as string),
          salaryMonth: new Date(pd.salaryMonth as string),
          amount: pd.amount as number,
          employer: pd.employer as string,
          accountId: pd.accountId as string,
          createdAt: new Date(pd.createdAt as string),
        })),
      });
    }

    // 12. Misc Assets
    if (miscAssets.length > 0) {
      await prisma.miscAsset.createMany({
        data: miscAssets.map((ma) => ({
          id: ma.id as string,
          type: ma.type as MiscAssetType,
          name: ma.name as string,
          currentValue: ma.currentValue as number,
          interestRate: ma.interestRate as number,
          monthlyPayment: ma.monthlyPayment as number | null,
          monthlyDeposit: ma.monthlyDeposit as number | null,
          maturityDate: ma.maturityDate ? new Date(ma.maturityDate as string) : null,
          userId: ma.userId as string | null,
          createdAt: new Date(ma.createdAt as string),
          updatedAt: new Date(ma.updatedAt as string),
        })),
      });
    }

    // 13. Misc Asset Owners
    if (miscAssetOwners.length > 0) {
      await prisma.miscAssetOwner.createMany({
        data: miscAssetOwners.map((mao) => ({
          id: mao.id as string,
          assetId: mao.assetId as string,
          profileId: mao.profileId as string,
        })),
      });
    }

    // 14. Net Worth Snapshots
    if (netWorthSnapshots.length > 0) {
      await prisma.netWorthSnapshot.createMany({
        data: netWorthSnapshots.map((nws) => ({
          id: nws.id as string,
          userId: nws.userId as string,
          date: new Date(nws.date as string),
          netWorth: nws.netWorth as number,
          portfolio: nws.portfolio as number,
          pension: nws.pension as number,
          assets: nws.assets as number,
          createdAt: new Date(nws.createdAt as string),
        })),
      });
    }

    console.log('Restore complete');

    return NextResponse.json({
      success: true,
      message: 'Database restored successfully',
      metadata: {
        backupDate: metadata.backupDate,
        counts: metadata.counts,
      },
    });
  } catch (error) {
    console.error('Error restoring backup:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to restore backup',
      },
      { status: 500 }
    );
  }
}
