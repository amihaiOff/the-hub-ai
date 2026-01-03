import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';

export interface ExchangeRates {
  USD: number;
  EUR: number;
  GBP: number;
  ILS: number;
}

export interface ExchangeRatesResponse {
  success: boolean;
  rates?: ExchangeRates;
  baseCurrency: string;
  error?: string;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
      };
    }>;
  };
}

// Fetch a single exchange rate using Yahoo Finance chart API
async function fetchRate(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      return null;
    }

    const data: YahooChartResponse = await response.json();
    return data.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse<ExchangeRatesResponse>> {
  try {
    // Require authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, baseCurrency: 'ILS', error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const [usdRate, eurRate, gbpRate] = await Promise.all([
      fetchRate('USDILS=X'),
      fetchRate('EURILS=X'),
      fetchRate('GBPILS=X'),
    ]);

    // If any rate failed to fetch, return error
    if (usdRate === null || eurRate === null || gbpRate === null) {
      return NextResponse.json(
        {
          success: false,
          baseCurrency: 'ILS',
          error: 'Failed to fetch exchange rates',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      rates: {
        USD: usdRate,
        EUR: eurRate,
        GBP: gbpRate,
        ILS: 1,
      },
      baseCurrency: 'ILS',
    });
  } catch (error) {
    console.error('Exchange rates error:', error);
    return NextResponse.json(
      {
        success: false,
        baseCurrency: 'ILS',
        error: 'Failed to fetch exchange rates',
      },
      { status: 500 }
    );
  }
}
