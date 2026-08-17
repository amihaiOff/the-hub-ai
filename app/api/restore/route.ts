import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import JSZip from 'jszip';
import {
  HouseholdRole,
  PensionAccountType,
  MiscAssetType,
  TransactionType,
  TransactionSource,
  PaymentMethod,
  TaskPriority,
  Prisma,
} from '@prisma/client';

// Extend timeout for restore operations (Neon serverless can be slow)
export const maxDuration = 60;

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

    // Accept all backups produced since the format stabilised. Older versions
    // simply have empty arrays for tables added in later releases.
    const supportedVersions = [
      '1.0',
      '1.1',
      '1.2',
      '1.3',
      '1.4',
      '1.5',
      '2.0',
      '2.1',
      '2.2',
      '2.3',
      '2.4',
      '2.5',
      '2.6',
      '2.7',
      '2.8',
    ];
    if (!supportedVersions.includes(metadata.schemaVersion)) {
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
    const stockAccountCash = await parseFile<Record<string, unknown>>('stock_account_cash.json');
    const stockPriceHistory = await parseFile<Record<string, unknown>>('stock_price_history.json');
    const pensionAccounts = await parseFile<Record<string, unknown>>('pension_accounts.json');
    const pensionAccountOwners = await parseFile<Record<string, unknown>>(
      'pension_account_owners.json'
    );
    const pensionDeposits = await parseFile<Record<string, unknown>>('pension_deposits.json');
    const miscAssets = await parseFile<Record<string, unknown>>('misc_assets.json');
    const miscAssetOwners = await parseFile<Record<string, unknown>>('misc_asset_owners.json');
    const mortgageTracks = await parseFile<Record<string, unknown>>('mortgage_tracks.json');
    const netWorthSnapshots = await parseFile<Record<string, unknown>>('net_worth_snapshots.json');

    // Budget tables (present in schema version 1.1+, empty for 1.0 backups)
    const budgetCategoryGroups = await parseFile<Record<string, unknown>>(
      'budget_category_groups.json'
    );
    const budgetCategories = await parseFile<Record<string, unknown>>('budget_categories.json');
    const budgetPayees = await parseFile<Record<string, unknown>>('budget_payees.json');
    const budgetTags = await parseFile<Record<string, unknown>>('budget_tags.json');
    const budgetTransactions = await parseFile<Record<string, unknown>>('budget_transactions.json');
    const budgetTransactionTags = await parseFile<Record<string, unknown>>(
      'budget_transaction_tags.json'
    );
    const riseupCategories = await parseFile<Record<string, unknown>>('riseup_categories.json');
    const payeeCategoryRules = await parseFile<Record<string, unknown>>(
      'payee_category_rules.json'
    );
    const shoppingCategories = await parseFile<Record<string, unknown>>('shopping_categories.json');
    const shoppingItems = await parseFile<Record<string, unknown>>('shopping_items.json');
    const shoppingCartItems = await parseFile<Record<string, unknown>>('shopping_cart_items.json');
    const shoppingDeliveries = await parseFile<Record<string, unknown>>('shopping_deliveries.json');
    // Schema version 1.3+ tables (empty for older backups)
    const insurancePolicies = await parseFile<Record<string, unknown>>('insurance_policies.json');
    const moneytorStockHoldings = await parseFile<Record<string, unknown>>(
      'moneytor_stock_holdings.json'
    );
    const moneytorStockSnapshots = await parseFile<Record<string, unknown>>(
      'moneytor_stock_snapshots.json'
    );
    const moneytorAccounts = await parseFile<Record<string, unknown>>('moneytor_accounts.json');
    const moneytorAccountSnapshots = await parseFile<Record<string, unknown>>(
      'moneytor_account_snapshots.json'
    );
    // Schema version 1.4+ tables (empty for older backups)
    const moneytorPensionFunds = await parseFile<Record<string, unknown>>(
      'moneytor_pension_funds.json'
    );
    const moneytorPensionSnapshots = await parseFile<Record<string, unknown>>(
      'moneytor_pension_snapshots.json'
    );
    // Schema version 2.x tables that the backup captured but earlier restore
    // versions dropped. Empty arrays for older backups that predate them.
    const partnerContacts = await parseFile<Record<string, unknown>>('partner_contacts.json');
    const ccGenericPayeeNames = await parseFile<Record<string, unknown>>(
      'cc_generic_payee_names.json'
    );
    const budgetAccountNames = await parseFile<Record<string, unknown>>(
      'budget_account_names.json'
    );
    const moneytorDropLogs = await parseFile<Record<string, unknown>>('moneytor_drop_logs.json');
    const moneytorRealEstate = await parseFile<Record<string, unknown>>(
      'moneytor_real_estate.json'
    );
    const moneytorRealEstateSnapshots = await parseFile<Record<string, unknown>>(
      'moneytor_real_estate_snapshots.json'
    );
    const moneytorSyncLogs = await parseFile<Record<string, unknown>>('moneytor_sync_logs.json');
    const taskCategories = await parseFile<Record<string, unknown>>('task_categories.json');
    const taskTags = await parseFile<Record<string, unknown>>('task_tags.json');
    const tasks = await parseFile<Record<string, unknown>>('tasks.json');
    const taskShares = await parseFile<Record<string, unknown>>('task_shares.json');
    const generalLogs = await parseFile<Record<string, unknown>>('general_logs.json');
    // Schema version 2.3+ (empty for older backups).
    const pages = await parseFile<Record<string, unknown>>('pages.json');
    // Schema version 2.4+ (empty for older backups).
    const pageTabs = await parseFile<Record<string, unknown>>('page_tabs.json');
    // Schema version 2.8+ (empty for older backups).
    const pageSections = await parseFile<Record<string, unknown>>('page_sections.json');
    // Wiki module — schema version 2.5+ (empty for older backups).
    const wikiConcepts = await parseFile<Record<string, unknown>>('wiki_concepts.json');
    const wikiConceptProjects = await parseFile<Record<string, unknown>>(
      'wiki_concept_projects.json'
    );
    const wikiQuestions = await parseFile<Record<string, unknown>>('wiki_questions.json');
    const wikiQuestionAttempts = await parseFile<Record<string, unknown>>(
      'wiki_question_attempts.json'
    );
    // Schema version 2.6+ (empty for older backups).
    const householdInvites = await parseFile<Record<string, unknown>>('household_invites.json');
    const marketRates = await parseFile<Record<string, unknown>>('market_rates.json');
    const moneytorTransactions = await parseFile<Record<string, unknown>>(
      'moneytor_transactions.json'
    );

    // Execute operations sequentially without transaction
    // Neon serverless doesn't support long-running transactions well
    // If restore fails midway, database may be in partial state - user should retry

    // Delete all existing data in reverse order of dependencies
    console.log('Deleting existing data...');
    // Tasks module (children first: shares → tasks → tags/categories). Deleting
    // tasks cascades the implicit task↔tag join rows.
    await prisma.taskShare.deleteMany();
    await prisma.task.deleteMany();
    await prisma.taskTag.deleteMany();
    await prisma.taskCategory.deleteMany();
    // Pages (Areas documents) — tabs are children, delete them first.
    // page_sections is referenced by pages via a nullable FK (ON DELETE SET
    // NULL), so we could delete either first; wipe tabs → pages → sections
    // to keep the order deterministic.
    await prisma.pageTab.deleteMany();
    await prisma.page.deleteMany();
    await prisma.pageSection.deleteMany();
    // Wiki module — children (attempts, memberships, questions) before concepts.
    await prisma.wikiQuestionAttempt.deleteMany();
    await prisma.wikiConceptProject.deleteMany();
    await prisma.wikiQuestion.deleteMany();
    await prisma.wikiConcept.deleteMany();
    // Household-scoped leaf tables added to the backup in the 2.x line
    await prisma.partnerContact.deleteMany();
    await prisma.ccGenericPayeeName.deleteMany();
    await prisma.budgetAccountName.deleteMany();
    await prisma.generalLog.deleteMany();
    await prisma.moneytorDropLog.deleteMany();
    await prisma.moneytorSyncLog.deleteMany();
    // MoneytorTransaction: raw sync archive. Delete before moneytorAccount even
    // though there's no DB-level FK today, since Moneytor accounts are the
    // conceptual parent and this keeps the delete order stable.
    await prisma.moneytorTransaction.deleteMany();
    // Household-scoped rate history / pending invites — leaf tables.
    await prisma.householdInvite.deleteMany();
    await prisma.marketRate.deleteMany();
    await prisma.moneytorRealEstateSnapshot.deleteMany();
    await prisma.moneytorRealEstate.deleteMany();
    // Moneytor tables (no children other than household — safe to wipe first)
    await prisma.moneytorPensionSnapshot.deleteMany();
    await prisma.moneytorPensionFund.deleteMany();
    await prisma.moneytorAccountSnapshot.deleteMany();
    await prisma.moneytorAccount.deleteMany();
    await prisma.moneytorStockSnapshot.deleteMany();
    await prisma.moneytorStockHolding.deleteMany();
    // Insurance
    await prisma.insurancePolicy.deleteMany();
    // Shopping tables (children first)
    await prisma.shoppingDelivery.deleteMany();
    await prisma.shoppingCartItem.deleteMany();
    await prisma.shoppingItem.deleteMany();
    await prisma.shoppingCategory.deleteMany();
    // Budget tables (children first)
    await prisma.budgetTransactionTag.deleteMany();
    await prisma.budgetTransaction.deleteMany();
    await prisma.payeeCategoryRule.deleteMany();
    await prisma.budgetPayee.deleteMany();
    await prisma.riseupCategory.deleteMany();
    await prisma.budgetCategory.deleteMany();
    await prisma.budgetCategoryGroup.deleteMany();
    await prisma.budgetTag.deleteMany();
    // Original tables
    await prisma.netWorthSnapshot.deleteMany();
    // Legacy stock-portfolio tables (old "portfolio" design, superseded by
    // Moneytor accounts). Re-included in the backup from 2.6 onward so a
    // user who still has data in these tables round-trips cleanly; older 2.x
    // backups (that skipped them) parse as empty arrays here. stock_price_history
    // remains excluded from the backup (regenerable price cache) — the delete
    // still runs so it doesn't leak stale rows across a restore.
    await prisma.stockPriceHistory.deleteMany();
    await prisma.stockAccountCash.deleteMany();
    await prisma.stockHolding.deleteMany();
    await prisma.stockAccountOwner.deleteMany();
    await prisma.stockAccount.deleteMany();
    await prisma.pensionDeposit.deleteMany();
    await prisma.pensionAccountOwner.deleteMany();
    await prisma.pensionAccount.deleteMany();
    await prisma.mortgageTrack.deleteMany();
    await prisma.miscAssetOwner.deleteMany();
    await prisma.miscAsset.deleteMany();
    await prisma.householdMember.deleteMany();
    await prisma.household.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();

    // Insert data in order of dependencies (parents before children)
    console.log('Restoring data...');

    // Note: Using individual create calls instead of createMany for Neon compatibility
    // createMany has issues with Neon's HTTP fetch mode (poolQueryViaFetch: true)

    // 1. Users
    for (const u of users) {
      await prisma.user.create({
        data: {
          id: u.id as string,
          email: u.email as string,
          name: u.name as string | null,
          image: u.image as string | null,
          createdAt: new Date(u.createdAt as string),
          updatedAt: new Date(u.updatedAt as string),
        },
      });
    }

    // 2. Profiles
    for (const p of profiles) {
      await prisma.profile.create({
        data: {
          id: p.id as string,
          name: p.name as string,
          image: p.image as string | null,
          color: p.color as string | null,
          userId: p.userId as string | null,
          createdAt: new Date(p.createdAt as string),
          updatedAt: new Date(p.updatedAt as string),
        },
      });
    }

    // 3. Households
    for (const h of households) {
      await prisma.household.create({
        data: {
          id: h.id as string,
          name: h.name as string,
          description: h.description as string | null,
          createdAt: new Date(h.createdAt as string),
          updatedAt: new Date(h.updatedAt as string),
        },
      });
    }

    // 4. Household Members
    for (const hm of householdMembers) {
      await prisma.householdMember.create({
        data: {
          id: hm.id as string,
          householdId: hm.householdId as string,
          profileId: hm.profileId as string,
          role: hm.role as HouseholdRole,
          joinedAt: new Date(hm.joinedAt as string),
        },
      });
    }

    // 5. Stock Accounts
    for (const sa of stockAccounts) {
      await prisma.stockAccount.create({
        data: {
          id: sa.id as string,
          name: sa.name as string,
          broker: sa.broker as string | null,
          currency: sa.currency as string,
          userId: sa.userId as string | null,
          createdAt: new Date(sa.createdAt as string),
          updatedAt: new Date(sa.updatedAt as string),
        },
      });
    }

    // 6. Stock Account Owners
    for (const sao of stockAccountOwners) {
      await prisma.stockAccountOwner.create({
        data: {
          id: sao.id as string,
          accountId: sao.accountId as string,
          profileId: sao.profileId as string,
        },
      });
    }

    // 7. Stock Holdings
    for (const sh of stockHoldings) {
      await prisma.stockHolding.create({
        data: {
          id: sh.id as string,
          symbol: sh.symbol as string,
          name: (sh.name as string | null) ?? null,
          taseSymbol: (sh.taseSymbol as string | null) ?? null,
          quantity: sh.quantity as number,
          avgCostBasis: sh.avgCostBasis as number,
          accountId: sh.accountId as string,
          createdAt: new Date(sh.createdAt as string),
          updatedAt: new Date(sh.updatedAt as string),
        },
      });
    }

    // 8. Stock Account Cash
    for (const sac of stockAccountCash) {
      await prisma.stockAccountCash.create({
        data: {
          id: sac.id as string,
          accountId: sac.accountId as string,
          currency: sac.currency as string,
          amount: sac.amount as string,
          createdAt: new Date(sac.createdAt as string),
          updatedAt: new Date(sac.updatedAt as string),
        },
      });
    }

    // 9. Stock Price History
    for (const sph of stockPriceHistory) {
      await prisma.stockPriceHistory.create({
        data: {
          id: sph.id as string,
          symbol: sph.symbol as string,
          price: sph.price as number,
          timestamp: new Date(sph.timestamp as string),
        },
      });
    }

    // 9. Pension Accounts
    for (const pa of pensionAccounts) {
      await prisma.pensionAccount.create({
        data: {
          id: pa.id as string,
          type: pa.type as PensionAccountType,
          providerName: pa.providerName as string,
          accountName: pa.accountName as string,
          currentValue: pa.currentValue as number,
          feeFromDeposit: pa.feeFromDeposit as number,
          feeFromTotal: pa.feeFromTotal as number,
          accountNumber: (pa.accountNumber as string | null) ?? null,
          userId: pa.userId as string | null,
          createdAt: new Date(pa.createdAt as string),
          updatedAt: new Date(pa.updatedAt as string),
        },
      });
    }

    // 10. Pension Account Owners
    for (const pao of pensionAccountOwners) {
      await prisma.pensionAccountOwner.create({
        data: {
          id: pao.id as string,
          accountId: pao.accountId as string,
          profileId: pao.profileId as string,
        },
      });
    }

    // 11. Pension Deposits
    for (const pd of pensionDeposits) {
      await prisma.pensionDeposit.create({
        data: {
          id: pd.id as string,
          depositDate: new Date(pd.depositDate as string),
          salaryMonth: new Date(pd.salaryMonth as string),
          amount: pd.amount as number,
          employer: pd.employer as string,
          accountId: pd.accountId as string,
          createdAt: new Date(pd.createdAt as string),
        },
      });
    }

    // 12. Misc Assets
    for (const ma of miscAssets) {
      await prisma.miscAsset.create({
        data: {
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
        },
      });
    }

    // 13. Misc Asset Owners
    for (const mao of miscAssetOwners) {
      await prisma.miscAssetOwner.create({
        data: {
          id: mao.id as string,
          assetId: mao.assetId as string,
          profileId: mao.profileId as string,
        },
      });
    }

    // 14. Mortgage Tracks
    for (const mt of mortgageTracks) {
      await prisma.mortgageTrack.create({
        data: {
          id: mt.id as string,
          mortgageId: mt.mortgageId as string,
          name: mt.name as string,
          amount: mt.amount as string,
          interestRate: mt.interestRate as string,
          monthlyPayment: mt.monthlyPayment != null ? (mt.monthlyPayment as string) : null,
          maturityDate: mt.maturityDate ? new Date(mt.maturityDate as string) : null,
          sortOrder: mt.sortOrder as number,
          createdAt: new Date(mt.createdAt as string),
          updatedAt: new Date(mt.updatedAt as string),
        },
      });
    }

    // 15. Net Worth Snapshots
    for (const nws of netWorthSnapshots) {
      await prisma.netWorthSnapshot.create({
        data: {
          id: nws.id as string,
          userId: nws.userId as string,
          date: new Date(nws.date as string),
          netWorth: nws.netWorth as number,
          portfolio: nws.portfolio as number,
          pension: nws.pension as number,
          assets: nws.assets as number,
          createdAt: new Date(nws.createdAt as string),
        },
      });
    }

    // 15. Budget Category Groups
    for (const bcg of budgetCategoryGroups) {
      await prisma.budgetCategoryGroup.create({
        data: {
          id: bcg.id as string,
          name: bcg.name as string,
          sortOrder: bcg.sortOrder as number,
          householdId: bcg.householdId as string,
          createdAt: new Date(bcg.createdAt as string),
          updatedAt: new Date(bcg.updatedAt as string),
        },
      });
    }

    // 16. Budget Categories
    for (const bc of budgetCategories) {
      await prisma.budgetCategory.create({
        data: {
          id: bc.id as string,
          name: bc.name as string,
          groupId: bc.groupId as string,
          budget: bc.budget != null ? (bc.budget as string) : null,
          isMust: bc.isMust as boolean,
          sortOrder: bc.sortOrder as number,
          householdId: bc.householdId as string,
          createdAt: new Date(bc.createdAt as string),
          updatedAt: new Date(bc.updatedAt as string),
        },
      });
    }

    // 16b. Payee Category Rules (after categories, before payees)
    for (const pcr of payeeCategoryRules) {
      await prisma.payeeCategoryRule.create({
        data: {
          id: pcr.id as string,
          name: pcr.name as string,
          operator: pcr.operator as string,
          value: pcr.value as string,
          categoryId: (pcr.categoryId as string | null) ?? null,
          markNeverDefault: (pcr.markNeverDefault as boolean | undefined) ?? false,
          sortOrder: pcr.sortOrder as number,
          isActive: pcr.isActive as boolean,
          householdId: pcr.householdId as string,
          createdAt: new Date(pcr.createdAt as string),
          updatedAt: new Date(pcr.updatedAt as string),
        },
      });
    }

    // 17. Budget Payees
    for (const bp of budgetPayees) {
      await prisma.budgetPayee.create({
        data: {
          id: bp.id as string,
          name: bp.name as string,
          categoryId: (bp.categoryId as string | null) ?? null,
          neverDefault: (bp.neverDefault as boolean | undefined) ?? false,
          householdId: bp.householdId as string,
          createdAt: new Date(bp.createdAt as string),
          updatedAt: new Date(bp.updatedAt as string),
        },
      });
    }

    // 18. Budget Tags
    for (const bt of budgetTags) {
      await prisma.budgetTag.create({
        data: {
          id: bt.id as string,
          name: bt.name as string,
          color: bt.color as string,
          householdId: bt.householdId as string,
          createdAt: new Date(bt.createdAt as string),
          updatedAt: new Date(bt.updatedAt as string),
        },
      });
    }

    // 19. Riseup Categories
    for (const rc of riseupCategories) {
      await prisma.riseupCategory.create({
        data: {
          id: rc.id as string,
          name: rc.name as string,
          isDeleted: rc.isDeleted as boolean,
          budgetCategoryId: (rc.budgetCategoryId as string | null) ?? null,
          householdId: rc.householdId as string,
          createdAt: new Date(rc.createdAt as string),
          updatedAt: new Date(rc.updatedAt as string),
        },
      });
    }

    // 20. Budget Transactions (insert without originalTransactionId first, then update)
    const transactionsWithOriginal: { id: string; originalTransactionId: string }[] = [];
    for (const btx of budgetTransactions) {
      if (btx.originalTransactionId) {
        transactionsWithOriginal.push({
          id: btx.id as string,
          originalTransactionId: btx.originalTransactionId as string,
        });
      }
      await prisma.budgetTransaction.create({
        data: {
          id: btx.id as string,
          type: btx.type as TransactionType,
          transactionDate: new Date(btx.transactionDate as string),
          paymentDate: btx.paymentDate ? new Date(btx.paymentDate as string) : null,
          amountIls: btx.amountIls as string,
          currency: btx.currency as string,
          amountOriginal: btx.amountOriginal as string,
          categoryId: (btx.categoryId as string | null) ?? null,
          payeeId: (btx.payeeId as string | null) ?? null,
          paymentMethod: btx.paymentMethod as PaymentMethod,
          paymentNumber: (btx.paymentNumber as number | null) ?? null,
          totalPayments: (btx.totalPayments as number | null) ?? null,
          notes: (btx.notes as string | null) ?? null,
          source: btx.source as TransactionSource,
          isRecurring: btx.isRecurring as boolean,
          isSplit: btx.isSplit as boolean,
          // originalTransactionId set in second pass to handle self-references
          paymentIdentifier: (btx.paymentIdentifier as string | null) ?? null,
          excludedFromFlow: btx.excludedFromFlow as boolean,
          isDeleted: (btx.isDeleted as boolean) ?? false,
          profileId: (btx.profileId as string | null) ?? null,
          householdId: btx.householdId as string,
          createdAt: new Date(btx.createdAt as string),
          updatedAt: new Date(btx.updatedAt as string),
        },
      });
    }

    // Update transactions that have originalTransactionId (split children)
    for (const ref of transactionsWithOriginal) {
      await prisma.budgetTransaction.update({
        where: { id: ref.id },
        data: { originalTransactionId: ref.originalTransactionId },
      });
    }

    // 21. Budget Transaction Tags
    for (const btt of budgetTransactionTags) {
      await prisma.budgetTransactionTag.create({
        data: {
          id: btt.id as string,
          transactionId: btt.transactionId as string,
          tagId: btt.tagId as string,
        },
      });
    }

    // 22. Shopping Categories
    for (const sc of shoppingCategories) {
      await prisma.shoppingCategory.create({
        data: {
          id: sc.id as string,
          name: sc.name as string,
          sortOrder: sc.sortOrder as number,
          householdId: sc.householdId as string,
          createdAt: new Date(sc.createdAt as string),
          updatedAt: new Date(sc.updatedAt as string),
        },
      });
    }

    // 23. Shopping Items (after categories)
    for (const si of shoppingItems) {
      await prisma.shoppingItem.create({
        data: {
          id: si.id as string,
          name: si.name as string,
          nameHe: (si.nameHe as string | null) ?? null,
          categoryId: si.categoryId as string,
          isDefault: (si.isDefault as boolean) ?? false,
          lastPurchasedAt: si.lastPurchasedAt ? new Date(si.lastPurchasedAt as string) : null,
          warningDays: (si.warningDays as number | null) ?? null,
          householdId: si.householdId as string,
          createdAt: new Date(si.createdAt as string),
          updatedAt: new Date(si.updatedAt as string),
        },
      });
    }

    // 24. Shopping Cart Items (after items)
    for (const sci of shoppingCartItems) {
      await prisma.shoppingCartItem.create({
        data: {
          id: sci.id as string,
          itemId: sci.itemId as string,
          quantity: sci.quantity as number,
          checked: (sci.checked as boolean) ?? false,
          householdId: sci.householdId as string,
          createdAt: new Date(sci.createdAt as string),
          updatedAt: new Date(sci.updatedAt as string),
        },
      });
    }

    // 25. Shopping Deliveries
    for (const sd of shoppingDeliveries) {
      await prisma.shoppingDelivery.create({
        data: {
          id: sd.id as string,
          deliveredAt: new Date(sd.deliveredAt as string),
          itemCount: sd.itemCount as number,
          householdId: sd.householdId as string,
          createdAt: new Date(sd.createdAt as string),
        },
      });
    }

    // 26. Insurance Policies (depends on profile + household)
    for (const ip of insurancePolicies) {
      await prisma.insurancePolicy.create({
        data: {
          id: ip.id as string,
          profileId: ip.profileId as string,
          householdId: ip.householdId as string,
          mainBranch: ip.mainBranch as string,
          subBranch: (ip.subBranch as string | null) ?? null,
          productType: (ip.productType as string | null) ?? null,
          company: (ip.company as string | null) ?? null,
          insurancePeriod: (ip.insurancePeriod as string | null) ?? null,
          additionalDetails: (ip.additionalDetails as string | null) ?? null,
          premiumIls: ip.premiumIls != null ? (ip.premiumIls as number | string) : null,
          premiumType: (ip.premiumType as string | null) ?? null,
          policyNumber: (ip.policyNumber as string | null) ?? null,
          planClassification: (ip.planClassification as string | null) ?? null,
          createdAt: new Date(ip.createdAt as string),
          updatedAt: new Date(ip.updatedAt as string),
        },
      });
    }

    // 27. Moneytor Stock Holdings (current snapshot of share-form assets)
    for (const msh of moneytorStockHoldings) {
      await prisma.moneytorStockHolding.create({
        data: {
          id: msh.id as string,
          productId: msh.productId as string,
          accountName: msh.accountName as string,
          broker: (msh.broker as string | null) ?? null,
          stockName: msh.stockName as string,
          amount: msh.amount as number | string,
          purchasePrice: msh.purchasePrice != null ? (msh.purchasePrice as number | string) : null,
          purchaseDate: msh.purchaseDate ? new Date(msh.purchaseDate as string) : null,
          stockPrice: msh.stockPrice as number | string,
          currency: msh.currency as string,
          totalWorthInBase: msh.totalWorthInBase as number | string,
          accountCash: msh.accountCash != null ? (msh.accountCash as number | string) : null,
          householdId: msh.householdId as string,
          syncedAt: new Date(msh.syncedAt as string),
          createdAt: new Date(msh.createdAt as string),
          updatedAt: new Date(msh.updatedAt as string),
        },
      });
    }

    // 28. Moneytor Stock Snapshots (daily history)
    for (const mss of moneytorStockSnapshots) {
      await prisma.moneytorStockSnapshot.create({
        data: {
          id: mss.id as string,
          snapshotDate: new Date(mss.snapshotDate as string),
          productId: mss.productId as string,
          accountName: mss.accountName as string,
          stockName: mss.stockName as string,
          amount: mss.amount as number | string,
          stockPrice: mss.stockPrice as number | string,
          currency: mss.currency as string,
          totalWorthInBase: mss.totalWorthInBase as number | string,
          accountCash: mss.accountCash != null ? (mss.accountCash as number | string) : null,
          householdId: mss.householdId as string,
          createdAt: new Date(mss.createdAt as string),
          updatedAt: new Date(mss.updatedAt as string),
        },
      });
    }

    // 29. Moneytor Accounts (bank + debt balances)
    for (const ma of moneytorAccounts) {
      await prisma.moneytorAccount.create({
        data: {
          id: ma.id as string,
          productId: ma.productId as string,
          form: ma.form as string,
          name: ma.name as string,
          institution: (ma.institution as string | null) ?? null,
          subtype: (ma.subtype as string | null) ?? null,
          accountNumber: (ma.accountNumber as string | null) ?? null,
          currency: ma.currency as string,
          balanceInBase: ma.balanceInBase as number | string,
          interestRate: ma.interestRate != null ? (ma.interestRate as number | string) : null,
          maturityDate: ma.maturityDate ? new Date(ma.maturityDate as string) : null,
          monthlyPayment: ma.monthlyPayment != null ? (ma.monthlyPayment as number | string) : null,
          customSubtitle: (ma.customSubtitle as string | null) ?? null,
          rawData: (ma.rawData as object) ?? undefined,
          householdId: ma.householdId as string,
          syncedAt: new Date(ma.syncedAt as string),
          createdAt: new Date(ma.createdAt as string),
          updatedAt: new Date(ma.updatedAt as string),
        },
      });
    }

    // 30. Moneytor Account Snapshots (daily balance history)
    for (const mas of moneytorAccountSnapshots) {
      await prisma.moneytorAccountSnapshot.create({
        data: {
          id: mas.id as string,
          snapshotDate: new Date(mas.snapshotDate as string),
          productId: mas.productId as string,
          form: mas.form as string,
          name: mas.name as string,
          balanceInBase: mas.balanceInBase as number | string,
          currency: mas.currency as string,
          householdId: mas.householdId as string,
          createdAt: new Date(mas.createdAt as string),
          updatedAt: new Date(mas.updatedAt as string),
        },
      });
    }

    // 31. Moneytor Pension Funds (pension + hishtalmut per investment track)
    for (const pf of moneytorPensionFunds) {
      const num = (k: string) => (pf[k] != null ? (pf[k] as number | string) : null);
      const date = (k: string) => (pf[k] ? new Date(pf[k] as string) : null);
      await prisma.moneytorPensionFund.create({
        data: {
          id: pf.id as string,
          productId: pf.productId as string,
          routeName: pf.routeName as string,
          routeCode: (pf.routeCode as string | null) ?? null,
          name: pf.name as string,
          institution: (pf.institution as string | null) ?? null,
          productType: pf.productType as string,
          sugKupa: (pf.sugKupa as number | null) ?? null,
          sugKerenPensia: (pf.sugKerenPensia as string | null) ?? null,
          accountNumber: (pf.accountNumber as string | null) ?? null,
          accountOwner: (pf.accountOwner as string | null) ?? null,
          fundId: (pf.fundId as string | null) ?? null,
          fundOpeningDate: date('fundOpeningDate'),
          amount: pf.amount as number | string,
          currency: pf.currency as string,
          balanceInBase: pf.balanceInBase as number | string,
          profitsFromLastYear: num('profitsFromLastYear'),
          monthlyDepositEmployee: num('monthlyDepositEmployee'),
          monthlyDepositEmployer: num('monthlyDepositEmployer'),
          monthlyDepositSum: num('monthlyDepositSum'),
          depositFrequency: (pf.depositFrequency as string | null) ?? null,
          employerProvisionPct: num('employerProvisionPct'),
          compensationProvisionPct: num('compensationProvisionPct'),
          mgmtFeeFromSavings: num('mgmtFeeFromSavings'),
          mgmtFeeFromDeposit: num('mgmtFeeFromDeposit'),
          projectedMonthlyPension: num('projectedMonthlyPension'),
          projectedSavingsWithPremiums: num('projectedSavingsWithPremiums'),
          projectedSavingsWithoutPremiums: num('projectedSavingsWithoutPremiums'),
          yearsToRetirement: (pf.yearsToRetirement as number | null) ?? null,
          gilPrisha: (pf.gilPrisha as number | null) ?? null,
          sumHafkadotPitsuyim: num('sumHafkadotPitsuyim'),
          sumHafkadotLoPitsuyim: num('sumHafkadotLoPitsuyim'),
          pitzuimMaasikNochechi: num('pitzuimMaasikNochechi'),
          pitzuimMarkivLemas: num('pitzuimMarkivLemas'),
          gender: (pf.gender as string | null) ?? null,
          taarichLeyda: date('taarichLeyda'),
          matsavMishpachti: (pf.matsavMishpachti as string | null) ?? null,
          rawData: (pf.rawData as object) ?? undefined,
          householdId: pf.householdId as string,
          syncedAt: new Date(pf.syncedAt as string),
          createdAt: new Date(pf.createdAt as string),
          updatedAt: new Date(pf.updatedAt as string),
        },
      });
    }

    // 32. Moneytor Pension Snapshots (monthly balance history per track)
    for (const ps of moneytorPensionSnapshots) {
      await prisma.moneytorPensionSnapshot.create({
        data: {
          id: ps.id as string,
          snapshotMonth: new Date(ps.snapshotMonth as string),
          productId: ps.productId as string,
          routeName: ps.routeName as string,
          name: ps.name as string,
          institution: (ps.institution as string | null) ?? null,
          productType: ps.productType as string,
          amount: ps.amount as number | string,
          balanceInBase: ps.balanceInBase as number | string,
          currency: ps.currency as string,
          monthlyDepositSum:
            ps.monthlyDepositSum != null ? (ps.monthlyDepositSum as number | string) : null,
          profitsFromLastYear:
            ps.profitsFromLastYear != null ? (ps.profitsFromLastYear as number | string) : null,
          householdId: ps.householdId as string,
          createdAt: new Date(ps.createdAt as string),
          updatedAt: new Date(ps.updatedAt as string),
        },
      });
    }

    // 33. Partner Contacts
    for (const pc of partnerContacts) {
      await prisma.partnerContact.create({
        data: {
          id: pc.id as string,
          name: pc.name as string,
          phone: pc.phone as string,
          householdId: pc.householdId as string,
          createdAt: new Date(pc.createdAt as string),
          updatedAt: new Date(pc.updatedAt as string),
        },
      });
    }

    // 34. CC Generic Payee Names
    for (const cg of ccGenericPayeeNames) {
      await prisma.ccGenericPayeeName.create({
        data: {
          id: cg.id as string,
          name: cg.name as string,
          householdId: cg.householdId as string,
          createdAt: new Date(cg.createdAt as string),
        },
      });
    }

    // 35. Budget Account Names
    for (const ban of budgetAccountNames) {
      await prisma.budgetAccountName.create({
        data: {
          id: ban.id as string,
          accountNumber: ban.accountNumber as string,
          name: ban.name as string,
          householdId: ban.householdId as string,
          createdAt: new Date(ban.createdAt as string),
          updatedAt: new Date(ban.updatedAt as string),
        },
      });
    }

    // 36. General Logs
    for (const gl of generalLogs) {
      await prisma.generalLog.create({
        data: {
          id: gl.id as string,
          householdId: gl.householdId as string,
          type: gl.type as string,
          subjectType: (gl.subjectType as string | null) ?? null,
          subjectId: (gl.subjectId as string | null) ?? null,
          oldValue: (gl.oldValue as string | null) ?? null,
          newValue: (gl.newValue as string | null) ?? null,
          description: (gl.description as string | null) ?? null,
          readAt: gl.readAt ? new Date(gl.readAt as string) : null,
          createdAt: new Date(gl.createdAt as string),
        },
      });
    }

    // 37. Moneytor Real Estate
    for (const re of moneytorRealEstate) {
      const num = (k: string) => (re[k] != null ? (re[k] as number | string) : null);
      const date = (k: string) => (re[k] ? new Date(re[k] as string) : null);
      await prisma.moneytorRealEstate.create({
        data: {
          id: re.id as string,
          productId: re.productId as string,
          name: re.name as string,
          currentValue: re.currentValue as number | string,
          balanceInBase: re.balanceInBase as number | string,
          currency: (re.currency as string) ?? 'ILS',
          ownership: num('ownership'),
          purchasePrice: num('purchasePrice'),
          purchaseDate: date('purchaseDate'),
          purchaseExpenses: num('purchaseExpenses'),
          country: (re.country as string | null) ?? null,
          city: (re.city as string | null) ?? null,
          street: (re.street as string | null) ?? null,
          houseNumber: (re.houseNumber as string | null) ?? null,
          address: (re.address as string | null) ?? null,
          latitude: num('latitude'),
          longitude: num('longitude'),
          propertyType: (re.propertyType as string | null) ?? null,
          propertyCondition: (re.propertyCondition as string | null) ?? null,
          measurementUnit: (re.measurementUnit as string | null) ?? null,
          builtArea: num('builtArea'),
          gardenBalconySize: num('gardenBalconySize'),
          bedrooms: (re.bedrooms as number | null) ?? null,
          floor: (re.floor as number | null) ?? null,
          apartmentFloors: (re.apartmentFloors as string | null) ?? null,
          rent: num('rent'),
          rentSuggestion: num('rentSuggestion'),
          rentType: (re.rentType as string | null) ?? null,
          incomeFrequency: (re.incomeFrequency as string | null) ?? null,
          saleCommission: num('saleCommission'),
          profitTax: num('profitTax'),
          generalSellingExpenses: num('generalSellingExpenses'),
          legalExpenses: num('legalExpenses'),
          linkedMortgageRef: (re.linkedMortgageRef as string | null) ?? null,
          customSubtitle: (re.customSubtitle as string | null) ?? null,
          rawData: (re.rawData as object) ?? undefined,
          stableKey: (re.stableKey as string | null) ?? null,
          userCanonicalId: (re.userCanonicalId as string | null) ?? null,
          missingSince: date('missingSince'),
          householdId: re.householdId as string,
          syncedAt: new Date(re.syncedAt as string),
          createdAt: new Date(re.createdAt as string),
          updatedAt: new Date(re.updatedAt as string),
        },
      });
    }

    // 38. Moneytor Real Estate Snapshots
    for (const res of moneytorRealEstateSnapshots) {
      await prisma.moneytorRealEstateSnapshot.create({
        data: {
          id: res.id as string,
          snapshotMonth: new Date(res.snapshotMonth as string),
          productId: res.productId as string,
          name: res.name as string,
          currentValue: res.currentValue as number | string,
          balanceInBase: res.balanceInBase as number | string,
          currency: res.currency as string,
          householdId: res.householdId as string,
          createdAt: new Date(res.createdAt as string),
          updatedAt: new Date(res.updatedAt as string),
        },
      });
    }

    // 39. Moneytor Drop Logs
    for (const dl of moneytorDropLogs) {
      await prisma.moneytorDropLog.create({
        data: {
          id: dl.id as string,
          householdId: dl.householdId as string,
          originalMoneytorId: (dl.originalMoneytorId as string | null) ?? null,
          budgetTransactionId: (dl.budgetTransactionId as string | null) ?? null,
          transactionDate: new Date(dl.transactionDate as string),
          amountIls: dl.amountIls as number | string,
          payeeName: (dl.payeeName as string | null) ?? null,
          description: (dl.description as string | null) ?? null,
          reason: dl.reason as string,
          droppedAt: new Date(dl.droppedAt as string),
        },
      });
    }

    // 40. Moneytor Sync Logs
    for (const sl of moneytorSyncLogs) {
      await prisma.moneytorSyncLog.create({
        data: {
          id: sl.id as string,
          householdId: sl.householdId as string,
          source: sl.source as string,
          startedAt: new Date(sl.startedAt as string),
          completedAt: new Date(sl.completedAt as string),
          durationMs: sl.durationMs as number,
          success: sl.success as boolean,
          errorMessage: (sl.errorMessage as string | null) ?? null,
          results: (sl.results as object) ?? undefined,
          createdAt: new Date(sl.createdAt as string),
        },
      });
    }

    // 41. Task Categories (before tasks)
    for (const tc of taskCategories) {
      await prisma.taskCategory.create({
        data: {
          id: tc.id as string,
          name: tc.name as string,
          color: (tc.color as string | null) ?? null,
          icon: (tc.icon as string | null) ?? null,
          sortOrder: tc.sortOrder as number,
          householdId: tc.householdId as string,
          createdAt: new Date(tc.createdAt as string),
        },
      });
    }

    // 42. Task Tags (before tasks — the m2m connect target)
    for (const tt of taskTags) {
      await prisma.taskTag.create({
        data: {
          id: tt.id as string,
          name: tt.name as string,
          color: (tt.color as string | null) ?? null,
          householdId: tt.householdId as string,
          createdAt: new Date(tt.createdAt as string),
        },
      });
    }

    // 43. Tasks (two-pass for the parentTaskId self-reference; connect tags)
    const tasksWithParent: { id: string; parentTaskId: string }[] = [];
    for (const t of tasks) {
      if (t.parentTaskId) {
        tasksWithParent.push({ id: t.id as string, parentTaskId: t.parentTaskId as string });
      }
      const tagIds = ((t.tags as { id: string }[] | undefined) ?? []).map((x) => ({ id: x.id }));
      await prisma.task.create({
        data: {
          id: t.id as string,
          title: t.title as string,
          notes: (t.notes as string | null) ?? null,
          status: (t.status as string) ?? '',
          done: (t.done as boolean) ?? false,
          priority: t.priority as TaskPriority,
          dueDate: t.dueDate ? new Date(t.dueDate as string) : null,
          sortOrder: t.sortOrder as number,
          customFields: (t.customFields as object) ?? undefined,
          categoryId: (t.categoryId as string | null) ?? null,
          ownerId: t.ownerId as string,
          assigneeId: (t.assigneeId as string | null) ?? null,
          // parentTaskId set in the second pass to handle self-references
          householdId: t.householdId as string,
          createdAt: new Date(t.createdAt as string),
          updatedAt: new Date(t.updatedAt as string),
          ...(tagIds.length ? { tags: { connect: tagIds } } : {}),
        },
      });
    }
    for (const ref of tasksWithParent) {
      await prisma.task.update({
        where: { id: ref.id },
        data: { parentTaskId: ref.parentTaskId },
      });
    }

    // 44. Task Shares (after tasks + users)
    for (const ts of taskShares) {
      await prisma.taskShare.create({
        data: {
          id: ts.id as string,
          taskId: ts.taskId as string,
          userId: ts.userId as string,
          canEdit: (ts.canEdit as boolean) ?? true,
          createdAt: new Date(ts.createdAt as string),
        },
      });
    }

    // 44b. Page Sections (before pages so page.sectionId FKs resolve)
    // Pages restored from a section that isn't in the backup keep sectionId
    // = null via the nullable FK.
    const pageSectionIds = new Set(pageSections.map((s) => s.id as string));
    for (const ps of pageSections) {
      await prisma.pageSection.create({
        data: {
          id: ps.id as string,
          name: ps.name as string,
          sortOrder: (ps.sortOrder as number | undefined) ?? 0,
          householdId: ps.householdId as string,
          createdAt: new Date(ps.createdAt as string),
          updatedAt: new Date(ps.updatedAt as string),
        },
      });
    }

    // 45. Pages (Areas documents — after users + households + page sections)
    for (const pg of pages) {
      const rawSectionId = (pg.sectionId as string | null | undefined) ?? null;
      const sectionId = rawSectionId && pageSectionIds.has(rawSectionId) ? rawSectionId : null;
      await prisma.page.create({
        data: {
          id: pg.id as string,
          title: (pg.title as string) ?? '',
          emoji: (pg.emoji as string | null) ?? null,
          content: (pg.content as object) ?? undefined,
          sortOrder: pg.sortOrder as number,
          autoCapitalize: (pg.autoCapitalize as boolean | undefined) ?? true,
          ownerId: pg.ownerId as string,
          householdId: pg.householdId as string,
          sectionId,
          createdAt: new Date(pg.createdAt as string),
          updatedAt: new Date(pg.updatedAt as string),
        },
      });
    }

    // 46. Page Tabs (children of pages — after pages)
    for (const tab of pageTabs) {
      await prisma.pageTab.create({
        data: {
          id: tab.id as string,
          pageId: tab.pageId as string,
          title: (tab.title as string) ?? '',
          content: (tab.content as object) ?? undefined,
          sortOrder: tab.sortOrder as number,
          createdAt: new Date(tab.createdAt as string),
          updatedAt: new Date(tab.updatedAt as string),
        },
      });
    }

    // 46b. Backfill tabs for pages that have none. Pre-2.4 backups predate the
    // page_tabs table, so their pages carry content on `page.content` with no
    // tab rows. Mirror the DB migration's backfill so every restored page keeps
    // at least one tab (and its content stays reachable in the editor).
    const pagesWithTabs = new Set(pageTabs.map((t) => t.pageId as string));
    for (const pg of pages) {
      if (pagesWithTabs.has(pg.id as string)) continue;
      await prisma.pageTab.create({
        data: {
          pageId: pg.id as string,
          title: '',
          content: (pg.content as object) ?? undefined,
          sortOrder: 0,
          createdAt: new Date(pg.createdAt as string),
          updatedAt: new Date(pg.updatedAt as string),
        },
      });
    }

    // 47. Wiki concepts (after users + households). Insert Projects before
    // Sources so a source's self-referential projectId points at an
    // already-inserted project; a dangling projectId (project missing from the
    // backup) is nulled rather than failing the whole restore.
    const wikiConceptIds = new Set(wikiConcepts.map((c) => c.id as string));
    const orderedConcepts = [...wikiConcepts].sort(
      (a, b) => (a.type === 'Project' ? 0 : 1) - (b.type === 'Project' ? 0 : 1)
    );
    for (const c of orderedConcepts) {
      const projectId = (c.projectId as string | null) ?? null;
      await prisma.wikiConcept.create({
        data: {
          id: c.id as string,
          householdId: c.householdId as string,
          path: c.path as string,
          type: c.type as string,
          title: (c.title as string) ?? '',
          description: (c.description as string | null) ?? null,
          frontmatter: (c.frontmatter as Prisma.InputJsonValue) ?? {},
          body: (c.body as string) ?? '',
          projectId: projectId && wikiConceptIds.has(projectId) ? projectId : null,
          sourceUrl: (c.sourceUrl as string | null) ?? null,
          sourceRaw: (c.sourceRaw as string | null) ?? null,
          generatedBy: (c.generatedBy as string | null) ?? null,
          generatedAt: c.generatedAt ? new Date(c.generatedAt as string) : null,
          createdAt: new Date(c.createdAt as string),
          updatedAt: new Date(c.updatedAt as string),
        },
      });
    }

    // 48. Wiki concept memberships (join table — after concepts).
    for (const m of wikiConceptProjects) {
      await prisma.wikiConceptProject.create({
        data: {
          id: m.id as string,
          sourceId: m.sourceId as string,
          projectId: m.projectId as string,
          createdAt: new Date(m.createdAt as string),
        },
      });
    }

    // 49. Wiki questions (children of concepts — after concepts).
    for (const q of wikiQuestions) {
      await prisma.wikiQuestion.create({
        data: {
          id: q.id as string,
          conceptId: q.conceptId as string,
          orderIndex: q.orderIndex as number,
          question: q.question as string,
          options: q.options as Prisma.InputJsonValue,
          correctIdx: q.correctIdx as number,
          explanation: q.explanation as string,
          createdAt: new Date(q.createdAt as string),
        },
      });
    }

    // 50. Wiki question attempts (after questions + users).
    for (const a of wikiQuestionAttempts) {
      await prisma.wikiQuestionAttempt.create({
        data: {
          id: a.id as string,
          questionId: a.questionId as string,
          userId: a.userId as string,
          selectedIdx: a.selectedIdx as number,
          correct: a.correct as boolean,
          attemptedAt: new Date(a.attemptedAt as string),
        },
      });
    }

    // 51. Household Invites (after households)
    for (const hi of householdInvites) {
      await prisma.householdInvite.create({
        data: {
          id: hi.id as string,
          householdId: hi.householdId as string,
          email: hi.email as string,
          role: hi.role as HouseholdRole,
          suggestedName: (hi.suggestedName as string | null) ?? null,
          suggestedColor: (hi.suggestedColor as string | null) ?? null,
          invitedByProfileId: hi.invitedByProfileId as string,
          createdAt: new Date(hi.createdAt as string),
          expiresAt: new Date(hi.expiresAt as string),
          acceptedAt: hi.acceptedAt ? new Date(hi.acceptedAt as string) : null,
          acceptedByUserId: (hi.acceptedByUserId as string | null) ?? null,
        },
      });
    }

    // 52. Market Rates (no relations — BoI Prime history keyed by name+date)
    for (const mr of marketRates) {
      await prisma.marketRate.create({
        data: {
          id: mr.id as string,
          name: mr.name as string,
          rate: mr.rate as number | string,
          effectiveFrom: new Date(mr.effectiveFrom as string),
          createdAt: new Date(mr.createdAt as string),
        },
      });
    }

    // 53. Moneytor Transactions (raw archive from Moneytor sync; PK is Moneytor's ULID)
    for (const mt of moneytorTransactions) {
      await prisma.moneytorTransaction.create({
        data: {
          id: mt.id as string,
          transactionDate: new Date(mt.transactionDate as string),
          amount: mt.amount as number | string,
          currency: mt.currency as string,
          description: mt.description as string,
          extraInfo: (mt.extraInfo as string | null) ?? null,
          category: mt.category as string,
          accountId: mt.accountId as string,
          type: mt.type as string,
          replacesMoneytorId: (mt.replacesMoneytorId as string | null) ?? null,
          householdId: mt.householdId as string,
          syncedAt: new Date(mt.syncedAt as string),
          createdAt: new Date(mt.createdAt as string),
          updatedAt: new Date(mt.updatedAt as string),
        },
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
