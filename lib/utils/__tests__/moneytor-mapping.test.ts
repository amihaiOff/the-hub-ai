import { mapMoneytorTypeToPaymentMethod } from '../moneytor-mapping';

describe('mapMoneytorTypeToPaymentMethod', () => {
  it.each([
    ['CARD', 'credit_card'],
    ['CHECKING', 'bank_transfer'],
    ['CASH', 'cash'],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(mapMoneytorTypeToPaymentMethod(input)).toBe(expected);
  });

  it('is case-insensitive on the input', () => {
    expect(mapMoneytorTypeToPaymentMethod('card')).toBe('credit_card');
    expect(mapMoneytorTypeToPaymentMethod('Checking')).toBe('bank_transfer');
    expect(mapMoneytorTypeToPaymentMethod('cash')).toBe('cash');
  });

  it('falls back to "other" for unknown types', () => {
    expect(mapMoneytorTypeToPaymentMethod('CRYPTO')).toBe('other');
    expect(mapMoneytorTypeToPaymentMethod('')).toBe('other');
    expect(mapMoneytorTypeToPaymentMethod('savings')).toBe('other');
  });
});
