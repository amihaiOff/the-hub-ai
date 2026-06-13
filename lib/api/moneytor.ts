const MONEYTOR_BASE_URL = 'https://app.moneytor.co.il/api/v1';
const DEFAULT_LIMIT = 2000;

export interface MoneytorTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // signed
  currency: string;
  description: string;
  category: string;
  accountId: string;
  type: string;
}

interface MoneytorTransactionsResponse {
  ok: boolean;
  asOf?: string;
  count?: number;
  totalAvailable?: number;
  transactions?: MoneytorTransaction[];
  error?: string;
  code?: string;
  message?: string;
  renew_url?: string;
}

export type MoneytorErrorCode =
  | 'missing_token'
  | 'invalid_token'
  | 'token_expired'
  | 'premium_required'
  | 'rate_limited'
  | 'network_error'
  | 'unknown';

export class MoneytorApiError extends Error {
  code: MoneytorErrorCode;
  status?: number;
  renewUrl?: string;

  constructor(message: string, code: MoneytorErrorCode, status?: number, renewUrl?: string) {
    super(message);
    this.name = 'MoneytorApiError';
    this.code = code;
    this.status = status;
    this.renewUrl = renewUrl;
  }
}

export interface FetchTransactionsOptions {
  from?: string; // ISO date (YYYY-MM-DD or full ISO)
  to?: string;
  limit?: number;
}

export async function fetchMoneytorTransactions(
  options: FetchTransactionsOptions = {}
): Promise<MoneytorTransaction[]> {
  const url = new URL(`${MONEYTOR_BASE_URL}/transactions`);
  if (options.from) url.searchParams.set('from', options.from);
  if (options.to) url.searchParams.set('to', options.to);
  url.searchParams.set('limit', String(options.limit ?? DEFAULT_LIMIT));

  const data = await moneytorGet<MoneytorTransactionsResponse>(url);
  return data.transactions ?? [];
}

// ---- Assets ----

export interface MoneytorStockDataItem {
  stockName: string;
  amount: number;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  stockPrice: number;
  stockPriceInBaseCurrency?: number;
  currency?: { value?: string };
  totalWorth?: number;
  totalWorthInBaseCurrency?: number;
  balanceInBaseCurrency?: number;
}

export interface MoneytorShareAsset {
  id: string;
  productId: number;
  form: 'share';
  name: string;
  broker?: string | null;
  cash?: number;
  stocksData?: MoneytorStockDataItem[];
  balanceInBaseCurrency?: number;
  partOfPortfolio?: number;
  updatedAt?: string;
}

export interface MoneytorAsset {
  id: string;
  productId: number;
  form: string;
  name: string;
  balanceInBaseCurrency?: number;
  partOfPortfolio?: number;
  updatedAt?: string;
  currency?: { value?: string; name?: string; sign?: string; rate?: number };
  [key: string]: unknown;
}

// Bank-form fields we care about (the API may return more — see `[key: string]: unknown`).
export interface MoneytorBankAsset extends MoneytorAsset {
  form: 'bank';
  bank?: string;
  amount?: number;
  interest?: number;
  monthlyDeposit?: number;
  closeExitPoint?: string;
  maturityDate?: string;
  accountType?: { value?: string; name?: string };
  bankNumber?: string | number;
  branchNumber?: string | number;
  accountNumber?: string | number;
  tax?: number;
}

export interface MoneytorDebtRoute {
  remainder?: number;
  trackInterestType?: { value?: string; name?: string };
  interest?: number;
  monthlyRepayment?: number;
  originalSum?: number;
  debtPeriodInMonths?: number;
}

export interface MoneytorDebtAsset extends MoneytorAsset {
  form: 'debt';
  debtInstitution?: string;
  debtType?: string;
  startDate?: string;
  routesData?: MoneytorDebtRoute[];
  returnType?: string;
  graceType?: { value?: string; name?: string };
  graceYears?: { value?: number };
}

