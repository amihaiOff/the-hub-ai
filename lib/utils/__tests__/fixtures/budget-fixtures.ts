/**
 * Mock data for the budget module tests. Extracted from
 * `lib/utils/budget.ts` — the mock fixture was 1260 of the original
 * file's 1622 lines and is used only by `budget.test.ts`, so keeping it
 * inside the production utility module was overkill.
 *
 * Import from tests via `../fixtures/budget-fixtures`.
 */
import type {
  BudgetCategoryGroup,
  BudgetPayee,
  BudgetTag,
  BudgetTransaction,
  PaymentMethod,
  TransactionType,
} from '@/lib/utils/budget';

const MOCK_HOUSEHOLD_ID = 'mock-household-1';

export const MOCK_CATEGORY_GROUPS: BudgetCategoryGroup[] = [
  {
    id: 'group-1',
    name: 'Bills & Utilities',
    sortOrder: 1,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-1',
        name: 'Rent/Mortgage',
        groupId: 'group-1',
        budget: 8000,
        isMust: true,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-2',
        name: 'Electricity',
        groupId: 'group-1',
        budget: 400,
        isMust: true,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-3',
        name: 'Water',
        groupId: 'group-1',
        budget: 150,
        isMust: true,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-4',
        name: 'Internet & Phone',
        groupId: 'group-1',
        budget: 300,
        isMust: true,
        sortOrder: 4,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-5',
        name: 'Insurance',
        groupId: 'group-1',
        budget: 500,
        isMust: true,
        sortOrder: 5,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-2',
    name: 'Living Expenses',
    sortOrder: 2,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-6',
        name: 'Groceries',
        groupId: 'group-2',
        budget: 3000,
        isMust: true,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-7',
        name: 'Transportation',
        groupId: 'group-2',
        budget: 1500,
        isMust: true,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-8',
        name: 'Dining Out',
        groupId: 'group-2',
        budget: 800,
        isMust: false,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-9',
        name: 'Entertainment',
        groupId: 'group-2',
        budget: 500,
        isMust: false,
        sortOrder: 4,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-10',
        name: 'Shopping',
        groupId: 'group-2',
        budget: 600,
        isMust: false,
        sortOrder: 5,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-3',
    name: 'Savings & Goals',
    sortOrder: 3,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-11',
        name: 'Emergency Fund',
        groupId: 'group-3',
        budget: 1000,
        isMust: true,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-12',
        name: 'Vacation',
        groupId: 'group-3',
        budget: 500,
        isMust: false,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-13',
        name: 'Investments',
        groupId: 'group-3',
        budget: 2000,
        isMust: false,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-4',
    name: 'Health & Wellness',
    sortOrder: 4,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-14',
        name: 'Health Insurance',
        groupId: 'group-4',
        budget: 800,
        isMust: true,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-15',
        name: 'Gym & Fitness',
        groupId: 'group-4',
        budget: 350,
        isMust: false,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-16',
        name: 'Medical & Dental',
        groupId: 'group-4',
        budget: 400,
        isMust: true,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-17',
        name: 'Personal Care',
        groupId: 'group-4',
        budget: 250,
        isMust: false,
        sortOrder: 4,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-5',
    name: 'Kids & Education',
    sortOrder: 5,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-18',
        name: 'Daycare/School',
        groupId: 'group-5',
        budget: 3500,
        isMust: true,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-19',
        name: 'Kids Activities',
        groupId: 'group-5',
        budget: 600,
        isMust: false,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-20',
        name: 'Kids Clothing',
        groupId: 'group-5',
        budget: 300,
        isMust: false,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-21',
        name: 'School Supplies',
        groupId: 'group-5',
        budget: 150,
        isMust: false,
        sortOrder: 4,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-6',
    name: 'Transportation',
    sortOrder: 6,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-22',
        name: 'Car Payment',
        groupId: 'group-6',
        budget: 1800,
        isMust: true,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-23',
        name: 'Car Insurance',
        groupId: 'group-6',
        budget: 450,
        isMust: true,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-24',
        name: 'Fuel',
        groupId: 'group-6',
        budget: 800,
        isMust: true,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-25',
        name: 'Car Maintenance',
        groupId: 'group-6',
        budget: 300,
        isMust: false,
        sortOrder: 4,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-26',
        name: 'Parking',
        groupId: 'group-6',
        budget: 200,
        isMust: false,
        sortOrder: 5,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-7',
    name: 'Subscriptions',
    sortOrder: 7,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-27',
        name: 'Streaming Services',
        groupId: 'group-7',
        budget: 150,
        isMust: false,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-28',
        name: 'Software & Apps',
        groupId: 'group-7',
        budget: 100,
        isMust: false,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-29',
        name: 'News & Magazines',
        groupId: 'group-7',
        budget: 50,
        isMust: false,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-30',
        name: 'Cloud Storage',
        groupId: 'group-7',
        budget: 30,
        isMust: false,
        sortOrder: 4,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-8',
    name: 'Home & Garden',
    sortOrder: 8,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-31',
        name: 'Home Maintenance',
        groupId: 'group-8',
        budget: 400,
        isMust: false,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-32',
        name: 'Furniture',
        groupId: 'group-8',
        budget: 300,
        isMust: false,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-33',
        name: 'Garden & Plants',
        groupId: 'group-8',
        budget: 150,
        isMust: false,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-34',
        name: 'Cleaning Supplies',
        groupId: 'group-8',
        budget: 100,
        isMust: true,
        sortOrder: 4,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-9',
    name: 'Gifts & Donations',
    sortOrder: 9,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-35',
        name: 'Birthday Gifts',
        groupId: 'group-9',
        budget: 300,
        isMust: false,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-36',
        name: 'Holiday Gifts',
        groupId: 'group-9',
        budget: 500,
        isMust: false,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-37',
        name: 'Charity',
        groupId: 'group-9',
        budget: 200,
        isMust: false,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-10',
    name: 'Pets',
    sortOrder: 10,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-38',
        name: 'Pet Food',
        groupId: 'group-10',
        budget: 300,
        isMust: true,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-39',
        name: 'Vet & Health',
        groupId: 'group-10',
        budget: 200,
        isMust: true,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-40',
        name: 'Pet Supplies',
        groupId: 'group-10',
        budget: 100,
        isMust: false,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-11',
    name: 'Personal Development',
    sortOrder: 11,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-41',
        name: 'Books & Courses',
        groupId: 'group-11',
        budget: 200,
        isMust: false,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-42',
        name: 'Hobbies',
        groupId: 'group-11',
        budget: 300,
        isMust: false,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-43',
        name: 'Professional Development',
        groupId: 'group-11',
        budget: 150,
        isMust: false,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
  {
    id: 'group-12',
    name: 'Debt Payments',
    sortOrder: 12,
    householdId: MOCK_HOUSEHOLD_ID,
    categories: [
      {
        id: 'cat-44',
        name: 'Credit Card Payment',
        groupId: 'group-12',
        budget: 1500,
        isMust: true,
        sortOrder: 1,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-45',
        name: 'Student Loans',
        groupId: 'group-12',
        budget: 800,
        isMust: true,
        sortOrder: 2,
        householdId: MOCK_HOUSEHOLD_ID,
      },
      {
        id: 'cat-46',
        name: 'Personal Loans',
        groupId: 'group-12',
        budget: 500,
        isMust: true,
        sortOrder: 3,
        householdId: MOCK_HOUSEHOLD_ID,
      },
    ],
  },
];

export const MOCK_PAYEES: BudgetPayee[] = [
  {
    id: 'payee-1',
    name: 'Shufersal',
    categoryId: 'cat-6',
    transactionCount: 24,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'payee-2',
    name: 'Rami Levy',
    categoryId: 'cat-6',
    transactionCount: 18,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'payee-3',
    name: 'Sonol',
    categoryId: 'cat-7',
    transactionCount: 12,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'payee-4',
    name: 'Israel Electric Corp',
    categoryId: 'cat-2',
    transactionCount: 6,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'payee-5',
    name: 'Mekorot (Water)',
    categoryId: 'cat-3',
    transactionCount: 6,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'payee-6',
    name: 'Partner Communications',
    categoryId: 'cat-4',
    transactionCount: 6,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'payee-7',
    name: 'Netflix',
    categoryId: 'cat-9',
    transactionCount: 6,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'payee-8',
    name: 'Wolt',
    categoryId: 'cat-8',
    transactionCount: 15,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'payee-9',
    name: 'Landlord',
    categoryId: 'cat-1',
    transactionCount: 6,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'payee-10',
    name: 'Employer - Salary',
    categoryId: null,
    transactionCount: 6,
    householdId: MOCK_HOUSEHOLD_ID,
  },
];

export const MOCK_TAGS: BudgetTag[] = [
  {
    id: 'tag-1',
    name: 'Essential',
    color: '#EF4444',
    transactionCount: 25,
    totalSpent: 5200,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'tag-2',
    name: 'Fun',
    color: '#8B5CF6',
    transactionCount: 18,
    totalSpent: 3400,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'tag-3',
    name: 'Subscription',
    color: '#3B82F6',
    transactionCount: 5,
    totalSpent: 450,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'tag-4',
    name: 'One-time',
    color: '#F59E0B',
    transactionCount: 8,
    totalSpent: 1800,
    householdId: MOCK_HOUSEHOLD_ID,
  },
  {
    id: 'tag-5',
    name: 'Work Related',
    color: '#10B981',
    transactionCount: 3,
    totalSpent: 900,
    householdId: MOCK_HOUSEHOLD_ID,
  },
];

// Generate mock transactions for current and previous months
function generateMockTransactions(): BudgetTransaction[] {
  const transactions: BudgetTransaction[] = [];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Helper to create a transaction
  const createTransaction = (
    id: string,
    type: TransactionType,
    date: Date,
    amount: number,
    categoryId: string | null,
    payeeId: string | null,
    notes: string | null = null,
    tagIds: string[] = [],
    paymentMethod: PaymentMethod = 'credit_card'
  ): BudgetTransaction => ({
    id,
    type,
    transactionDate: date.toISOString().split('T')[0],
    paymentDate: date.toISOString().split('T')[0],
    amountIls: amount,
    currency: 'ILS',
    amountOriginal: amount,
    categoryId,
    payeeId,
    paymentMethod,
    paymentNumber: null,
    totalPayments: null,
    notes,
    source: 'manual',
    isRecurring: false,
    isSplit: false,
    originalTransactionId: null,
    paymentIdentifier: null,
    excludedFromFlow: false,
    profileId: null,
    householdId: MOCK_HOUSEHOLD_ID,
    tagIds,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  });

  let txId = 1;

  // Current month salary (income)
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'income',
      new Date(currentYear, currentMonth, 1),
      25000,
      null,
      'payee-10',
      'Monthly salary',
      ['tag-5'],
      'bank_transfer'
    )
  );

  // Rent
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      8000,
      'cat-1',
      'payee-9',
      'Monthly rent',
      ['tag-1'],
      'bank_transfer'
    )
  );

  // Groceries (multiple transactions)
  const groceryDays = [3, 7, 12, 18, 24];
  const groceryAmounts = [450, 320, 580, 410, 390];
  groceryDays.forEach((day, i) => {
    transactions.push(
      createTransaction(
        `tx-${txId++}`,
        'expense',
        new Date(currentYear, currentMonth, day),
        groceryAmounts[i],
        'cat-6',
        i % 2 === 0 ? 'payee-1' : 'payee-2',
        null,
        ['tag-1']
      )
    );
  });

  // Transportation
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 5),
      350,
      'cat-7',
      'payee-3',
      'Gas',
      ['tag-1']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 15),
      380,
      'cat-7',
      'payee-3',
      'Gas',
      ['tag-1']
    )
  );

  // Dining out
  const diningDays = [6, 13, 20, 27];
  const diningAmounts = [180, 220, 150, 195];
  diningDays.forEach((day, i) => {
    transactions.push(
      createTransaction(
        `tx-${txId++}`,
        'expense',
        new Date(currentYear, currentMonth, day),
        diningAmounts[i],
        'cat-8',
        'payee-8',
        null,
        ['tag-2']
      )
    );
  });

  // Utilities
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 10),
      380,
      'cat-2',
      'payee-4',
      'Electricity bill',
      ['tag-1', 'tag-3'],
      'bank_transfer'
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 10),
      140,
      'cat-3',
      'payee-5',
      'Water bill',
      ['tag-1', 'tag-3'],
      'bank_transfer'
    )
  );

  // Internet & Phone
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      280,
      'cat-4',
      'payee-6',
      'Monthly plan',
      ['tag-1', 'tag-3']
    )
  );

  // Entertainment
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      55,
      'cat-9',
      'payee-7',
      'Netflix subscription',
      ['tag-2', 'tag-3']
    )
  );

  // Shopping
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 8),
      450,
      'cat-10',
      null,
      'New shoes',
      ['tag-4']
    )
  );

  // Savings transfers
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      1000,
      'cat-11',
      null,
      'Monthly emergency fund contribution',
      [],
      'bank_transfer'
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      2000,
      'cat-13',
      null,
      'Monthly investment',
      [],
      'bank_transfer'
    )
  );

  // Health & Wellness
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      800,
      'cat-14',
      null,
      'Health insurance premium',
      ['tag-1', 'tag-3'],
      'bank_transfer'
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      320,
      'cat-15',
      null,
      'Gym membership',
      ['tag-3']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 12),
      280,
      'cat-16',
      null,
      'Dental checkup',
      ['tag-1']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 18),
      180,
      'cat-17',
      null,
      'Haircut and products',
      []
    )
  );

  // Kids & Education
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      3500,
      'cat-18',
      null,
      'Monthly daycare',
      ['tag-1'],
      'bank_transfer'
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 5),
      450,
      'cat-19',
      null,
      'Swimming lessons',
      []
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 10),
      220,
      'cat-20',
      null,
      'Kids winter clothes',
      ['tag-4']
    )
  );

  // Transportation
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      1800,
      'cat-22',
      null,
      'Car lease payment',
      ['tag-1', 'tag-3'],
      'bank_transfer'
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      450,
      'cat-23',
      null,
      'Car insurance',
      ['tag-1', 'tag-3'],
      'bank_transfer'
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 8),
      420,
      'cat-24',
      null,
      'Fuel',
      ['tag-1']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 22),
      380,
      'cat-24',
      null,
      'Fuel',
      ['tag-1']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 15),
      180,
      'cat-26',
      null,
      'Monthly parking',
      ['tag-3']
    )
  );

  // Subscriptions
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      55,
      'cat-27',
      null,
      'Netflix',
      ['tag-3']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      45,
      'cat-27',
      null,
      'Disney+',
      ['tag-3']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 5),
      35,
      'cat-28',
      null,
      'Spotify Premium',
      ['tag-3']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      25,
      'cat-30',
      null,
      'iCloud storage',
      ['tag-3']
    )
  );

  // Home & Garden
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 14),
      350,
      'cat-31',
      null,
      'Plumber visit',
      ['tag-4']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 20),
      85,
      'cat-34',
      null,
      'Cleaning supplies',
      ['tag-1']
    )
  );

  // Gifts & Donations
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 16),
      250,
      'cat-35',
      null,
      'Birthday gift for friend',
      ['tag-4']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      100,
      'cat-37',
      null,
      'Monthly charity donation',
      ['tag-3'],
      'bank_transfer'
    )
  );

  // Pets
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 3),
      280,
      'cat-38',
      null,
      'Dog food',
      ['tag-1']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 11),
      180,
      'cat-39',
      null,
      'Vet checkup',
      []
    )
  );

  // Personal Development
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 7),
      150,
      'cat-41',
      null,
      'Online course',
      ['tag-5']
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 19),
      220,
      'cat-42',
      null,
      'Photography equipment',
      ['tag-2']
    )
  );

  // Debt Payments
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 15),
      1500,
      'cat-44',
      null,
      'Credit card payment',
      ['tag-1'],
      'bank_transfer'
    )
  );
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(currentYear, currentMonth, 1),
      800,
      'cat-45',
      null,
      'Student loan payment',
      ['tag-1', 'tag-3'],
      'bank_transfer'
    )
  );

  // Previous month transactions (similar pattern but different amounts)
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  // Previous month salary
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'income',
      new Date(prevYear, prevMonth, 1),
      25000,
      null,
      'payee-10',
      'Monthly salary',
      ['tag-5'],
      'bank_transfer'
    )
  );

  // Previous month rent
  transactions.push(
    createTransaction(
      `tx-${txId++}`,
      'expense',
      new Date(prevYear, prevMonth, 1),
      8000,
      'cat-1',
      'payee-9',
      'Monthly rent',
      ['tag-1'],
      'bank_transfer'
    )
  );

  // Previous month groceries
  const prevGroceryAmounts = [520, 380, 420, 490, 350];
  groceryDays.forEach((day, i) => {
    transactions.push(
      createTransaction(
        `tx-${txId++}`,
        'expense',
        new Date(prevYear, prevMonth, day),
        prevGroceryAmounts[i],
        'cat-6',
        i % 2 === 0 ? 'payee-1' : 'payee-2',
        null,
        ['tag-1']
      )
    );
  });

  return transactions;
}

export const MOCK_TRANSACTIONS: BudgetTransaction[] = generateMockTransactions();
