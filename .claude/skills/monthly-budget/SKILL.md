# Monthly Budget Module

## Overview

A YNAB-style monthly budget tracker for tracking income and expenses, categorizing spending, and monitoring budget progress. Integrates with the existing Hub AI household/profile system.

## Data Import

- **CSV/Excel Import**: Users upload transaction files downloaded from bank or credit card websites
- **Manual Entry**: Users can manually add individual transactions (select income/expense type)
- **Supported Sources**: Bank accounts, credit cards (source tracked per transaction)
- **Encoding**: UTF-8, supports Hebrew and English
- **Column mapping**: Predefined mappings per bank/credit card provider
- **Error handling**: If file cannot be parsed, show error message and abort

## Key Concepts

### Transactions

- Each transaction is either **income** or **expense** (type field)
- Each transaction has a purchase date (when bought) and payment date (when money leaves account)
- Transactions can have installment payments (marked in import data or set manually)
- Payment installments tracked as `paymentNumber` of `totalPayments` (e.g., "3 of 12")
- Transactions optionally linked to a profile (for multi-person households)
- Each transaction can have multiple tags
- Amounts always displayed as positive with income/expense indicator

### Split Transactions

- A transaction can be split into two or more separate transactions
- Split transactions share the original payee and transaction date
- Each resulting split can have its own: amount, category, tags, notes
- **Can split already-split transactions**
- **Sum validation**: Warn if split amounts don't equal original (but allow it)
- **Relationship tracking**: Split transactions store `originalTransactionId` pointing to the source
- The original transaction is **soft-deleted** (`isSplit: true`, excluded from reports)
- This enables:
  - Viewing all splits that came from an original transaction
  - **Undo split**: Delete the split transactions and restore the original
- Split transactions are fully independent after creation (can be edited, deleted individually)

### Categories & Groups

- Categories belong to category groups (e.g., "Utilities" group contains "Electricity", "Water", "Gas")
- Each category can have a monthly budget amount
- Categories can be marked as **"must"** (essential expenses like rent, bills) vs discretionary
- "Must" categories are expenses with little flexibility to reduce month-to-month
- Categories and groups have `sortOrder` for drag-and-drop reordering
- Ungrouped categories appear in "Others" section at bottom of dashboard

### Category Management

- Can reorder categories within groups (drag-and-drop)
- Can reorder category groups on dashboard (drag-and-drop)
- Can move categories between groups
- **Deleting category**: Clears categoryId on transactions AND payee mappings
- **Deleting group**: Sets groupId to null on categories, then deletes group

### Automatic Categorization

- Payee-to-category mapping table
- New transactions auto-categorized based on payee lookup
- User categorization of new payees updates the mapping table
- Warning shown when re-categorizing an existing payee to a different category

### Refunds

- Refunds are recorded as **income** transactions (positive amount)
- No special linking to original purchase
- Appears in income totals for the month

## Pages

### 1. Dashboard

- YNAB-style budget overview with month selector (left/right arrows, click to open picker)
- **Header summary**: Total Budgeted, Total Spent, Total Income
- Category groups as collapsible sections (drag-and-drop reorderable)
- Categories show progress bar (spent vs budget) with time-progress indicator
- "Must" categories visually distinguished (icon/badge)
- **Category row expansion**: Click to show inline mini-table of that month's transactions
  - Mini-table: Date, Payee, Amount, Notes
  - No navigation away - stays in dashboard context
- Ungrouped categories appear in "Others" section at bottom

### 2. Transaction Table

- **Add Transaction**: Button at top (YNAB-style)
- **Default columns**: Checkbox, Date, Payee, Category Group - Category, Amount (ILS), Notes
- **Pagination**: 50 rows per page (changeable to 100)
- **Amount display**: Always positive with income/expense indicator
- Bulk operations: Delete, Set category, Add/remove tags, Set profile
- Single transaction: Split (not available in bulk)
- Inline editing, column reorder, column visibility toggle
- **Search**: Regex and fuzzy finding support
- Filter by: date range, category, payee, amount range, tags, profile
- Mobile: Compact view with expandable rows

### 3. Tags

- List all tags with colors (free color picker) and transaction counts
- Add/edit/delete tags
- **Merge tags**: Select multiple → combine into one, reassign all transactions

### 4. Stats

- TBD - Spending analytics, trends, comparisons

### 5. Payees

- Table: Name, Default Category, Transaction Count
- Checkbox on each row for multi-select
- **Search**: Regex and fuzzy finding support
- Bulk operations: Delete selected, Assign category to selected
- **Delete payee**: Clears payeeId on transactions, warns about affected count
- Filter by category, sort by any column

## Database Schema

### Expenses Table

