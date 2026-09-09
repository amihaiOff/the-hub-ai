/**
 * Where each table's JSON file lives inside a backup archive.
 *
 * Backups used to be ~57 files in a flat pile, which made a downloaded archive
 * impossible to skim — you couldn't tell at a glance whether the budget data
 * was in there, or which files belonged together. They're now grouped into
 * folders mirroring the app's own sections, so the archive reads like the
 * sidebar does.
 *
 * SHARED ON PURPOSE. Backup and restore are kept in lockstep (see
 * docs/decisions.md); if each owned its own copy of this map they would drift
 * and a restore would silently skip a table. Backup writes to `pathInArchive`,
 * restore reads through it and falls back to the bare filename so archives
 * taken before the folders existed still restore.
 *
 * `metadata.json` deliberately has no folder — it's the archive manifest and
 * belongs at the top level where a human looking in the zip will find it.
 */

/** Folder names, in the order they appear in the app's navigation. */
export const BACKUP_FOLDERS = [
  'household',
  'budget',
  'portfolio',
  'pension',
  'assets',
  'insurance',
  'tasks',
  'shopping',
  'areas',
  'wiki',
  'moneytor',
  'history',
] as const;

export type BackupFolder = (typeof BACKUP_FOLDERS)[number];

/**
 * Filename → folder. Every data file must appear here; a missing entry is
 * caught by the backup coverage test rather than silently landing at the root.
 */
const FOLDER_BY_FILE: Record<string, BackupFolder> = {
  // Who uses the app, and the household they share.
  'users.json': 'household',
  'profiles.json': 'household',
  'households.json': 'household',
  'household_members.json': 'household',
  'household_invites.json': 'household',
  'partner_contacts.json': 'household',

  // Monthly budget: transactions and everything that categorises them.
  'budget_transactions.json': 'budget',
  'budget_transaction_tags.json': 'budget',
  'budget_categories.json': 'budget',
  'budget_category_groups.json': 'budget',
  'budget_payees.json': 'budget',
  'budget_tags.json': 'budget',
  'budget_account_names.json': 'budget',
  'cc_generic_payee_names.json': 'budget',
  'riseup_categories.json': 'budget',
  'payee_category_rules.json': 'budget',

  // Stocks and brokerage accounts.
  'stock_accounts.json': 'portfolio',
  'stock_account_owners.json': 'portfolio',
  'stock_account_cash.json': 'portfolio',
  'stock_holdings.json': 'portfolio',

  // Pension / Hishtalmut.
  'pension_accounts.json': 'pension',
  'pension_account_owners.json': 'pension',
  'pension_deposits.json': 'pension',

  // Everything else that counts toward net worth, plus debt.
  'misc_assets.json': 'assets',
  'misc_asset_owners.json': 'assets',
  'mortgage_tracks.json': 'assets',

  'insurance_policies.json': 'insurance',

  'tasks.json': 'tasks',
  'task_categories.json': 'tasks',
  'task_tags.json': 'tasks',
  'task_shares.json': 'tasks',

  'shopping_items.json': 'shopping',
  'shopping_categories.json': 'shopping',
  'shopping_cart_items.json': 'shopping',
  'shopping_deliveries.json': 'shopping',

  // Areas: the Notion-like pages, their panes and grouping, plus the
  // favourites that point at them.
  'pages.json': 'areas',
  'page_tabs.json': 'areas',
  'page_sections.json': 'areas',
  'favorites.json': 'areas',

  'wiki_concepts.json': 'wiki',
  'wiki_concept_projects.json': 'wiki',
  'wiki_questions.json': 'wiki',
  'wiki_question_attempts.json': 'wiki',

  // The raw synced dataset, kept isolated from the budget tables it feeds.
  'moneytor_transactions.json': 'moneytor',
  'moneytor_accounts.json': 'moneytor',
  'moneytor_account_snapshots.json': 'moneytor',
  'moneytor_stock_holdings.json': 'moneytor',
  'moneytor_stock_snapshots.json': 'moneytor',
  'moneytor_pension_funds.json': 'moneytor',
  'moneytor_pension_snapshots.json': 'moneytor',
  'moneytor_real_estate.json': 'moneytor',
  'moneytor_real_estate_snapshots.json': 'moneytor',
  'moneytor_sync_logs.json': 'moneytor',
  'moneytor_drop_logs.json': 'moneytor',

  // Time series and activity: valuable to keep, not tied to one section.
  'net_worth_snapshots.json': 'history',
  'market_rates.json': 'history',
  'general_logs.json': 'history',
};

/** Files that stay at the archive root. */
const ROOT_FILES = new Set(['metadata.json']);

/**
 * The path a file is written to inside the archive. Unmapped files fall back to
 * the root so a newly added table is still captured, just unfiled — the
 * coverage test is what stops it staying that way.
 */
export function pathInArchive(filename: string): string {
  if (ROOT_FILES.has(filename)) return filename;
  const folder = FOLDER_BY_FILE[filename];
  return folder ? `${folder}/${filename}` : filename;
}

/** Every data file the layout knows about. Used by the coverage test. */
export function knownBackupFiles(): string[] {
  return Object.keys(FOLDER_BY_FILE);
}
