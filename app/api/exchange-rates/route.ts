import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { fetchExchangeRates, ExchangeRates } from '@/lib/api/exchange-rates';

export interface ExchangeRatesResponse {
  success: boolean;
  rates?: ExchangeRates;
  baseCurrency: string;
  error?: string;
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

    const rates = await fetchExchangeRates();

    if (!rates) {
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
      rates,
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
