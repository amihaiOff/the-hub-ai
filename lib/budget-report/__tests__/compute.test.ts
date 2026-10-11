import {
  computeReportStats,
  findDuplicates,
  similarPayee,
  shiftMonth,
  cycleOf,
  lastClosedMonth,
  type ReportCategory,
  type ReportTx,
} from '../compute';

let n = 0;
function tx(p: Partial<ReportTx> & Pick<ReportTx, 'date' | 'amount'>): ReportTx {
  return {
    id: `t${n++}`,
    type: 'expense',
    currency: 'ILS',
    amountOriginal: p.amount,
    categoryId: null,
    payee: null,
    notes: null,
    tags: [],
    paymentMethod: 'credit_card',
    paymentNumber: null,
    totalPayments: null,
    settled: true,
    ...p,
  };
}

const cat = (id: string, p: Partial<ReportCategory> = {}): ReportCategory => ({
  id,
  name: id,
  group: 'G',
  budget: null,
  isMust: false,
  excluded: false,
  everyMonths: 1,
  ...p,
});

const CATS = [
  cat('Food', { budget: 1000 }),
  cat('Vet', { budget: 100 }),
  cat('Mortgage', { excluded: true }),
  cat('Savings', { budget: 8000 }),
  cat('VaadBait', { budget: 350, everyMonths: 2 }),
  cat('Shrink', { budget: 1600 }),
];

describe('helpers', () => {
  it('shifts months across years', () => {
    expect(shiftMonth('2026-02', 3)).toBe('2025-11');
  });

  it('applies the cycle to bank rows too', () => {
    expect(cycleOf('2026-10-09', 10)).toBe('2026-09');
    expect(cycleOf('2026-10-10', 10)).toBe('2026-10');
  });

  it('matches truncated and reversed payee names', () => {
    expect(similarPayee('סופר פארם מגדל האופרה', 'סופר פארם מגדל האופר')).toBe(true);
    expect(similarPayee('porter&snos', 'sons&retrop')).toBe(true);
    expect(similarPayee('WOLT', 'Spotify')).toBe(false);
  });
});

describe('findDuplicates', () => {
  it('flags a pending row with a settled twin as likely, and leaves out the pending one', () => {
    const a = tx({
      date: '2026-09-26',
      amount: 27.9,
      payee: 'סופר פארם מגדל האופרה',
      settled: false,
    });
    const b = tx({ date: '2026-09-27', amount: 27.9, payee: 'סופר פארם מגדל האופר' });
    const [d] = findDuplicates([a, b]);
    expect(d.confidence).toBe('likely');
    expect(d.excludedId).toBe(a.id);
  });

  it('ignores two settled same-amount purchases a week apart', () => {
    const rows = [
      tx({ date: '2026-09-08', amount: 70.35, payee: 'WOLT' }),
      tx({ date: '2026-09-14', amount: 70.35, payee: 'WOLT' }),
    ];
    expect(findDuplicates(rows)).toHaveLength(0);
  });
});

