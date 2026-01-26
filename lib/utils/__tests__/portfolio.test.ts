import {
  calculateHoldingValue,
  calculateCostBasis,
  calculateGainLoss,
  calculateGainLossPercent,
  calculateHoldingDetails,
  calculateAccountSummary,
  calculatePortfolioSummary,
  calculateAllocation,
  formatCurrency,
  formatPercent,
  formatQuantity,
  type HoldingWithPrice,
} from '../portfolio';

describe('Portfolio Calculations', () => {
  describe('calculateHoldingValue', () => {
    it('should calculate holding value correctly with numbers', () => {
      expect(calculateHoldingValue(10, 150.5)).toBe(1505);
    });

    it('should calculate holding value with string inputs', () => {
      expect(calculateHoldingValue('10', '150.5')).toBe(1505);
    });

    it('should handle fractional shares', () => {
      expect(calculateHoldingValue(0.5, 100)).toBe(50);
    });

    it('should handle zero quantity', () => {
      expect(calculateHoldingValue(0, 150)).toBe(0);
    });

    it('should handle zero price', () => {
      expect(calculateHoldingValue(10, 0)).toBe(0);
    });
  });

  describe('calculateCostBasis', () => {
    it('should calculate cost basis correctly', () => {
      expect(calculateCostBasis(10, 100)).toBe(1000);
    });

    it('should handle fractional shares', () => {
      expect(calculateCostBasis(2.5, 200)).toBe(500);
    });

    it('should handle string inputs', () => {
      expect(calculateCostBasis('10', '100')).toBe(1000);
    });
  });

  describe('calculateGainLoss', () => {
    it('should calculate positive gain', () => {
      expect(calculateGainLoss(1500, 1000)).toBe(500);
    });

    it('should calculate negative loss', () => {
      expect(calculateGainLoss(800, 1000)).toBe(-200);
    });

    it('should handle zero gain/loss', () => {
      expect(calculateGainLoss(1000, 1000)).toBe(0);
    });
  });

  describe('calculateGainLossPercent', () => {
    it('should calculate positive percentage', () => {
      expect(calculateGainLossPercent(1500, 1000)).toBe(50);
    });

    it('should calculate negative percentage', () => {
      expect(calculateGainLossPercent(800, 1000)).toBe(-20);
    });

    it('should return 0 when cost basis is 0', () => {
      expect(calculateGainLossPercent(100, 0)).toBe(0);
    });

    it('should handle zero gain/loss', () => {
      expect(calculateGainLossPercent(1000, 1000)).toBe(0);
    });
  });

  describe('calculateHoldingDetails', () => {
    it('should calculate all holding details correctly', () => {
      const holding: HoldingWithPrice = {
        id: 'test-id',
        symbol: 'AAPL',
        quantity: 10,
        avgCostBasis: 100,
        currentPrice: 150,
      };

      const result = calculateHoldingDetails(holding);

      expect(result.id).toBe('test-id');
      expect(result.symbol).toBe('AAPL');
      expect(result.quantity).toBe(10);
      expect(result.avgCostBasis).toBe(100);
      expect(result.currentPrice).toBe(150);
      expect(result.currentValue).toBe(1500);
      expect(result.costBasis).toBe(1000);
      expect(result.gainLoss).toBe(500);
      expect(result.gainLossPercent).toBe(50);
    });

    it('should handle loss scenario', () => {
      const holding: HoldingWithPrice = {
        id: 'test-id',
        symbol: 'TSLA',
        quantity: 5,
        avgCostBasis: 300,
        currentPrice: 200,
      };

      const result = calculateHoldingDetails(holding);

      expect(result.currentValue).toBe(1000);
      expect(result.costBasis).toBe(1500);
      expect(result.gainLoss).toBe(-500);
      expect(result.gainLossPercent).toBeCloseTo(-33.33, 1);
    });
  });

  describe('calculateAccountSummary', () => {
    it('should calculate account summary with multiple holdings', () => {
      const account = {
        id: 'account-1',
        name: 'Test Account',
        broker: 'Test Broker',
        holdings: [
          { id: 'h1', symbol: 'AAPL', quantity: 10, avgCostBasis: 100, currentPrice: 150 },
          { id: 'h2', symbol: 'GOOGL', quantity: 5, avgCostBasis: 200, currentPrice: 250 },
        ],
      };

      const result = calculateAccountSummary(account);

      expect(result.id).toBe('account-1');
      expect(result.name).toBe('Test Account');
      expect(result.broker).toBe('Test Broker');
      expect(result.totalValue).toBe(2750); // 1500 + 1250
      expect(result.totalCostBasis).toBe(2000); // 1000 + 1000
      expect(result.totalGainLoss).toBe(750);
      expect(result.totalGainLossPercent).toBe(37.5);
      expect(result.holdings).toHaveLength(2);
    });

    it('should handle empty holdings', () => {
      const account = {
        id: 'account-1',
        name: 'Empty Account',
        broker: null,
        holdings: [],
      };

      const result = calculateAccountSummary(account);

      expect(result.totalValue).toBe(0);
      expect(result.totalCostBasis).toBe(0);
      expect(result.totalGainLoss).toBe(0);
      expect(result.totalGainLossPercent).toBe(0);
      expect(result.holdings).toHaveLength(0);
    });

    it('should include cash balances in total value', () => {
      const account = {
        id: 'account-1',
        name: 'Account with Cash',
        broker: 'Test Broker',
        currency: 'USD',
        holdings: [
          { id: 'h1', symbol: 'AAPL', quantity: 10, avgCostBasis: 100, currentPrice: 150 },
        ],
        cashBalances: [
          { id: 'c1', currency: 'USD', amount: 1000, convertedAmount: 1000 },
          { id: 'c2', currency: 'EUR', amount: 500, convertedAmount: 550 },
        ],
      };

      const result = calculateAccountSummary(account);

      expect(result.totalHoldingsValue).toBe(1500); // Just AAPL
      expect(result.totalCash).toBe(1550); // 1000 USD + 550 EUR (converted)
      expect(result.totalValue).toBe(3050); // Holdings + Cash
      expect(result.totalCostBasis).toBe(1000);
      expect(result.totalGainLoss).toBe(500); // Only from holdings
      expect(result.cashBalances).toHaveLength(2);
    });

    it('should handle account with only cash (no holdings)', () => {
      const account = {
        id: 'account-1',
        name: 'Cash Only Account',
        broker: null,
        holdings: [],
        cashBalances: [{ id: 'c1', currency: 'USD', amount: 5000, convertedAmount: 5000 }],
      };

      const result = calculateAccountSummary(account);

      expect(result.totalHoldingsValue).toBe(0);
      expect(result.totalCash).toBe(5000);
      expect(result.totalValue).toBe(5000);
      expect(result.totalCostBasis).toBe(0);
      expect(result.totalGainLoss).toBe(0);
      expect(result.totalGainLossPercent).toBe(0);
    });
  });

  describe('calculatePortfolioSummary', () => {
    it('should calculate portfolio summary with multiple accounts', () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Account 1',
          broker: 'Broker 1',
          holdings: [
            { id: 'h1', symbol: 'AAPL', quantity: 10, avgCostBasis: 100, currentPrice: 150 },
          ],
        },
        {
          id: 'account-2',
          name: 'Account 2',
          broker: 'Broker 2',
          holdings: [
            { id: 'h2', symbol: 'GOOGL', quantity: 5, avgCostBasis: 200, currentPrice: 250 },
          ],
        },
      ];

      const result = calculatePortfolioSummary(accounts);

      expect(result.totalValue).toBe(2750);
      expect(result.totalCostBasis).toBe(2000);
      expect(result.totalGainLoss).toBe(750);
      expect(result.totalGainLossPercent).toBe(37.5);
      expect(result.totalHoldings).toBe(2);
      expect(result.accounts).toHaveLength(2);
    });

    it('should handle empty portfolio', () => {
      const result = calculatePortfolioSummary([]);

      expect(result.totalValue).toBe(0);
      expect(result.totalCostBasis).toBe(0);
      expect(result.totalGainLoss).toBe(0);
      expect(result.totalGainLossPercent).toBe(0);
      expect(result.totalHoldings).toBe(0);
      expect(result.accounts).toHaveLength(0);
    });

    it('should include cash in portfolio totals', () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Account 1',
          broker: 'Broker 1',
          holdings: [
            { id: 'h1', symbol: 'AAPL', quantity: 10, avgCostBasis: 100, currentPrice: 150 },
          ],
          cashBalances: [{ id: 'c1', currency: 'USD', amount: 1000, convertedAmount: 1000 }],
        },
        {
          id: 'account-2',
          name: 'Account 2',
          broker: 'Broker 2',
          holdings: [
            { id: 'h2', symbol: 'GOOGL', quantity: 5, avgCostBasis: 200, currentPrice: 250 },
          ],
          cashBalances: [{ id: 'c2', currency: 'EUR', amount: 500, convertedAmount: 600 }],
        },
      ];

      const result = calculatePortfolioSummary(accounts);

      expect(result.totalHoldingsValue).toBe(2750); // 1500 + 1250
      expect(result.totalCash).toBe(1600); // 1000 + 600
      expect(result.totalValue).toBe(4350); // Holdings + Cash
      expect(result.totalCostBasis).toBe(2000);
      expect(result.totalGainLoss).toBe(750); // Only from holdings
      expect(result.totalGainLossPercent).toBe(37.5);
      expect(result.totalHoldings).toBe(2);
    });
  });

  describe('calculateAllocation', () => {
    it('should calculate allocation percentages', () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Account 1',
          broker: null,
          currency: 'USD',
          totalValue: 2000,
          totalHoldingsValue: 2000,
          totalCash: 0,
          totalCostBasis: 1000,
          totalGainLoss: 1000,
          totalGainLossPercent: 100,
          holdings: [
            {
              id: 'h1',
              symbol: 'AAPL',
              quantity: 10,
              avgCostBasis: 100,
              currentPrice: 150,
              currentValue: 1500,
              costBasis: 1000,
              gainLoss: 500,
              gainLossPercent: 50,
            },
            {
              id: 'h2',
              symbol: 'GOOGL',
              quantity: 2,
              avgCostBasis: 250,
              currentPrice: 250,
              currentValue: 500,
              costBasis: 500,
              gainLoss: 0,
              gainLossPercent: 0,
            },
          ],
          cashBalances: [],
        },
      ];

      const result = calculateAllocation(accounts);

      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[0].value).toBe(1500);
      expect(result[0].percentage).toBe(75);
      expect(result[1].symbol).toBe('GOOGL');
      expect(result[1].value).toBe(500);
      expect(result[1].percentage).toBe(25);
    });

    it('should aggregate same symbols across accounts', () => {
      const accounts = [
        {
          id: 'account-1',
          name: 'Account 1',
          broker: null,
          currency: 'USD',
          totalValue: 1000,
          totalHoldingsValue: 1000,
          totalCash: 0,
          totalCostBasis: 1000,
          totalGainLoss: 0,
          totalGainLossPercent: 0,
          holdings: [
            {
              id: 'h1',
              symbol: 'AAPL',
              quantity: 10,
              avgCostBasis: 100,
              currentPrice: 100,
              currentValue: 1000,
              costBasis: 1000,
              gainLoss: 0,
              gainLossPercent: 0,
            },
          ],
          cashBalances: [],
        },
        {
          id: 'account-2',
          name: 'Account 2',
          broker: null,
          currency: 'USD',
          totalValue: 1000,
          totalHoldingsValue: 1000,
          totalCash: 0,
          totalCostBasis: 1000,
          totalGainLoss: 0,
          totalGainLossPercent: 0,
          holdings: [
            {
              id: 'h2',
              symbol: 'AAPL',
              quantity: 10,
              avgCostBasis: 100,
              currentPrice: 100,
              currentValue: 1000,
              costBasis: 1000,
              gainLoss: 0,
              gainLossPercent: 0,
            },
          ],
          cashBalances: [],
        },
      ];

      const result = calculateAllocation(accounts);

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[0].value).toBe(2000);
      expect(result[0].percentage).toBe(100);
    });

    it('should return empty array for no holdings', () => {
      const result = calculateAllocation([]);
      expect(result).toHaveLength(0);
    });
  });
});

describe('Formatting Functions', () => {
  describe('formatCurrency', () => {
    it('should format positive values', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should format negative values', () => {
      expect(formatCurrency(-500.5)).toBe('-$500.50');
    });

    it('should format zero', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle large numbers', () => {
      expect(formatCurrency(1000000)).toBe('$1,000,000.00');
    });
  });

  describe('formatPercent', () => {
    it('should format positive percentages with plus sign', () => {
      expect(formatPercent(25.5)).toBe('+25.50%');
    });

    it('should format negative percentages', () => {
      expect(formatPercent(-10.25)).toBe('-10.25%');
    });

    it('should format zero with plus sign', () => {
      expect(formatPercent(0)).toBe('+0.00%');
    });
  });

  describe('formatQuantity', () => {
    it('should format whole numbers', () => {
      expect(formatQuantity(10)).toBe('10');
    });

    it('should format fractional shares', () => {
      expect(formatQuantity(0.5)).toBe('0.5000');
    });

    it('should format fractional with precision', () => {
      expect(formatQuantity(2.12345)).toBe('2.1235');
    });
  });
});
