import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { scrapeSimilacPrices } from '@/lib/api/price-scraper';

const SIMILAC_GOLD_QUERY = 'סימילק גולד שלב 1';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await scrapeSimilacPrices(SIMILAC_GOLD_QUERY);
    return NextResponse.json({ query: SIMILAC_GOLD_QUERY, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
