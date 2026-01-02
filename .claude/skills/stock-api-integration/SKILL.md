---
name: stock-api-integration
description: Implement and debug stock price fetching from Alpha Vantage or Yahoo Finance. Use when working with stock prices, API integrations, caching strategies, or the update-stock-prices cron job.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# Stock Price API Integration for Hub AI

Guide for external stock price APIs with proper caching and error handling.

## Architecture

```
Cron Job (every 6 hours)
    ↓
/api/cron/update-stock-prices
    ↓
Alpha Vantage / Yahoo Finance API
    ↓
stock_price_history table (cache)
    ↓
Portfolio value calculation
```

## Key Files

- `/app/api/cron/update-stock-prices/route.ts` - Cron endpoint
- `/lib/api/stock-prices.ts` - API integration
- `ALPHA_VANTAGE_API_KEY` in `.env.local`

## Caching Strategy

- Stock prices cached for **6 hours**
- Store in `stock_price_history` table
- Check cache before API call
- Don't over-fetch (API rate limits)

## API Integration Pattern

```typescript
async function fetchStockPrice(symbol: string): Promise<Decimal> {
  // 1. Check cache first
  const cached = await getCachedPrice(symbol);
  if (cached && !isStale(cached.updatedAt, 6 * 60 * 60 * 1000)) {
    return cached.price;
  }

  // 2. Fetch from API
  const price = await callExternalAPI(symbol);

  // 3. Update cache
  await updatePriceCache(symbol, price);

  return price;
}
```

## Error Handling

- Handle rate limits (429 errors)
- Graceful degradation (use cached price if API fails)
- Log all API calls for debugging
- Handle invalid symbols
- Handle market closed scenarios

## Environment Variables

```env
ALPHA_VANTAGE_API_KEY=your_key_here
```

## Testing

- Mock external APIs in tests
- Test rate limit handling
- Test cache invalidation
- Test with invalid symbols