| Field                 | Type     | Description                                          |
| --------------------- | -------- | ---------------------------------------------------- |
| id                    | UUID     | Auto-generated primary key                           |
| type                  | Enum     | income, expense                                      |
| transactionDate       | DateTime | When the purchase was made                           |
| paymentDate           | DateTime | When money leaves the account                        |
| amountIls             | Decimal  | Amount in ILS (always positive)                      |
| currency              | String   | Original currency code                               |
| amountOriginal        | Decimal  | Amount in original currency                          |
| categoryId            | UUID?    | FK to categories (optional)                          |
| payeeId               | UUID?    | FK to payees (optional)                              |
| paymentMethod         | String   | Credit card, bank transfer, cash, etc.               |
| paymentNumber         | Int?     | Current payment number (for installments)            |
| totalPayments         | Int?     | Total payments (for installments)                    |
| notes                 | String?  | User notes                                           |
| source                | Enum     | manual, bank_import, credit_card_import              |
| isRecurring           | Boolean  | Flag for recurring transactions                      |
| isSplit               | Boolean  | True if transaction was split (soft-deleted)         |
| originalTransactionId | UUID?    | FK to original transaction if this is a split result |
| profileId             | UUID?    | FK to profiles (optional)                            |
| householdId           | UUID     | FK to households                                     |
| createdAt             | DateTime | Record creation timestamp                            |
| updatedAt             | DateTime | Record update timestamp                              |

### Transaction Tags (join table)

| Field         | Type | Description    |
| ------------- | ---- | -------------- |
| transactionId | UUID | FK to expenses |
| tagId         | UUID | FK to tags     |

### Payees Table

| Field       | Type     | Description                     |
| ----------- | -------- | ------------------------------- |
| id          | UUID     | Auto-generated primary key      |
| name        | String   | Payee name                      |
| categoryId  | UUID?    | Default category for this payee |
| householdId | UUID     | FK to households                |
| createdAt   | DateTime | Record creation timestamp       |
| updatedAt   | DateTime | Record update timestamp         |

### Categories Table

| Field       | Type     | Description                                |
| ----------- | -------- | ------------------------------------------ |
| id          | UUID     | Auto-generated primary key                 |
| name        | String   | Category name                              |
| groupId     | UUID?    | FK to category groups                      |
| budget      | Decimal? | Monthly budget amount                      |
| isMust      | Boolean  | Essential expense flag                     |
| sortOrder   | Int      | Display order within group (drag-and-drop) |
| householdId | UUID     | FK to households                           |
| createdAt   | DateTime | Record creation timestamp                  |
| updatedAt   | DateTime | Record update timestamp                    |

### Category Groups Table

| Field       | Type     | Description                                |
| ----------- | -------- | ------------------------------------------ |
| id          | UUID     | Auto-generated primary key                 |
| name        | String   | Group name                                 |
| sortOrder   | Int      | Display order on dashboard (drag-and-drop) |
| householdId | UUID     | FK to households                           |
| createdAt   | DateTime | Record creation timestamp                  |
| updatedAt   | DateTime | Record update timestamp                    |

### Tags Table

| Field       | Type     | Description                       |
| ----------- | -------- | --------------------------------- |
| id          | UUID     | Auto-generated primary key        |
| name        | String   | Tag name                          |
| color       | String   | Display color (free color picker) |
| householdId | UUID     | FK to households                  |
| createdAt   | DateTime | Record creation timestamp         |
| updatedAt   | DateTime | Record update timestamp           |

## Integration with Hub AI

- Uses existing household/profile system
- Transactions can be attributed to specific profiles within a household
- Sidebar shows "Monthly Budget" tab with sub-pages when active
- Mobile-first responsive design following existing patterns
- Data export handled by existing Settings page backup functionality

## Empty States

Default messages when no data exists:

- **No transactions**: "No transactions yet. Import a file or add one manually."
- **No categories**: "No categories yet. Create your first category to start budgeting."
- **No tags**: "No tags yet. Create a tag to organize your transactions."
- **No payees**: "No payees yet. Payees are added automatically when you import or create transactions."
- **Search no results**: "No matching transactions found."
- **Category no transactions**: "No transactions in this category for this month."

## Import File Handling

### Supported Formats

- CSV files (UTF-8, Hebrew/English)
- Excel (.xlsx) files

### Import Flow

1. User uploads file
2. System parses using predefined column mapping for the bank/provider
3. System checks for duplicates against existing transactions
4. **Preview screen** displays:
   - **To Import**: New transactions that will be added
   - **Ignored (Duplicates)**: Transactions matching existing records
5. User reviews ignored transactions and can select any to force import
6. User confirms import
7. Selected transactions are saved

### Duplicate Detection

A transaction is considered a duplicate if ALL of the following match an existing transaction:

- `transactionDate` (date of purchase)
- `payee` (payee name, case-insensitive, exact match)
- `amountIls` (amount in ILS)
- `paymentNumber` (payment installment number, or both null)

### Edge Cases

- **Same-day same-payee different amounts**: Not duplicates, both imported
- **Same-day same-payee same amount different payment numbers**: Not duplicates (e.g., payment 1/12 vs 2/12)
- **User override**: If user selects an "ignored" transaction to import, it creates a new record
