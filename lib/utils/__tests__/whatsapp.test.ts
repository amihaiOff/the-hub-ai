import { buildAskPartnerMessage, buildAskPartnerWaLink, normalizeWhatsappPhone } from '../whatsapp';

describe('normalizeWhatsappPhone', () => {
  it('strips +, spaces, dashes and parens from international numbers', () => {
    expect(normalizeWhatsappPhone('+972 50-123-4567')).toBe('972501234567');
    expect(normalizeWhatsappPhone('+1 (415) 555-0000')).toBe('14155550000');
  });

  it('converts Israeli local format to country-code form', () => {
    expect(normalizeWhatsappPhone('0501234567')).toBe('972501234567');
    expect(normalizeWhatsappPhone('050-123-4567')).toBe('972501234567');
  });

  it('passes through digits-only numbers unchanged', () => {
    expect(normalizeWhatsappPhone('14155550000')).toBe('14155550000');
  });
});

describe('buildAskPartnerMessage', () => {
  it('includes payee, formatted date, and absolute amount in ILS', () => {
    const msg = buildAskPartnerMessage({
      payee: 'Shufersal',
      amountIls: -123.5,
      date: '2026-06-15',
    });
    expect(msg).toContain('Shufersal');
    expect(msg).toContain('15/06/2026');
    expect(msg).toContain('123.50');
    expect(msg).toContain('₪');
    // The amount is shown as a positive value — the message wording already asks
    // about a charge, no need for a leading minus.
    expect(msg).not.toContain('-123');
  });

  it('starts with the Hebrew question line', () => {
    const msg = buildAskPartnerMessage({ payee: 'X', amountIls: 10, date: '2026-01-01' });
    expect(msg.startsWith('היי')).toBe(true);
  });
});

describe('buildAskPartnerWaLink', () => {
  it('builds a wa.me link with normalized phone and url-encoded text', () => {
    const link = buildAskPartnerWaLink({
      partnerPhone: '+972 50-123-4567',
      payee: 'Shufersal',
      amountIls: -60,
      date: '2026-06-07',
    });
    expect(link.startsWith('https://wa.me/972501234567?text=')).toBe(true);
    const text = decodeURIComponent(link.split('?text=')[1]);
    expect(text).toContain('Shufersal');
    expect(text).toContain('07/06/2026');
  });
});
