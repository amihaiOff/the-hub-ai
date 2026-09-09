import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getHouseholdIdFromBackupToken } from '@/lib/auth-api-key';
import { prisma } from '@/lib/db';
import JSZip from 'jszip';
import { pathInArchive } from '@/lib/api/backup-layout';

// Extend timeout for backup operations with large datasets
export const maxDuration = 60;

/**
 * GET /api/backup
 * Creates a full database backup as a downloadable ZIP file.
 * Contains JSON files for each table, grouped into folders by app section.
 *
 * Two ways in:
 *  - a signed-in browser session (the Settings → Download Backup button), or
 *  - `Authorization: Bearer <BACKUP_TOKEN>`, so the scheduled Drive backup can
 *    fetch an archive unattended. That token can pull everything, which is why
 *    it's a dedicated secret rather than a reuse of the agent/pages tokens.
 */
export async function GET(request: NextRequest) {
  try {
    // The session lookup is deliberately non-fatal. It reaches out to the auth
    // provider, and a scheduled backup arrives with no cookies at all — if that
    // call throws, the token path must still get its chance. Letting it
    // propagate turned every request here into a 500, valid token included.
    let user = null;
    try {
      user = await getCurrentUser();
    } catch {
      user = null;
    }

    const tokenHouseholdId = user ? null : await getHouseholdIdFromBackupToken(request);
    if (!user && !tokenHouseholdId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all data from the tables we back up. Intentionally excluded:
    //   - stock_price_history (price cache; the 6-hourly cron rebuilds it)
    //   - verification_tokens (auth artifacts)
    //   - cron_run_logs (runtime telemetry)
    //   - market_rate_fetch_logs (BoI-prime fetch telemetry; regenerable)
    //   - budget_categorization_logs (AI-categorization telemetry: token usage +
    //     decision audit log; regenerable, not user content)
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
      ccGenericPayeeNames,
      budgetAccountNames,
      partnerContacts,
      moneytorDropLogs,
      moneytorRealEstate,
      moneytorRealEstateSnapshots,
      moneytorSyncLogs,
      tasks,
      taskCategories,
      taskTags,
      taskShares,
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
      generalLogs,
      pages,
      pageTabs,
      pageSections,
      favorites,
      wikiConcepts,
      wikiConceptProjects,
      wikiQuestions,
      wikiQuestionAttempts,
      stockAccounts,
      stockAccountOwners,
      stockHoldings,
      stockAccountCash,
      householdInvites,
      marketRates,
      moneytorTransactions,
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
      prisma.ccGenericPayeeName.findMany(),
      prisma.budgetAccountName.findMany(),
      prisma.partnerContact.findMany(),
      prisma.moneytorDropLog.findMany(),
      prisma.moneytorRealEstate.findMany(),
      prisma.moneytorRealEstateSnapshot.findMany(),
      prisma.moneytorSyncLog.findMany(),
      prisma.task.findMany({ include: { tags: { select: { id: true } } } }),
      prisma.taskCategory.findMany(),
      prisma.taskTag.findMany(),
      prisma.taskShare.findMany(),
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
      prisma.generalLog.findMany(),
      prisma.page.findMany(),
      prisma.pageTab.findMany(),
      prisma.pageSection.findMany(),
      prisma.favorite.findMany(),
      prisma.wikiConcept.findMany(),
      prisma.wikiConceptProject.findMany(),
      prisma.wikiQuestion.findMany(),
      prisma.wikiQuestionAttempt.findMany(),
      prisma.stockAccount.findMany(),
      prisma.stockAccountOwner.findMany(),
      prisma.stockHolding.findMany(),
      prisma.stockAccountCash.findMany(),
      prisma.householdInvite.findMany(),
      prisma.marketRate.findMany(),
      prisma.moneytorTransaction.findMany(),
    ]);

    // Create backup metadata
    const metadata = {
      backupDate: new Date().toISOString(),
      schemaVersion: '3.0',
      createdBy: user?.email ?? 'scheduled-backup',
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
        ccGenericPayeeNames: ccGenericPayeeNames.length,
        budgetAccountNames: budgetAccountNames.length,
        partnerContacts: partnerContacts.length,
        moneytorDropLogs: moneytorDropLogs.length,
        moneytorRealEstate: moneytorRealEstate.length,
        moneytorRealEstateSnapshots: moneytorRealEstateSnapshots.length,
        moneytorSyncLogs: moneytorSyncLogs.length,
        tasks: tasks.length,
        taskCategories: taskCategories.length,
        taskTags: taskTags.length,
        taskShares: taskShares.length,
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
        generalLogs: generalLogs.length,
        pages: pages.length,
        pageTabs: pageTabs.length,
        pageSections: pageSections.length,
        favorites: favorites.length,
        wikiConcepts: wikiConcepts.length,
        wikiConceptProjects: wikiConceptProjects.length,
        wikiQuestions: wikiQuestions.length,
        wikiQuestionAttempts: wikiQuestionAttempts.length,
        stockAccounts: stockAccounts.length,
        stockAccountOwners: stockAccountOwners.length,
        stockHoldings: stockHoldings.length,
        stockAccountCash: stockAccountCash.length,
        householdInvites: householdInvites.length,
        marketRates: marketRates.length,
        moneytorTransactions: moneytorTransactions.length,
      },
    };

    // Create ZIP file
    const zip = new JSZip();

    // Add metadata
    zip.file(pathInArchive('metadata.json'), JSON.stringify(metadata, null, 2));

    // Add each table as a separate JSON file
    // Convert Decimal and Date fields to serializable format
    zip.file(pathInArchive('users.json'), JSON.stringify(users, jsonSerializer, 2));
    zip.file(pathInArchive('profiles.json'), JSON.stringify(profiles, jsonSerializer, 2));
    zip.file(pathInArchive('households.json'), JSON.stringify(households, jsonSerializer, 2));
    zip.file(
      pathInArchive('household_members.json'),
      JSON.stringify(householdMembers, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('pension_accounts.json'),
      JSON.stringify(pensionAccounts, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('pension_account_owners.json'),
      JSON.stringify(pensionAccountOwners, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('pension_deposits.json'),
      JSON.stringify(pensionDeposits, jsonSerializer, 2)
    );
    zip.file(pathInArchive('misc_assets.json'), JSON.stringify(miscAssets, jsonSerializer, 2));
    zip.file(
      pathInArchive('misc_asset_owners.json'),
      JSON.stringify(miscAssetOwners, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('mortgage_tracks.json'),
      JSON.stringify(mortgageTracks, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('net_worth_snapshots.json'),
      JSON.stringify(netWorthSnapshots, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('budget_category_groups.json'),
      JSON.stringify(budgetCategoryGroups, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('budget_categories.json'),
      JSON.stringify(budgetCategories, jsonSerializer, 2)
    );
    zip.file(pathInArchive('budget_payees.json'), JSON.stringify(budgetPayees, jsonSerializer, 2));
    zip.file(pathInArchive('budget_tags.json'), JSON.stringify(budgetTags, jsonSerializer, 2));
    zip.file(
      pathInArchive('budget_transactions.json'),
      JSON.stringify(budgetTransactions, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('budget_transaction_tags.json'),
      JSON.stringify(budgetTransactionTags, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('cc_generic_payee_names.json'),
      JSON.stringify(ccGenericPayeeNames, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('budget_account_names.json'),
      JSON.stringify(budgetAccountNames, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('partner_contacts.json'),
      JSON.stringify(partnerContacts, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_drop_logs.json'),
      JSON.stringify(moneytorDropLogs, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_real_estate.json'),
      JSON.stringify(moneytorRealEstate, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_real_estate_snapshots.json'),
      JSON.stringify(moneytorRealEstateSnapshots, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_sync_logs.json'),
      JSON.stringify(moneytorSyncLogs, jsonSerializer, 2)
    );
    zip.file(pathInArchive('tasks.json'), JSON.stringify(tasks, jsonSerializer, 2));
    zip.file(
      pathInArchive('task_categories.json'),
      JSON.stringify(taskCategories, jsonSerializer, 2)
    );
    zip.file(pathInArchive('task_tags.json'), JSON.stringify(taskTags, jsonSerializer, 2));
    zip.file(pathInArchive('task_shares.json'), JSON.stringify(taskShares, jsonSerializer, 2));
    zip.file(
      pathInArchive('riseup_categories.json'),
      JSON.stringify(riseupCategories, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('payee_category_rules.json'),
      JSON.stringify(payeeCategoryRules, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('insurance_policies.json'),
      JSON.stringify(insurancePolicies, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('shopping_categories.json'),
      JSON.stringify(shoppingCategories, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('shopping_items.json'),
      JSON.stringify(shoppingItems, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('shopping_cart_items.json'),
      JSON.stringify(shoppingCartItems, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('shopping_deliveries.json'),
      JSON.stringify(shoppingDeliveries, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_stock_holdings.json'),
      JSON.stringify(moneytorStockHoldings, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_stock_snapshots.json'),
      JSON.stringify(moneytorStockSnapshots, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_accounts.json'),
      JSON.stringify(moneytorAccounts, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_account_snapshots.json'),
      JSON.stringify(moneytorAccountSnapshots, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_pension_funds.json'),
      JSON.stringify(moneytorPensionFunds, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('moneytor_pension_snapshots.json'),
      JSON.stringify(moneytorPensionSnapshots, jsonSerializer, 2)
    );
    zip.file(pathInArchive('general_logs.json'), JSON.stringify(generalLogs, jsonSerializer, 2));
    zip.file(pathInArchive('pages.json'), JSON.stringify(pages, jsonSerializer, 2));
    zip.file(pathInArchive('page_tabs.json'), JSON.stringify(pageTabs, jsonSerializer, 2));
    zip.file(pathInArchive('page_sections.json'), JSON.stringify(pageSections, jsonSerializer, 2));
    zip.file(pathInArchive('favorites.json'), JSON.stringify(favorites, jsonSerializer, 2));
    zip.file(pathInArchive('wiki_concepts.json'), JSON.stringify(wikiConcepts, jsonSerializer, 2));
    zip.file(
      pathInArchive('wiki_concept_projects.json'),
      JSON.stringify(wikiConceptProjects, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('wiki_questions.json'),
      JSON.stringify(wikiQuestions, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('wiki_question_attempts.json'),
      JSON.stringify(wikiQuestionAttempts, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('stock_accounts.json'),
      JSON.stringify(stockAccounts, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('stock_account_owners.json'),
      JSON.stringify(stockAccountOwners, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('stock_holdings.json'),
      JSON.stringify(stockHoldings, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('stock_account_cash.json'),
      JSON.stringify(stockAccountCash, jsonSerializer, 2)
    );
    zip.file(
      pathInArchive('household_invites.json'),
      JSON.stringify(householdInvites, jsonSerializer, 2)
    );
    zip.file(pathInArchive('market_rates.json'), JSON.stringify(marketRates, jsonSerializer, 2));
    zip.file(
      pathInArchive('moneytor_transactions.json'),
      JSON.stringify(moneytorTransactions, jsonSerializer, 2)
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
