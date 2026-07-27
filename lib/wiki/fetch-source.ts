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
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Some publishers block obvious bot user-agents; pretending to be a
        // reader-tool tends to pass through.
        'User-Agent':
          'Mozilla/5.0 (compatible; TheHubWiki/1.0; +https://the-hub-ai-ten.vercel.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
    const contentLength = Number(res.headers.get('content-length') ?? '0');
    if (contentLength > MAX_HTML_BYTES) {
      throw new Error(`Page too large (${contentLength} bytes)`);
    }
    html = await res.text();
    if (html.length > MAX_HTML_BYTES) {
      throw new Error(`Page too large (${html.length} bytes after decode)`);
    }
  } finally {
    clearTimeout(timer);
  }

  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (article && article.textContent && article.textContent.trim().length > 0) {
    return {
      url,
      title: article.title || null,
      text: article.textContent.trim(),
    };
  }

  // Fallback: strip tags on the body.
  const text = (dom.window.document.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { url, title: dom.window.document.title || null, text };
}
