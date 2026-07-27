import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

/**
 * Fetch a URL and return a clean plaintext extraction of its readable
 * article body via Mozilla Readability + jsdom. Falls back to the raw
 * HTML's stripped text when Readability can't detect an article (some
 * pages are all navigation or a single component).
 *
 * Runs server-side only — jsdom pulls in a full DOM.
 */
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB — anything bigger is a page we don't want to summarize

export interface FetchedSource {
  url: string;
  title: string | null;
  text: string;
}

export async function fetchSource(url: string): Promise<FetchedSource> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Pretend to be a mainstream desktop Firefox so servers that
        // whitelist known browsers let us in. Sites behind Cloudflare bot
        // protection still block us — see the challenge-page detector below.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    // Cloudflare returns `cf-mitigated: challenge` when the request was
    // stopped at the JS-challenge layer. We can't solve JS challenges in a
    // Node process — surface a clear error and tell the user to paste text.
    if (res.headers.get('cf-mitigated') === 'challenge' || res.status === 403) {
      throw new Error(
        'This site blocks automated fetches (Cloudflare challenge). Copy the article text and paste it instead.'
      );
    }
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
    // Guard against extractors being handed a non-HTML payload (PDF, image,
    // gzipped feed) — Readability can't parse those.
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType && !/text\/html|xhtml|xml|text\/plain/i.test(contentType)) {
      throw new Error(`Unsupported content-type "${contentType}". Paste the text directly.`);
    }
    const contentLength = Number(res.headers.get('content-length') ?? '0');
    if (contentLength > MAX_HTML_BYTES) {
      throw new Error(`Page too large (${contentLength} bytes)`);
    }
    html = await res.text();
    if (html.length > MAX_HTML_BYTES) {
      throw new Error(`Page too large (${html.length} bytes after decode)`);
    }
    // Second-pass bot-challenge detection: some Cloudflare configs return
    // status 200 with a body that's the "Just a moment…" challenge page.
    if (/cf-browser-verification|__cf_chl_|Just a moment\.\.\./i.test(html.slice(0, 4000))) {
      throw new Error(
        'This site returned a bot-challenge page instead of the article. Paste the text instead.'
      );
    }
  } finally {
    clearTimeout(timer);
  }

  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (article && article.textContent && article.textContent.trim().length > 100) {
    return {
      url,
      title: article.title || null,
      text: article.textContent.trim(),
    };
  }

  // Fallback: strip tags on the body.
  const text = (dom.window.document.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 100) {
    throw new Error(
      'Could not extract readable text from the page (may be JS-rendered or paywalled). Paste the text instead.'
    );
  }
  return { url, title: dom.window.document.title || null, text };
}
