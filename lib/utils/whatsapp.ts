/**
 * Helpers for the "Ask partner on WhatsApp" feature.
 *
 * We use wa.me deep links rather than the WhatsApp Business API — opening
 * WhatsApp with a prefilled message and letting the user tap send is the
 * right fit for an "ask my spouse about this transaction" flow (no Meta
 * approval, no per-message cost, user sees the message before it goes out).
 */

interface AskPartnerArgs {
  partnerPhone: string;
  payee: string;
  amountIls: number;
  /** ISO date string, e.g. "2026-06-15" or a full ISO timestamp. */
  date: string;
}

/**
 * wa.me requires a digits-only phone number, including country code, no
 * leading `+`. Strip everything else; if the input started with a `0` we
 * assume Israeli local format and prefix `972`.
 */
export function normalizeWhatsappPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return digits;
  // 0-prefixed local Israeli numbers — strip the leading 0, add country code.
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

function formatDateHe(date: string): string {
  // Accept YYYY-MM-DD or full ISO; output DD/MM/YYYY.
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatAmountIls(amount: number): string {
  // Always positive in the message; sign is captured by the question itself.
  const abs = Math.abs(amount);
  return `${abs.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;
}

export function buildAskPartnerMessage({
  payee,
  amountIls,
  date,
}: Omit<AskPartnerArgs, 'partnerPhone'>): string {
  return [
    'היי, ראיתי את התנועה הזאת ואני לא יודע על מה היא. מזהה?',
    `${payee} — ${formatDateHe(date)} — ${formatAmountIls(amountIls)}`,
  ].join('\n');
}

export function buildAskPartnerWaLink(args: AskPartnerArgs): string {
  const phone = normalizeWhatsappPhone(args.partnerPhone);
  const text = encodeURIComponent(buildAskPartnerMessage(args));
  return `https://wa.me/${phone}?text=${text}`;
}
