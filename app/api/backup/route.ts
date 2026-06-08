import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import JSZip from 'jszip';

// Extend timeout for backup operations with large datasets
export const maxDuration = 60;

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

    // Fetch all data from the tables we back up. Intentionally excluded:
    //   - moneytor_transactions (raw archive; they're promoted into budget_transactions)
    //   - stock_accounts / stock_holdings / stock_account_cash / stock_account_owners /
    //     stock_price_history ("portfolio old design" — superseded by Moneytor accounts)
    //   - verification_tokens (auth artifacts)
    //   - cron_run_logs (runtime telemetry)
    const [
      users,
      profiles,
      households,
      householdMembers,
      pensionAccounts,
      pensionAccountOwners,
      pensionDeposits,
      miscAssets,
      miscAssetOwners,
      mortgageTracks,
      netWorthSnapshots,
      budgetCategoryGroups,
      budgetCategories,
      budgetPayees,
      budgetTags,
      budgetTransactions,
      budgetTransactionTags,
      riseupCategories,
      payeeCategoryRules,
      insurancePolicies,
      shoppingCategories,
      shoppingItems,
      shoppingCartItems,
      shoppingDeliveries,
      moneytorStockHoldings,
      moneytorStockSnapshots,
      moneytorAccounts,
      moneytorAccountSnapshots,
      moneytorPensionFunds,
      moneytorPensionSnapshots,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.profile.findMany(),
      prisma.household.findMany(),
      prisma.householdMember.findMany(),
      prisma.pensionAccount.findMany(),
      prisma.pensionAccountOwner.findMany(),
      prisma.pensionDeposit.findMany(),
      prisma.miscAsset.findMany(),
      prisma.miscAssetOwner.findMany(),
      prisma.mortgageTrack.findMany(),
      prisma.netWorthSnapshot.findMany(),
      prisma.budgetCategoryGroup.findMany(),
      prisma.budgetCategory.findMany(),
      prisma.budgetPayee.findMany(),
      prisma.budgetTag.findMany(),
      prisma.budgetTransaction.findMany(),
      prisma.budgetTransactionTag.findMany(),
      prisma.riseupCategory.findMany(),
      prisma.payeeCategoryRule.findMany(),
      prisma.insurancePolicy.findMany(),
      prisma.shoppingCategory.findMany(),
      prisma.shoppingItem.findMany(),
      prisma.shoppingCartItem.findMany(),
      prisma.shoppingDelivery.findMany(),
      prisma.moneytorStockHolding.findMany(),
      prisma.moneytorStockSnapshot.findMany(),
      prisma.moneytorAccount.findMany(),
      prisma.moneytorAccountSnapshot.findMany(),
      prisma.moneytorPensionFund.findMany(),
      prisma.moneytorPensionSnapshot.findMany(),
    ]);

    // Create backup metadata
    const metadata = {
      backupDate: new Date().toISOString(),
      schemaVersion: '1.5',
      createdBy: user.email,
      counts: {
        users: users.length,
        profiles: profiles.length,
        households: households.length,
        householdMembers: householdMembers.length,
        pensionAccounts: pensionAccounts.length,
        pensionAccountOwners: pensionAccountOwners.length,
        pensionDeposits: pensionDeposits.length,
        miscAssets: miscAssets.length,
        miscAssetOwners: miscAssetOwners.length,
        mortgageTracks: mortgageTracks.length,
        netWorthSnapshots: netWorthSnapshots.length,
        budgetCategoryGroups: budgetCategoryGroups.length,
        budgetCategories: budgetCategories.length,
        budgetPayees: budgetPayees.length,
        budgetTags: budgetTags.length,
        budgetTransactions: budgetTransactions.length,
        budgetTransactionTags: budgetTransactionTags.length,
        riseupCategories: riseupCategories.length,
        payeeCategoryRules: payeeCategoryRules.length,
        insurancePolicies: insurancePolicies.length,
        shoppingCategories: shoppingCategories.length,
        shoppingItems: shoppingItems.length,
        shoppingCartItems: shoppingCartItems.length,
        shoppingDeliveries: shoppingDeliveries.length,
        moneytorStockHoldings: moneytorStockHoldings.length,
        moneytorStockSnapshots: moneytorStockSnapshots.length,
        moneytorAccounts: moneytorAccounts.length,
        moneytorAccountSnapshots: moneytorAccountSnapshots.length,
        moneytorPensionFunds: moneytorPensionFunds.length,
        moneytorPensionSnapshots: moneytorPensionSnapshots.length,
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
    zip.file('pension_accounts.json', JSON.stringify(pensionAccounts, jsonSerializer, 2));
    zip.file(
      'pension_account_owners.json',
      JSON.stringify(pensionAccountOwners, jsonSerializer, 2)
    );
    zip.file('pension_deposits.json', JSON.stringify(pensionDeposits, jsonSerializer, 2));
    zip.file('misc_assets.json', JSON.stringify(miscAssets, jsonSerializer, 2));
    zip.file('misc_asset_owners.json', JSON.stringify(miscAssetOwners, jsonSerializer, 2));
    zip.file('mortgage_tracks.json', JSON.stringify(mortgageTracks, jsonSerializer, 2));
    zip.file('net_worth_snapshots.json', JSON.stringify(netWorthSnapshots, jsonSerializer, 2));
    zip.file(
      'budget_category_groups.json',
      JSON.stringify(budgetCategoryGroups, jsonSerializer, 2)
    );
    zip.file('budget_categories.json', JSON.stringify(budgetCategories, jsonSerializer, 2));
    zip.file('budget_payees.json', JSON.stringify(budgetPayees, jsonSerializer, 2));
    zip.file('budget_tags.json', JSON.stringify(budgetTags, jsonSerializer, 2));
    zip.file('budget_transactions.json', JSON.stringify(budgetTransactions, jsonSerializer, 2));
    zip.file(
      'budget_transaction_tags.json',
      JSON.stringify(budgetTransactionTags, jsonSerializer, 2)
    );
    zip.file('riseup_categories.json', JSON.stringify(riseupCategories, jsonSerializer, 2));
    zip.file('payee_category_rules.json', JSON.stringify(payeeCategoryRules, jsonSerializer, 2));
    zip.file('insurance_policies.json', JSON.stringify(insurancePolicies, jsonSerializer, 2));
    zip.file('shopping_categories.json', JSON.stringify(shoppingCategories, jsonSerializer, 2));
    zip.file('shopping_items.json', JSON.stringify(shoppingItems, jsonSerializer, 2));
    zip.file('shopping_cart_items.json', JSON.stringify(shoppingCartItems, jsonSerializer, 2));
    zip.file('shopping_deliveries.json', JSON.stringify(shoppingDeliveries, jsonSerializer, 2));
    zip.file(
      'moneytor_stock_holdings.json',
      JSON.stringify(moneytorStockHoldings, jsonSerializer, 2)
    );
    zip.file(
      'moneytor_stock_snapshots.json',
      JSON.stringify(moneytorStockSnapshots, jsonSerializer, 2)
    );
    zip.file('moneytor_accounts.json', JSON.stringify(moneytorAccounts, jsonSerializer, 2));
    zip.file(
      'moneytor_account_snapshots.json',
      JSON.stringify(moneytorAccountSnapshots, jsonSerializer, 2)
    );
    zip.file(
      'moneytor_pension_funds.json',
      JSON.stringify(moneytorPensionFunds, jsonSerializer, 2)
    );
    zip.file(
      'moneytor_pension_snapshots.json',
      JSON.stringify(moneytorPensionSnapshots, jsonSerializer, 2)
    );

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
