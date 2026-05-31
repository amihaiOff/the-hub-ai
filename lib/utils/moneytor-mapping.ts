import type { PaymentMethod } from '@prisma/client';

/**
 * Maps Moneytor's `type` field (the source account type, not the transaction type)
 * to the local `PaymentMethod` enum. Anything we don't recognise becomes 'other'.
 */
export function mapMoneytorTypeToPaymentMethod(type: string): PaymentMethod {
  switch (type.toUpperCase()) {
    case 'CARD':
      return 'credit_card';
    case 'CHECKING':
      return 'bank_transfer';
    case 'CASH':
      return 'cash';
    default:
      return 'other';
  }
}