describe('computeReportStats', () => {
  const rows: ReportTx[] = [
    // prior cycles: Food 900/1200/1500, Shrink 800 x3, Vaad 700/0/700
    tx({ date: '2026-06-15', amount: 900, categoryId: 'Food' }),
    tx({ date: '2026-07-15', amount: 1200, categoryId: 'Food' }),
    tx({ date: '2026-08-15', amount: 1500, categoryId: 'Food' }),
    tx({ date: '2026-06-20', amount: 800, categoryId: 'Shrink', paymentMethod: 'bank_transfer' }),
    tx({ date: '2026-07-20', amount: 800, categoryId: 'Shrink', paymentMethod: 'bank_transfer' }),
    tx({ date: '2026-08-20', amount: 800, categoryId: 'Shrink', paymentMethod: 'bank_transfer' }),
    tx({ date: '2026-06-22', amount: 700, categoryId: 'VaadBait' }),
    tx({ date: '2026-08-22', amount: 700, categoryId: 'VaadBait' }),
    // report cycle (Sep 10 – Oct 9)
    tx({ date: '2026-09-20', amount: 600, categoryId: 'Food' }),
    tx({
      date: '2026-09-26',
      amount: 50,
      categoryId: 'Food',
      payee: 'Bakery Opera',
      settled: false,
    }),
    tx({ date: '2026-09-28', amount: 50, categoryId: 'Food', payee: 'Bakery Op' }),
    tx({ date: '2026-09-26', amount: 1292, categoryId: 'Vet', payee: 'Dr Vet' }),
    tx({ date: '2026-10-05', amount: 1292, type: 'income', payee: 'הפניקס חברה לבי' }),
    tx({
      date: '2026-10-01',
      amount: 20000,
      type: 'income',
      payee: 'משכורת',
      paymentMethod: 'bank_transfer',
    }),
    tx({
      date: '2026-09-10',
      amount: 4364,
      categoryId: 'Mortgage',
      paymentMethod: 'bank_transfer',
    }),
    tx({ date: '2026-09-10', amount: 4500, type: 'income', categoryId: 'Mortgage' }),
    tx({ date: '2026-09-15', amount: 5000, categoryId: 'Savings' }),
    tx({ date: '2026-09-19', amount: 300, tags: ['Trip'] }),
    tx({ date: '2026-09-25', amount: 700, categoryId: 'VaadBait', paymentMethod: 'bank_transfer' }),
    tx({ date: '2026-10-06', amount: 2245, categoryId: 'Food', notes: 'תשלום 1 מתוך 2' }),
  ];
  const s = computeReportStats('2026-09', 10, rows, CATS);
  const byName = (name: string) => s.categories.find((c) => c.name === name)!;

  it('leaves out excluded categories, savings, one-offs, duplicates and reimbursed spend', () => {
    // 600 + 50 (one of the duplicate pair) + 700 + 2245
    expect(s.everyday).toBe(3595);
    expect(s.savings).toBe(5000);
    expect(s.oneOffs).toEqual([{ tag: 'Trip', total: 300, count: 1 }]);
    expect(s.excludedCategories).toEqual(['Mortgage']);
  });

  it('does not count an insurer payout as income and nets out what it paid back', () => {
    expect(s.income).toBe(20000);
    expect(s.refunds).toEqual([
      expect.objectContaining({ kind: 'insurance', amount: 1292, expenseCategory: 'Vet' }),
    ]);
    expect(byName('Vet').reimbursed).toBe(1292);
    expect(byName('Vet').status).toBe('none');
  });

  it('compares against the 3 previous cycles', () => {
    expect(byName('Food').history).toEqual([900, 1200, 1500, 2895]);
    expect(byName('Food').avg3).toBe(1200);
  });

  it('judges bimonthly categories on their 4-cycle average', () => {
    expect(byName('VaadBait').monthly).toBe(525);
    expect(byName('VaadBait').status).toBe('over');
  });

  it('lists regular categories missing this cycle', () => {
    expect(s.notSeen).toContainEqual(expect.objectContaining({ name: 'Shrink', kind: 'category' }));
  });

  it('finds installments from card notes', () => {
    expect(s.installments).toEqual([
      { payee: null, amount: 2245, paymentNumber: 1, totalPayments: 2 },
    ]);
  });

  it('computes cash flow from all income and spending except savings', () => {
    // income 20000 + 1292; spend 600+50+1292+300+700+2245
    expect(s.cashFlow).toBe(21292 - 5187);
  });
});

describe('lastClosedMonth', () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

  it('returns the previous cycle once the current one has started (startDay 10)', () => {
    expect(lastClosedMonth(at('2026-10-11'), 10)).toBe('2026-09');
    expect(lastClosedMonth(at('2026-10-10'), 10)).toBe('2026-09');
  });

  it('returns two months back before the start day (startDay 10)', () => {
    expect(lastClosedMonth(at('2026-10-09'), 10)).toBe('2026-08');
  });

  it('with startDay 1 the last closed cycle is the previous calendar month', () => {
    expect(lastClosedMonth(at('2026-10-01'), 1)).toBe('2026-09');
    expect(lastClosedMonth(at('2026-10-31'), 1)).toBe('2026-09');
  });

  it('crosses the year boundary', () => {
    expect(lastClosedMonth(at('2026-01-11'), 10)).toBe('2025-12');
    expect(lastClosedMonth(at('2026-01-09'), 10)).toBe('2025-11');
    expect(lastClosedMonth(at('2026-02-05'), 10)).toBe('2025-12');
  });
});
