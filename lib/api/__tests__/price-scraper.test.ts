// Mock global fetch before importing the module under test
const mockFetch = jest.fn();
global.fetch = mockFetch;

// cheerio is used server-side only; no mocking required — it runs in node env
import { scrapeSimilacPrices } from '../price-scraper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHtmlResponse(html: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name === 'content-type' ? 'text/html; charset=utf-8' : null) },
    text: async () => html,
    json: async () => {
      throw new Error('Response is HTML, not JSON');
    },
  };
}

function makeJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => { throw new Error('HTTP error'); },
    text: async () => '',
  };
}

// ---------------------------------------------------------------------------
// Baseline structural tests
// ---------------------------------------------------------------------------

describe('scrapeSimilacPrices', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('return value structure', () => {
    it('should always return exactly three results (one per store)', async () => {
      // All three fetches fail with HTTP errors so every scraper hits its error path
      mockFetch.mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('test query');

      expect(results).toHaveLength(3);
    });

    it('should include Rami Levi, Shufersal, and SuperPharm stores', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('סימילק');
      const stores = results.map((r) => r.store);

      expect(stores).toContain('רמי לוי');
      expect(stores).toContain('שופרסל');
      expect(stores).toContain('סופר-פארם');
    });

    it('should return ProductPrice objects with required fields', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(404));

      const results = await scrapeSimilacPrices('test');

      for (const result of results) {
        expect(result).toHaveProperty('store');
        expect(result).toHaveProperty('productName');
        expect(result).toHaveProperty('price');
        expect(result).toHaveProperty('currency');
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('scrapedAt');
        expect(result.currency).toBe('ILS');
        expect(result.scrapedAt).toBeInstanceOf(Date);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Rami Levi (JSON API)
  // ---------------------------------------------------------------------------

  describe('Rami Levi scraper', () => {
    it('should parse price from Rami Levi JSON API response', async () => {
      const ramiLeviBody = {
        data: {
          items: [
            { name: 'סימילק גולד שלב 1 800 גרם', price: 89.9, barcode: '123456' },
          ],
        },
      };

      // Call 1: Rami Levi JSON API
      // Call 2 & 3: Shufersal candidates + SuperPharm — return errors to keep them simple
      mockFetch
        .mockResolvedValueOnce(makeJsonResponse(ramiLeviBody))  // Rami Levi API
        .mockResolvedValue(makeErrorResponse(503));              // Shufersal + SuperPharm

      const results = await scrapeSimilacPrices('סימילק גולד שלב 1');
      const ramiLevi = results.find((r) => r.store === 'רמי לוי');

      expect(ramiLevi).toBeDefined();
      expect(ramiLevi!.price).toBe(89.9);
      expect(ramiLevi!.productName).toBe('סימילק גולד שלב 1 800 גרם');
      expect(ramiLevi!.error).toBeUndefined();
    });

    it('should use items at root level as fallback when data.items is missing', async () => {
      const ramiLeviBody = {
        items: [{ name: 'סימילק', price: 79.5 }],
      };

      mockFetch
        .mockResolvedValueOnce(makeJsonResponse(ramiLeviBody))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('סימילק');
      const ramiLevi = results.find((r) => r.store === 'רמי לוי');

      expect(ramiLevi!.price).toBe(79.5);
    });

    it('should return null price and error message when no items found', async () => {
      const emptyBody = { data: { items: [] } };

      mockFetch
        .mockResolvedValueOnce(makeJsonResponse(emptyBody))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('סימילק');
      const ramiLevi = results.find((r) => r.store === 'רמי לוי');

      expect(ramiLevi!.price).toBeNull();
      expect(ramiLevi!.error).toBe('מוצר לא נמצא');
    });

    it('should pick the best-matching item when multiple results are returned', async () => {
      const body = {
        data: {
          items: [
            { name: 'סימילק ספיישל', price: 60.0 },
            { name: 'סימילק גולד שלב 1', price: 89.9 },
            { name: 'מוצר אחר', price: 20.0 },
          ],
        },
      };

      mockFetch
        .mockResolvedValueOnce(makeJsonResponse(body))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('סימילק גולד שלב 1');
      const ramiLevi = results.find((r) => r.store === 'רמי לוי');

      // Should pick the item that contains ALL query words
      expect(ramiLevi!.price).toBe(89.9);
      expect(ramiLevi!.productName).toBe('סימילק גולד שלב 1');
    });

    it('should handle HTTP error from Rami Levi API', async () => {
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(500))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('test');
      const ramiLevi = results.find((r) => r.store === 'רמי לוי');

      expect(ramiLevi!.price).toBeNull();
      expect(ramiLevi!.error).toBe('HTTP 500');
    });

    it('should handle network error from Rami Levi fetch', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('test');
      const ramiLevi = results.find((r) => r.store === 'רמי לוי');

      expect(ramiLevi!.price).toBeNull();
      expect(ramiLevi!.error).toBe('Network failure');
    });

    it('should handle non-Error thrown values', async () => {
      mockFetch
        .mockRejectedValueOnce('string error')
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('test');
      const ramiLevi = results.find((r) => r.store === 'רמי לוי');

      expect(ramiLevi!.price).toBeNull();
      expect(ramiLevi!.error).toBe('string error');
    });

    it('should include the search page URL in the result', async () => {
      mockFetch
        .mockResolvedValueOnce(makeJsonResponse({ data: { items: [] } }))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('סימילק גולד');
      const ramiLevi = results.find((r) => r.store === 'רמי לוי');

      expect(ramiLevi!.url).toContain('rami-levy.co.il');
      expect(ramiLevi!.url).toContain(encodeURIComponent('סימילק גולד'));
    });
  });

  // ---------------------------------------------------------------------------
  // Shufersal (JSON + HTML fallback)
  // ---------------------------------------------------------------------------

  describe('Shufersal scraper', () => {
    it('should parse price from Shufersal JSON API response', async () => {
      const shufersalBody = {
        results: [{ name: 'סימילק גולד 800', price: 94.9 }],
      };

      // Rami Levi errors out, Shufersal JSON candidate succeeds, SuperPharm errors
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))           // Rami Levi
        .mockResolvedValueOnce(makeJsonResponse(shufersalBody))  // Shufersal first candidate
        .mockResolvedValue(makeErrorResponse(503));               // SuperPharm

      const results = await scrapeSimilacPrices('סימילק');
      const shufersal = results.find((r) => r.store === 'שופרסל');

      expect(shufersal!.price).toBe(94.9);
      expect(shufersal!.productName).toBe('סימילק גולד 800');
    });

    it('should fall through to HTML parsing when Shufersal JSON candidates fail', async () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {"@type":"Product","name":"סימילק גולד","offers":{"price":"92.50","priceCurrency":"ILS"}}
            </script>
          </head>
          <body></body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))    // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))    // Shufersal candidate 1
        .mockResolvedValueOnce(makeErrorResponse(503))    // Shufersal candidate 2
        .mockResolvedValueOnce(makeHtmlResponse(html))    // Shufersal HTML fallback
        .mockResolvedValue(makeErrorResponse(503));        // SuperPharm

      const results = await scrapeSimilacPrices('סימילק');
      const shufersal = results.find((r) => r.store === 'שופרסל');

      expect(shufersal!.price).toBe(92.5);
      expect(shufersal!.productName).toBe('סימילק גולד');
      expect(shufersal!.error).toBeUndefined();
    });

    it('should return null price with JS-render error when no price found in HTML', async () => {
      const html = '<html><body><div class="product">No price here</div></body></html>';

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))  // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))  // Shufersal candidate 1
        .mockResolvedValueOnce(makeErrorResponse(503))  // Shufersal candidate 2
        .mockResolvedValueOnce(makeHtmlResponse(html))  // Shufersal HTML fallback
        .mockResolvedValue(makeErrorResponse(503));      // SuperPharm

      const results = await scrapeSimilacPrices('test');
      const shufersal = results.find((r) => r.store === 'שופרסל');

      expect(shufersal!.price).toBeNull();
      expect(shufersal!.error).toContain('JavaScript');
    });

    it('should handle HTTP error from Shufersal HTML fallback', async () => {
      // Execution order due to Promise.all interleaving:
      // call 1: Rami Levi, call 2: Shufersal cand 1, call 3: SuperPharm,
      // call 4: Shufersal cand 2, call 5: Shufersal HTML fallback
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))  // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))  // Shufersal candidate 1
        .mockResolvedValueOnce(makeErrorResponse(503))  // SuperPharm
        .mockResolvedValueOnce(makeErrorResponse(503))  // Shufersal candidate 2
        .mockResolvedValueOnce(makeErrorResponse(404)); // Shufersal HTML fallback

      const results = await scrapeSimilacPrices('test');
      const shufersal = results.find((r) => r.store === 'שופרסל');

      expect(shufersal!.price).toBeNull();
      expect(shufersal!.error).toBe('HTTP 404');
    });

    it('should parse Shufersal __NEXT_DATA__ embedded JSON', async () => {
      const nextData = JSON.stringify({
        props: {
          pageProps: {
            searchResult: {
              products: [{ name: 'סימילק', price: 91.0 }],
            },
          },
        },
      });
      const html = `
        <html>
          <body>
            <script id="__NEXT_DATA__" type="application/json">${nextData}</script>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))  // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))  // Shufersal candidate 1
        .mockResolvedValueOnce(makeErrorResponse(503))  // Shufersal candidate 2
        .mockResolvedValueOnce(makeHtmlResponse(html))  // Shufersal HTML fallback
        .mockResolvedValue(makeErrorResponse(503));      // SuperPharm

      const results = await scrapeSimilacPrices('סימילק');
      const shufersal = results.find((r) => r.store === 'שופרסל');

      expect(shufersal!.price).toBe(91.0);
    });

    it('should parse Shufersal products with brandName when name is absent', async () => {
      const body = {
        results: [{ brandName: 'Similac', price: 95.0 }],
      };

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))
        .mockResolvedValueOnce(makeJsonResponse(body))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('Similac');
      const shufersal = results.find((r) => r.store === 'שופרסל');

      expect(shufersal!.price).toBe(95.0);
      expect(shufersal!.productName).toBe('Similac');
    });
  });

  // ---------------------------------------------------------------------------
  // SuperPharm (HTML with JSON-LD fallback)
  // ---------------------------------------------------------------------------

  describe('SuperPharm scraper', () => {
    // Execution order due to Promise.all interleaving:
    // call 1: Rami Levi
    // call 2: Shufersal candidate 1
    // call 3: SuperPharm  ← SuperPharm fires its first (and only) fetch here
    // call 4: Shufersal candidate 2
    // call 5: Shufersal HTML fallback (if both candidates fail)

    it('should parse price from SuperPharm JSON-LD Product schema', async () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {"@type":"Product","name":"סימילק גולד 800","offers":{"price":"98.00"}}
            </script>
          </head>
          <body></body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))   // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 1
        .mockResolvedValueOnce(makeHtmlResponse(html))   // SuperPharm
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 2
        .mockResolvedValueOnce(makeErrorResponse(503));  // Shufersal HTML fallback

      const results = await scrapeSimilacPrices('סימילק');
      const superPharm = results.find((r) => r.store === 'סופר-פארם');

      expect(superPharm!.price).toBe(98.0);
      expect(superPharm!.productName).toBe('סימילק גולד 800');
      expect(superPharm!.error).toBeUndefined();
    });

    it('should parse price from SuperPharm JSON-LD with array offers', async () => {
      const html = `
        <html>
          <head>
            <script type="application/ld+json">
              {"@type":"Product","name":"סימילק","offers":[{"price":"97.50"},{"price":"99.00"}]}
            </script>
          </head>
          <body></body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))   // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 1
        .mockResolvedValueOnce(makeHtmlResponse(html))   // SuperPharm
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 2
        .mockResolvedValueOnce(makeErrorResponse(503));  // Shufersal HTML fallback

      const results = await scrapeSimilacPrices('סימילק');
      const superPharm = results.find((r) => r.store === 'סופר-פארם');

      // Should use the first offer price
      expect(superPharm!.price).toBe(97.5);
    });

    it('should fall back to CSS selectors when JSON-LD has no price', async () => {
      const html = `
        <html>
          <body>
            <span data-price="88.90" class="product-price">88.90</span>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))   // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 1
        .mockResolvedValueOnce(makeHtmlResponse(html))   // SuperPharm
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 2
        .mockResolvedValueOnce(makeErrorResponse(503));  // Shufersal HTML fallback

      const results = await scrapeSimilacPrices('test');
      const superPharm = results.find((r) => r.store === 'סופר-פארם');

      expect(superPharm!.price).toBe(88.9);
    });

    it('should return null price with JS-render error when no price found', async () => {
      const html = '<html><body><p>No product data here</p></body></html>';

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))   // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 1
        .mockResolvedValueOnce(makeHtmlResponse(html))   // SuperPharm
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 2
        .mockResolvedValueOnce(makeErrorResponse(503));  // Shufersal HTML fallback

      const results = await scrapeSimilacPrices('test');
      const superPharm = results.find((r) => r.store === 'סופר-פארם');

      expect(superPharm!.price).toBeNull();
      expect(superPharm!.error).toContain('JavaScript');
    });

    it('should handle HTTP error from SuperPharm', async () => {
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))   // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 1
        .mockResolvedValueOnce(makeErrorResponse(403))   // SuperPharm
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 2
        .mockResolvedValueOnce(makeErrorResponse(503));  // Shufersal HTML fallback

      const results = await scrapeSimilacPrices('test');
      const superPharm = results.find((r) => r.store === 'סופר-פארם');

      expect(superPharm!.price).toBeNull();
      expect(superPharm!.error).toBe('HTTP 403');
    });

    it('should handle network error from SuperPharm', async () => {
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))          // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))          // Shufersal candidate 1
        .mockRejectedValueOnce(new TypeError('fetch failed'))   // SuperPharm
        .mockResolvedValueOnce(makeErrorResponse(503))          // Shufersal candidate 2
        .mockResolvedValueOnce(makeErrorResponse(503));         // Shufersal HTML fallback

      const results = await scrapeSimilacPrices('test');
      const superPharm = results.find((r) => r.store === 'סופר-פארם');

      expect(superPharm!.price).toBeNull();
      expect(superPharm!.error).toBe('fetch failed');
    });

    it('should include the search URL with the query', async () => {
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))   // Rami Levi
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 1
        .mockResolvedValueOnce(makeErrorResponse(503))   // SuperPharm
        .mockResolvedValueOnce(makeErrorResponse(503))   // Shufersal candidate 2
        .mockResolvedValueOnce(makeErrorResponse(503));  // Shufersal HTML fallback

      const results = await scrapeSimilacPrices('סימילק גולד');
      const superPharm = results.find((r) => r.store === 'סופר-פארם');

      expect(superPharm!.url).toContain('super-pharm.co.il');
      expect(superPharm!.url).toContain(encodeURIComponent('סימילק גולד'));
    });
  });

  // ---------------------------------------------------------------------------
  // parsePrice — tested indirectly via Rami Levi price field and HTML parsing
  // ---------------------------------------------------------------------------

  describe('parsePrice (via scraper outputs)', () => {
    it('should treat price 0 as null (consistent with parsePrice rejecting non-positive)', async () => {
      // price > 0 guard in the JSON path mirrors parsePrice's value <= 0 → null behaviour
      const body = { data: { items: [{ name: 'test', price: 0 }] } };

      mockFetch
        .mockResolvedValueOnce(makeJsonResponse(body))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('test');
      const ramiLevi = results.find((r) => r.store === 'רמי לוי');

      expect(ramiLevi!.price).toBeNull();
    });

    it('should handle price parsed from ₪ symbol in HTML', async () => {
      const html = `
        <html>
          <body>
            <span itemprop="price" content="₪89.90">₪89.90</span>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))
        .mockResolvedValueOnce(makeErrorResponse(503))
        .mockResolvedValueOnce(makeErrorResponse(503))
        .mockResolvedValueOnce(makeHtmlResponse(html))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('test');
      const shufersal = results.find((r) => r.store === 'שופרסל');

      expect(shufersal!.price).toBe(89.9);
    });

    it('should handle comma-separated price (European format) in HTML', async () => {
      const html = `
        <html>
          <body>
            <span itemprop="price" content="89,90">89,90</span>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(503))
        .mockResolvedValueOnce(makeErrorResponse(503))
        .mockResolvedValueOnce(makeErrorResponse(503))
        .mockResolvedValueOnce(makeHtmlResponse(html))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('test');
      const shufersal = results.find((r) => r.store === 'שופרסל');

      expect(shufersal!.price).toBe(89.9);
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrency — all three scrapers run in parallel
  // ---------------------------------------------------------------------------

  describe('parallel execution', () => {
    it('should resolve even when all three scrapers fail independently', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(500));

      const results = await scrapeSimilacPrices('test');

      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(r.price).toBeNull();
        expect(r.error).toBeDefined();
      }
    });

    it('should resolve with mixed success/failure', async () => {
      const ramiLeviBody = { data: { items: [{ name: 'מוצר', price: 89.9 }] } };

      // Rami Levi succeeds, everything else fails
      mockFetch
        .mockResolvedValueOnce(makeJsonResponse(ramiLeviBody))
        .mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('מוצר');

      const ramiLevi = results.find((r) => r.store === 'רמי לוי');
      const shufersal = results.find((r) => r.store === 'שופרסל');
      const superPharm = results.find((r) => r.store === 'סופר-פארם');

      expect(ramiLevi!.price).toBe(89.9);
      expect(shufersal!.price).toBeNull();
      expect(superPharm!.price).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // ProductPrice interface contract
  // ---------------------------------------------------------------------------

  describe('ProductPrice type contract', () => {
    it('should set scrapedAt to a recent Date', async () => {
      const before = Date.now();
      mockFetch.mockResolvedValue(makeErrorResponse(503));

      const results = await scrapeSimilacPrices('test');
      const after = Date.now();

      for (const r of results) {
        const ts = r.scrapedAt.getTime();
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
      }
    });

    it('should always set currency to ILS', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(503));
      const results = await scrapeSimilacPrices('test');
      expect(results.every((r) => r.currency === 'ILS')).toBe(true);
    });

    it('price field should be a number or null, never undefined', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(503));
      const results = await scrapeSimilacPrices('test');

      for (const r of results) {
        expect(r.price === null || typeof r.price === 'number').toBe(true);
      }
    });
  });
});
