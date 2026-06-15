import * as cheerio from 'cheerio';

export interface ProductPrice {
  store: string;
  productName: string;
  price: number | null;
  currency: string;
  url: string;
  error?: string;
  scrapedAt: Date;
}

// Simulate a real Chrome browser to avoid bot-detection
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// Extract a numeric price. Handles European decimal comma ("89,90" → 89.90)
// but not thousand separators ("1,234" stays as-is to avoid a wrong parse).
export function parsePrice(text: string): number | null {
  if (!text) return null;
  // Replace a decimal comma (comma followed by 1–2 digits at end) with a period
  const normalised = text.replace(/,(\d{1,2})(?!\d)/, '.$1');
  const match = normalised.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return isNaN(value) || value <= 0 ? null : value;
}

// Find the item whose name contains all query words; fall back to first item
function findBestMatch<T extends { name?: string; brandName?: string }>(
  items: T[],
  query: string,
): T {
  const words = query.split(/\s+/);
  return (
    items.find((item) => {
      const haystack = (item.name ?? item.brandName ?? '').toLowerCase();
      return words.every((w) => haystack.includes(w.toLowerCase()));
    }) ?? items[0]
  );
}

async function safeFetch(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(url, {
    headers: { ...BROWSER_HEADERS, ...extraHeaders },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    next: { revalidate: 3600 }, // cache results for 1 hour via Next.js fetch cache
  });
}