// Pension and hishtalmut (study fund) come back under form="pension"; the
// productType.value field distinguishes them ("קרן פנסיה" vs "קרן השתלמות").
// A single fund with multiple investment tracks appears as multiple rows.
export interface MoneytorPensionAsset extends MoneytorAsset {
  form: 'pension';
  institution?: { value?: string; name?: string };
  productType?: { value?: string; name?: string };
  route?: { value?: string; name?: string };
  number?: { value?: string; name?: string };
  amount?: number;
  profitsFromLastYear?: number;
  accountNumber?: string | number;
  accountOwner?: string;
  fundOpeningDate?: string;
  managementFeeFromSavings?: number;
  managementFeeFromDeposit?: number;
  depositFrequency?: { value?: string; name?: string };
  monthlyDepositEmployee?: number;
  monthlyDepositEmployer?: number;
  monthlyDepositSum?: number;
  employerProvisionPercentage?: number;
  compensationProvisionPercentage?: number;
  yearsToRetirement?: number;
  fundId?: string;
  sugKupa?: number | string;
  sugKerenPensia?: string;
  projectedMonthlyPension?: number;
  projectedSavingsWithPremiums?: number;
  projectedSavingsWithoutPremiums?: number;
  schumKitzbatZikna?: number;
  matsavMishpachti?: string;
  taarichLeyda?: string;
  gender?: string;
  gilPrisha?: number;
  sumHafkadotPitsuyim?: number;
  sumHafkadotLoPitsuyim?: number;
  pitzuimMaasikNochechi?: number;
  pitzuimMarkivLemas?: number;
  investmentDistribution?: Array<{
    amount?: number;
    routeCode?: string;
    routeName?: string;
    depositPercentage?: number;
  }>;
}

interface MoneytorAssetsResponse {
  ok: boolean;
  asOf?: string;
  baseCurrency?: string;
  count?: number;
  assets?: MoneytorAsset[];
  error?: string;
  code?: string;
  message?: string;
  renew_url?: string;
}

/**
 * Single fetch of /api/v1/assets. The sync filters per-form locally —
 * Moneytor returns everything in one call, so we should only call it once
 * per sync (avoids burning the per-hour API quota).
 */
export async function fetchMoneytorAssets(): Promise<MoneytorAsset[]> {
  const url = new URL(`${MONEYTOR_BASE_URL}/assets`);
  const data = await moneytorGet<MoneytorAssetsResponse>(url);
  return data.assets ?? [];
}

export async function fetchMoneytorShareAssets(): Promise<MoneytorShareAsset[]> {
  const assets = await fetchMoneytorAssets();
  return assets.filter((a): a is MoneytorAsset & MoneytorShareAsset => a.form === 'share');
}

async function moneytorGet<
  T extends { ok: boolean; error?: string; code?: string; message?: string; renew_url?: string },
>(url: URL): Promise<T> {
  const token = process.env.MONEYTOR_API_TOKEN;
  if (!token) {
    throw new MoneytorApiError(
      'MONEYTOR_API_TOKEN is not configured on the server',
      'missing_token'
    );
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
  } catch (err) {
    throw new MoneytorApiError(
      `Network error contacting Moneytor: ${err instanceof Error ? err.message : String(err)}`,
      'network_error'
    );
  }

  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    // Some Moneytor endpoints respond with text/plain (e.g. "Unexpected Server
    // Error") on 5xx — try to surface that body instead of a generic message.
    let preview = '';
    try {
      preview = (await response.text()).trim().slice(0, 120);
    } catch {
      // ignore
    }
    if (response.status >= 500) {
      const body = preview || 'no response body';
      throw new MoneytorApiError(
        `Moneytor server error (${response.status}): ${body}. The Moneytor API is having issues — try again in a few minutes.`,
        'unknown',
        response.status
      );
    }
    throw new MoneytorApiError(
      `Moneytor returned non-JSON response (status ${response.status})${preview ? `: ${preview}` : ''}`,
      'unknown',
      response.status
    );
  }

  if (!response.ok || data.ok === false) {
    if (response.status === 401) {
      const isExpired = data.code === 'api_token_expired';
      throw new MoneytorApiError(
        data.message || data.error || 'Moneytor API token is invalid or expired',
        isExpired ? 'token_expired' : 'invalid_token',
        401,
        data.renew_url
      );
    }
    if (response.status === 403) {
      throw new MoneytorApiError(
        data.error || 'Moneytor premium subscription required',
        'premium_required',
        403
      );
    }
    if (response.status === 429) {
      throw new MoneytorApiError(
        data.message || data.error || 'Moneytor API rate limit reached',
        'rate_limited',
        429
      );
    }
    throw new MoneytorApiError(
      data.error || `Moneytor API error (status ${response.status})`,
      'unknown',
      response.status
    );
  }

  return data;
}
