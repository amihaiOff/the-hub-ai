import {
  computeAccountStableKey,
  computePensionStableKey,
  computeRealEstateStableKey,
} from '../stable-key';

describe('computeAccountStableKey', () => {
  it('returns openfinanceAssetId when present in rawData', () => {
    const raw = { openfinanceAssetId: 'ACCOUNT#TYPE#CHECKING' };
    expect(computeAccountStableKey(raw)).toBe('ACCOUNT#TYPE#CHECKING');
  });

  it('trims whitespace on the returned key', () => {
    expect(computeAccountStableKey({ openfinanceAssetId: '  X  ' })).toBe('X');
  });

  it('returns null when openfinanceAssetId is missing / empty', () => {
    expect(computeAccountStableKey({})).toBeNull();
    expect(computeAccountStableKey({ openfinanceAssetId: '' })).toBeNull();
    expect(computeAccountStableKey({ openfinanceAssetId: '   ' })).toBeNull();
    expect(computeAccountStableKey(null)).toBeNull();
    expect(computeAccountStableKey(undefined)).toBeNull();
  });
});

describe('computePensionStableKey', () => {
  it('normalizes and joins institution|accountNumber|routeName', () => {
    expect(
      computePensionStableKey({
        institution: 'Harel Pension',
        accountNumber: '123',
        routeName: 'S&P 500',
      })
    ).toBe('harel pension|123|s&p 500');
  });

  it('collapses runs of whitespace inside components', () => {
    expect(
      computePensionStableKey({
        institution: '  Harel   Pension  ',
        accountNumber: ' 123 ',
        routeName: 'S&P   500',
      })
    ).toBe('harel pension|123|s&p 500');
  });

  it('returns null when any component is missing', () => {
    expect(
      computePensionStableKey({ institution: null, accountNumber: '1', routeName: 'r' })
    ).toBeNull();
    expect(
      computePensionStableKey({ institution: 'i', accountNumber: null, routeName: 'r' })
    ).toBeNull();
    expect(
      computePensionStableKey({ institution: 'i', accountNumber: '1', routeName: null })
    ).toBeNull();
  });
});

describe('computeRealEstateStableKey', () => {
  it('lowercases + trims the address', () => {
    expect(computeRealEstateStableKey('  Some St, City  ')).toBe('some st, city');
  });

  it('returns null for empty / null', () => {
    expect(computeRealEstateStableKey(null)).toBeNull();
    expect(computeRealEstateStableKey('')).toBeNull();
    expect(computeRealEstateStableKey('   ')).toBeNull();
  });
});