// Rami Levi exposes a JSON catalog search API
async function scrapeRamiLevi(query: string): Promise<ProductPrice> {
  const storeUrl = 'https://www.rami-levy.co.il';
  const searchPageUrl = `${storeUrl}/he/search/${encodeURIComponent(query)}`;
  const apiUrl = `${storeUrl}/api/catalog/search?q=${encodeURIComponent(query)}&from=0&size=10`;

  try {
    const response = await safeFetch(apiUrl, {
      Accept: 'application/json, text/plain, */*',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      Referer: storeUrl + '/',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: { items?: Array<{ name?: string; price?: number; barcode?: string }> };
      items?: Array<{ name?: string; price?: number; barcode?: string }>;
    };
    const items = data?.data?.items ?? data?.items ?? [];

    if (!Array.isArray(items) || items.length === 0) {
      return {
        store: 'רמי לוי',
        productName: query,
        price: null,
        currency: 'ILS',
        url: searchPageUrl,
        error: 'מוצר לא נמצא',
        scrapedAt: new Date(),
      };
    }

    const match = findBestMatch(items, query);
    return {
      store: 'רמי לוי',
      productName: match.name ?? query,
      price: typeof match.price === 'number' && match.price > 0 ? match.price : null,
      currency: 'ILS',
      url: searchPageUrl,
      scrapedAt: new Date(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      store: 'רמי לוי',
      productName: query,
      price: null,
      currency: 'ILS',
      url: searchPageUrl,
      error: message,
      scrapedAt: new Date(),
    };
  }
}

// Shufersal — try their JSON-friendly search endpoint, fall back to HTML parsing
async function scrapeShufersal(query: string): Promise<ProductPrice> {
  const storeUrl = 'https://www.shufersal.co.il';
  const searchPageUrl = `${storeUrl}/online/he/search?q=${encodeURIComponent(query)}`;

  // Shufersal has an internal API used by their React frontend
  const apiCandidates = [
    `${storeUrl}/online/he/search?q=${encodeURIComponent(query)}&format=json`,
    `${storeUrl}/online/he/api/search?q=${encodeURIComponent(query)}`,
  ];

  for (const apiUrl of apiCandidates) {
    try {
      const response = await safeFetch(apiUrl, {
        Accept: 'application/json, text/html, */*',
        Referer: storeUrl + '/',
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const data = (await response.json()) as {
          results?: Array<{ name?: string; brandName?: string; price?: number; priceForNonMembers?: number }>;
          products?: Array<{ name?: string; brandName?: string; price?: number; priceForNonMembers?: number }>;
        };
        const results = data?.results ?? data?.products ?? [];
        if (results.length > 0) {
          const item = findBestMatch(results, query);
          const price = item?.price ?? item?.priceForNonMembers ?? null;
          return {
            store: 'שופרסל',
            productName: item?.name ?? item?.brandName ?? query,
            price: price !== null ? Number(price) : null,
            currency: 'ILS',
            url: searchPageUrl,
            scrapedAt: new Date(),
          };
        }
      }

      // HTML response — parse it
      if (contentType.includes('text/html')) {
        const html = await response.text();
        return parseShufersal(html, query, searchPageUrl);
      }
    } catch {
      // try next candidate
    }
  }

  // Last resort: fetch the plain HTML search page
  try {
    const response = await safeFetch(searchPageUrl, {
      Referer: storeUrl + '/',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    return parseShufersal(html, query, searchPageUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      store: 'שופרסל',
      productName: query,
      price: null,
      currency: 'ILS',
      url: searchPageUrl,
      error: message,
      scrapedAt: new Date(),
    };
  }
}

function parseShufersal(html: string, query: string, pageUrl: string): ProductPrice {
  const $ = cheerio.load(html);

  // Try JSON-LD schema markup first
  let price: number | null = null;
  let name = '';

  $('script[type="application/ld+json"]').each((_, el) => {
    if (price !== null) return;
    try {
      const schema = JSON.parse($(el).text()) as {
        offers?: { price?: string | number } | Array<{ price?: string | number }>;
        name?: string;
      };
      const offerPrice = Array.isArray(schema.offers)
        ? schema.offers[0]?.price
        : schema.offers?.price;
      if (offerPrice != null) {
        price = parsePrice(String(offerPrice));
        name = schema.name ?? '';
      }
    } catch {
      // ignore
    }
  });

  if (price === null) {
    // Try __NEXT_DATA__ embedded JSON
    const nextScript = $('#__NEXT_DATA__').text();
    if (nextScript) {
      try {
        const nextData = JSON.parse(nextScript) as {
          props?: { pageProps?: { searchResult?: { products?: Array<{ name?: string; price?: number }> } } };
        };
        const products = nextData?.props?.pageProps?.searchResult?.products ?? [];
        if (products.length > 0) {
          name = products[0].name ?? '';
          price = products[0].price ?? null;
        }
      } catch {
        // ignore
      }
    }
  }

  if (price === null) {
    // Fallback: common CSS selectors Shufersal has used
    const priceSelectors = [
      '[class*="price"][data-price]',
      '[data-price]',
      '[itemprop="price"]',
      '[class*="product-price"]',
      '[class*="priceTag"]',
      '.price',
    ];
    for (const sel of priceSelectors) {
      const el = $(sel).first();
      const raw = el.attr('data-price') ?? el.attr('content') ?? el.text().trim();
      price = parsePrice(raw);
      if (price !== null) break;
    }
  }

  // Extract name regardless of whether price was found
  if (!name) {
    const nameSelectors = ['[itemprop="name"]', '[class*="product-name"]', '[class*="productName"]'];
    for (const sel of nameSelectors) {
      name = $(sel).first().text().trim();
      if (name) break;
    }
  }

  return {
    store: 'שופרסל',
    productName: name || query,
    price,
    currency: 'ILS',
    url: pageUrl,
    error: price === null ? 'המחיר נטען ב-JavaScript — פתח את הדף בדפדפן לצפייה' : undefined,
    scrapedAt: new Date(),
  };
}

// SuperPharm search page
async function scrapeSuperPharm(query: string): Promise<ProductPrice> {
  const storeUrl = 'https://www.super-pharm.co.il';
  const searchUrl = `${storeUrl}/c/search-results?text=${encodeURIComponent(query)}`;

  try {
    const response = await safeFetch(searchUrl, {
      Referer: storeUrl + '/',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return parseSuperPharm(html, query, searchUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      store: 'סופר-פארם',
      productName: query,
      price: null,
      currency: 'ILS',
      url: searchUrl,
      error: message,
      scrapedAt: new Date(),
    };
  }
}

function parseSuperPharm(html: string, query: string, pageUrl: string): ProductPrice {
  const $ = cheerio.load(html);

  // Try JSON-LD first (SuperPharm sometimes includes this)
  let price: number | null = null;
  let name = '';

  $('script[type="application/ld+json"]').each((_, el) => {
    if (price !== null) return;
    try {
      const schema = JSON.parse($(el).text()) as {
        offers?: { price?: string | number } | Array<{ price?: string | number }>;
        name?: string;
        '@type'?: string;
      };
      if (schema['@type'] === 'Product' || schema['@type'] === 'ItemList') {
        const offerPrice = Array.isArray(schema.offers)
          ? schema.offers[0]?.price
          : schema.offers?.price;
        if (offerPrice != null) {
          price = parsePrice(String(offerPrice));
          name = schema.name ?? '';
        }
      }
    } catch {
      // ignore
    }
  });

  if (price === null) {
    // Try embedded window.__INITIAL_STATE__ or similar; cap HTML to avoid ReDoS on adversarial input
    const stateMatch = html
      .slice(0, 200_000)
      .match(/window\.__(?:INITIAL_STATE|STATE|STORE)__\s*=\s*(\{[\s\S]{0,5000}?\});/);
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]) as {
          products?: Array<{ name?: string; price?: number }>;
          search?: { products?: Array<{ name?: string; price?: number }> };
        };
        const products = state?.products ?? state?.search?.products ?? [];
        if (products.length > 0) {
          price = products[0].price ?? null;
          name = products[0].name ?? '';
        }
      } catch {
        // ignore
      }
    }
  }

  if (price === null) {
    const priceSelectors = [
      '[class*="price"]:not([class*="original"]):not([class*="before"]):not([class*="old"])',
      '[data-price]',
      '[itemprop="price"]',
      '.product-price',
    ];
    for (const sel of priceSelectors) {
      const el = $(sel).first();
      const raw = el.attr('data-price') ?? el.attr('content') ?? el.text().trim();
      price = parsePrice(raw);
      if (price !== null) break;
    }
  }

  if (!name) {
    name =
      $('[itemprop="name"]').first().text().trim() ||
      $('[class*="product-name"]').first().text().trim();
  }

  return {
    store: 'סופר-פארם',
    productName: name || query,
    price,
    currency: 'ILS',
    url: pageUrl,
    error: price === null ? 'המחיר נטען ב-JavaScript — פתח את הדף בדפדפן לצפייה' : undefined,
    scrapedAt: new Date(),
  };
}

export async function scrapeSimilacPrices(query: string): Promise<ProductPrice[]> {
  const stores = ['רמי לוי', 'שופרסל', 'סופר-פארם'] as const;
  const settled = await Promise.allSettled([
    scrapeRamiLevi(query),
    scrapeShufersal(query),
    scrapeSuperPharm(query),
  ]);
  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      store: stores[i],
      productName: query,
      price: null,
      currency: 'ILS',
      url: '',
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      scrapedAt: new Date(),
    };
  });
}
