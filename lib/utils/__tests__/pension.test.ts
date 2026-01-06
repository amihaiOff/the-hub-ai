/**
 * Unit tests for pension utility functions
 * Tests financial calculations, date formatting, and allocation functions
 */

import {
  calculateTotalDeposits,
  calculateThisMonthDeposits,
  calculatePensionSummary,
  calculateAllocationByProvider,
  calculateAllocationByType,
  formatSalaryMonth,
  formatDepositDate,
  formatFeePercent,
  formatCurrency,
  getSalaryMonthOptions,
  getAccountTypeName,
  PENSION_PROVIDERS,
  type DepositValue,
  type PensionAccountSummary,
} from '../pension';

describe('Pension Utility Functions', () => {
  describe('calculateTotalDeposits', () => {
    it('should calculate total deposits correctly', () => {
      const deposits: DepositValue[] = [
        { id: '1', depositDate: new Date(), salaryMonth: new Date(), amount: 1000, employer: 'A' },
        { id: '2', depositDate: new Date(), salaryMonth: new Date(), amount: 2000, employer: 'B' },
        { id: '3', depositDate: new Date(), salaryMonth: new Date(), amount: 500, employer: 'A' },
      ];
      expect(calculateTotalDeposits(deposits)).toBe(3500);
    });

    it('should return 0 for empty array', () => {
      expect(calculateTotalDeposits([])).toBe(0);
    });

    it('should handle single deposit', () => {
      const deposits: DepositValue[] = [
        { id: '1', depositDate: new Date(), salaryMonth: new Date(), amount: 1500, employer: 'A' },
      ];
      expect(calculateTotalDeposits(deposits)).toBe(1500);
    });

    it('should handle zero amounts', () => {
      const deposits: DepositValue[] = [
        { id: '1', depositDate: new Date(), salaryMonth: new Date(), amount: 0, employer: 'A' },
        { id: '2', depositDate: new Date(), salaryMonth: new Date(), amount: 1000, employer: 'B' },
      ];
      expect(calculateTotalDeposits(deposits)).toBe(1000);
    });

    it('should handle decimal amounts', () => {
      const deposits: DepositValue[] = [
        {
          id: '1',
          depositDate: new Date(),
          salaryMonth: new Date(),
          amount: 1000.5,
          employer: 'A',
        },
        {
          id: '2',
          depositDate: new Date(),
          salaryMonth: new Date(),
          amount: 500.25,
          employer: 'B',
        },
      ];
      expect(calculateTotalDeposits(deposits)).toBeCloseTo(1500.75, 2);
    });
  });

  describe('calculateThisMonthDeposits', () => {
    it('should calculate deposits for current month', () => {
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 15);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 5000,
          depositsCount: 2,
          deposits: [
            {
              id: '1',
              depositDate: new Date(),
              salaryMonth: currentMonth,
              amount: 1000,
              employer: 'A',
            },
            {
              id: '2',
              depositDate: new Date(),
              salaryMonth: lastMonth,
              amount: 2000,
              employer: 'A',
            },
          ],
        },
      ];

      expect(calculateThisMonthDeposits(accounts)).toBe(1000);
    });

    it('should return 0 when no deposits this month', () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 2000,
          depositsCount: 1,
          deposits: [
            {
              id: '1',
              depositDate: new Date(),
              salaryMonth: lastMonth,
              amount: 2000,
              employer: 'A',
            },
          ],
        },
      ];

      expect(calculateThisMonthDeposits(accounts)).toBe(0);
    });

    it('should handle empty accounts array', () => {
      expect(calculateThisMonthDeposits([])).toBe(0);
    });

    it('should aggregate across multiple accounts', () => {
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 15);

      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 1000,
          depositsCount: 1,
          deposits: [
            {
              id: '1',
              depositDate: new Date(),
              salaryMonth: currentMonth,
              amount: 1000,
              employer: 'A',
            },
          ],
        },
        {
          id: '2',
          type: 'hishtalmut',
          providerName: 'Provider B',
          accountName: 'Account 2',
          currentValue: 50000,
          feeFromDeposit: 0.4,
          feeFromTotal: 0.2,
          totalDeposits: 2000,
          depositsCount: 1,
          deposits: [
            {
              id: '2',
              depositDate: new Date(),
              salaryMonth: currentMonth,
              amount: 2000,
              employer: 'B',
            },
          ],
        },
      ];

      expect(calculateThisMonthDeposits(accounts)).toBe(3000);
    });

    it('should handle string dates', () => {
      const now = new Date();
      const currentMonthStr = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();

      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 1500,
          depositsCount: 1,
          deposits: [
            {
              id: '1',
              depositDate: new Date().toISOString(),
              salaryMonth: currentMonthStr,
              amount: 1500,
              employer: 'A',
            },
          ],
        },
      ];

      expect(calculateThisMonthDeposits(accounts)).toBe(1500);
    });
  });

  describe('calculatePensionSummary', () => {
    it('should calculate summary correctly', () => {
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 15);

      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 50000,
          depositsCount: 5,
          deposits: [
            {
              id: '1',
              depositDate: new Date(),
              salaryMonth: currentMonth,
              amount: 1000,
              employer: 'A',
            },
          ],
        },
        {
          id: '2',
          type: 'hishtalmut',
          providerName: 'Provider B',
          accountName: 'Account 2',
          currentValue: 50000,
          feeFromDeposit: 0.4,
          feeFromTotal: 0.2,
          totalDeposits: 30000,
          depositsCount: 3,
          deposits: [],
        },
      ];

      const summary = calculatePensionSummary('user-1', accounts);

      expect(summary.userId).toBe('user-1');
      expect(summary.totalValue).toBe(150000);
      expect(summary.totalDeposits).toBe(80000);
      expect(summary.thisMonthDeposits).toBe(1000);
      expect(summary.accountsCount).toBe(2);
      expect(summary.accounts).toEqual(accounts);
    });

    it('should handle empty accounts', () => {
      const summary = calculatePensionSummary('user-1', []);

      expect(summary.userId).toBe('user-1');
      expect(summary.totalValue).toBe(0);
      expect(summary.totalDeposits).toBe(0);
      expect(summary.thisMonthDeposits).toBe(0);
      expect(summary.accountsCount).toBe(0);
    });
  });

  describe('calculateAllocationByProvider', () => {
    it('should calculate allocation by provider', () => {
      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'Account 1',
          currentValue: 60000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 50000,
          depositsCount: 5,
          deposits: [],
        },
        {
          id: '2',
          type: 'hishtalmut',
          providerName: 'Harel',
          accountName: 'Account 2',
          currentValue: 40000,
          feeFromDeposit: 0.4,
          feeFromTotal: 0.2,
          totalDeposits: 30000,
          depositsCount: 3,
          deposits: [],
        },
      ];

      const allocation = calculateAllocationByProvider(accounts);

      expect(allocation).toHaveLength(2);
      expect(allocation[0].name).toBe('Meitav');
      expect(allocation[0].value).toBe(60000);
      expect(allocation[0].percentage).toBe(60);
      expect(allocation[1].name).toBe('Harel');
      expect(allocation[1].value).toBe(40000);
      expect(allocation[1].percentage).toBe(40);
    });

    it('should aggregate multiple accounts with same provider', () => {
      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'Pension',
          currentValue: 60000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 50000,
          depositsCount: 5,
          deposits: [],
        },
        {
          id: '2',
          type: 'hishtalmut',
          providerName: 'Meitav',
          accountName: 'Hishtalmut',
          currentValue: 40000,
          feeFromDeposit: 0.4,
          feeFromTotal: 0.2,
          totalDeposits: 30000,
          depositsCount: 3,
          deposits: [],
        },
      ];

      const allocation = calculateAllocationByProvider(accounts);

      expect(allocation).toHaveLength(1);
      expect(allocation[0].name).toBe('Meitav');
      expect(allocation[0].value).toBe(100000);
      expect(allocation[0].percentage).toBe(100);
    });

    it('should return empty array for zero total value', () => {
      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'Account 1',
          currentValue: 0,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 0,
          depositsCount: 0,
          deposits: [],
        },
      ];

      expect(calculateAllocationByProvider(accounts)).toEqual([]);
    });

    it('should return empty array for empty accounts', () => {
      expect(calculateAllocationByProvider([])).toEqual([]);
    });

    it('should sort by value descending', () => {
      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Small Provider',
          accountName: 'Account 1',
          currentValue: 10000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 5000,
          depositsCount: 1,
          deposits: [],
        },
        {
          id: '2',
          type: 'pension',
          providerName: 'Large Provider',
          accountName: 'Account 2',
          currentValue: 90000,
          feeFromDeposit: 0.4,
          feeFromTotal: 0.2,
          totalDeposits: 50000,
          depositsCount: 5,
          deposits: [],
        },
      ];

      const allocation = calculateAllocationByProvider(accounts);

      expect(allocation[0].name).toBe('Large Provider');
      expect(allocation[1].name).toBe('Small Provider');
    });
  });

  describe('calculateAllocationByType', () => {
    it('should calculate allocation by type', () => {
      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 60000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 50000,
          depositsCount: 5,
          deposits: [],
        },
        {
          id: '2',
          type: 'hishtalmut',
          providerName: 'Provider B',
          accountName: 'Account 2',
          currentValue: 40000,
          feeFromDeposit: 0.4,
          feeFromTotal: 0.2,
          totalDeposits: 30000,
          depositsCount: 3,
          deposits: [],
        },
      ];

      const allocation = calculateAllocationByType(accounts);

      expect(allocation).toHaveLength(2);
      // Sorted by value descending
      expect(allocation[0].name).toBe('Pension');
      expect(allocation[0].value).toBe(60000);
      expect(allocation[0].percentage).toBe(60);
      expect(allocation[1].name).toBe('Hishtalmut');
      expect(allocation[1].value).toBe(40000);
      expect(allocation[1].percentage).toBe(40);
    });

    it('should handle only pension accounts', () => {
      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 50000,
          depositsCount: 5,
          deposits: [],
        },
      ];

      const allocation = calculateAllocationByType(accounts);

      expect(allocation).toHaveLength(1);
      expect(allocation[0].name).toBe('Pension');
      expect(allocation[0].percentage).toBe(100);
    });

    it('should handle only hishtalmut accounts', () => {
      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'hishtalmut',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 50000,
          depositsCount: 5,
          deposits: [],
        },
      ];

      const allocation = calculateAllocationByType(accounts);

      expect(allocation).toHaveLength(1);
      expect(allocation[0].name).toBe('Hishtalmut');
      expect(allocation[0].percentage).toBe(100);
    });

    it('should return empty array for zero total value', () => {
      const accounts: PensionAccountSummary[] = [
        {
          id: '1',
          type: 'pension',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 0,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
          totalDeposits: 0,
          depositsCount: 0,
          deposits: [],
        },
      ];

      expect(calculateAllocationByType(accounts)).toEqual([]);
    });

    it('should return empty array for empty accounts', () => {
      expect(calculateAllocationByType([])).toEqual([]);
    });
  });

  describe('formatSalaryMonth', () => {
    it('should format Date object correctly', () => {
      const date = new Date(2024, 0, 15); // January 2024
      expect(formatSalaryMonth(date)).toBe('Jan 2024');
    });

    it('should format ISO string correctly', () => {
      const dateStr = '2024-06-15T00:00:00.000Z';
      expect(formatSalaryMonth(dateStr)).toBe('Jun 2024');
    });

    it('should handle different months', () => {
      expect(formatSalaryMonth(new Date(2024, 11, 1))).toBe('Dec 2024');
      expect(formatSalaryMonth(new Date(2024, 5, 1))).toBe('Jun 2024');
    });
  });

  describe('formatDepositDate', () => {
    it('should format Date object correctly', () => {
      const date = new Date(2024, 0, 15);
      // en-US locale formats as "Jan 15, 2024"
      expect(formatDepositDate(date)).toBe('Jan 15, 2024');
    });

    it('should format ISO string correctly', () => {
      const dateStr = '2024-06-20T00:00:00.000Z';
      // en-US locale formats as "Jun 20, 2024"
      expect(formatDepositDate(dateStr)).toBe('Jun 20, 2024');
    });
  });

  describe('formatFeePercent', () => {
    it('should format fee percentage correctly', () => {
      expect(formatFeePercent(0.5)).toBe('0.50%');
      expect(formatFeePercent(1.25)).toBe('1.25%');
      expect(formatFeePercent(0)).toBe('0.00%');
    });

    it('should handle whole numbers', () => {
      expect(formatFeePercent(2)).toBe('2.00%');
    });
  });

  describe('formatCurrency', () => {
    it('should format ILS currency', () => {
      const formatted = formatCurrency(10000, 'ILS');
      // Hebrew locale uses different number format
      expect(formatted).toContain('10,000');
    });

    it('should format USD currency', () => {
      const formatted = formatCurrency(10000, 'USD');
      expect(formatted).toContain('10,000');
      expect(formatted).toContain('$');
    });

    it('should default to ILS', () => {
      const formatted = formatCurrency(5000);
      expect(formatted).toContain('5,000');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toContain('0');
    });
  });

  describe('getSalaryMonthOptions', () => {
    it('should return 24 options', () => {
      const options = getSalaryMonthOptions();
      expect(options).toHaveLength(24);
    });

    it('should have current month as first option', () => {
      const options = getSalaryMonthOptions();
      const now = new Date();
      const currentMonthLabel = formatSalaryMonth(now);
      expect(options[0].label).toBe(currentMonthLabel);
    });

    it('should have valid ISO date strings as values', () => {
      const options = getSalaryMonthOptions();
      options.forEach((option) => {
        expect(option.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('should have unique values', () => {
      const options = getSalaryMonthOptions();
      const values = options.map((o) => o.value);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  describe('getAccountTypeName', () => {
    it('should return "Pension" for pension type', () => {
      expect(getAccountTypeName('pension')).toBe('Pension');
    });

    it('should return "Hishtalmut" for hishtalmut type', () => {
      expect(getAccountTypeName('hishtalmut')).toBe('Hishtalmut');
    });
  });

  describe('PENSION_PROVIDERS', () => {
    it('should contain common Israeli providers', () => {
      expect(PENSION_PROVIDERS).toContain('Meitav');
      expect(PENSION_PROVIDERS).toContain('Harel');
      expect(PENSION_PROVIDERS).toContain('Migdal');
      expect(PENSION_PROVIDERS).toContain('Phoenix');
    });

    it('should have unique providers', () => {
      const uniqueProviders = new Set(PENSION_PROVIDERS);
      expect(uniqueProviders.size).toBe(PENSION_PROVIDERS.length);
    });

    it('should have non-empty provider names', () => {
      PENSION_PROVIDERS.forEach((provider) => {
        expect(provider.length).toBeGreaterThan(0);
      });
    });
  });
});
