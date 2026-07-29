/**
 * Fetch a URL and return a plaintext extraction. Zero heavy deps — we used
 * jsdom + Readability originally but jsdom's html-encoding-sniffer pulls in
 * @exodus/bytes which is ESM-only; Vercel's serverless bundler can't
 * `require()` an ESM package and the whole module load fails
 * (`Error [ERR_REQUIRE_ESM]: require() of ES Module … not supported`).
 *
 * A regex extractor is imperfect (JS-rendered SPAs, weird escaping, RTL
 * scripts) but the LLM is the actual summarizer downstream — it just needs
 * approximately-the-article-body as input. Missed sidebar text or extra
 * whitespace doesn't hurt Haiku's summary in practice.
 *
 * Runs server-side only. Fails fast with a paste-instead message on:
 *   - Cloudflare / bot challenges (403 or `cf-mitigated: challenge` header).
 *   - Non-HTML content types.
 *   - Extracted text < 100 chars (JS-rendered or paywalled).
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;

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
        // Pretend to be a mainstream desktop Firefox so servers that
        // whitelist known browsers let us in. CF's JS challenge still blocks
        // us; the header + body checks below surface a clear error in that
        // case.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    if (res.headers.get('cf-mitigated') === 'challenge' || res.status === 403) {
      throw new Error(
        'This site blocks automated fetches (Cloudflare challenge). Copy the article text and paste it instead.'
      );
    }
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
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
    if (/cf-browser-verification|__cf_chl_|Just a moment\.\.\./i.test(html.slice(0, 4000))) {
      throw new Error(
        'This site returned a bot-challenge page instead of the article. Paste the text instead.'
      );
    }
  } finally {
    clearTimeout(timer);
  }

  const title = extractTitle(html);
  const text = extractText(html);
  if (text.length < 100) {
    throw new Error(
      'Could not extract readable text from the page (may be JS-rendered or paywalled). Paste the text instead.'
    );
  }
  return { url, title, text };
}

/** Grab the <title> tag's inner text, decode common entities. */
function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return decodeEntities(m[1].trim()) || null;
}

/**
 * Strip scripts/styles/nav-chrome and turn the remaining HTML into plain
 * text. Not a DOM parse — a series of regex passes — so unusual markup can
 * bleed through, but for a summary-in / summary-out pipeline that's fine.
 */
function extractText(html: string): string {
  let s = html;
  // Kill everything that is definitely not article body text. Order matters:
  // remove the whole tag+content for these, not just the tags.
  s = s.replace(
    /<(script|style|noscript|template|iframe|svg|form|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ' '
  );
  // Prefer the <main> or <article> region if present — most sites wrap the
  // article body in one of those.
  const main =
    s.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    s.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    s.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    s;
  s = main;
  // Preserve paragraph structure: newline for block-level closers, space
  // for everything else.
  s = s.replace(/<\/(p|div|section|li|h[1-6]|br)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  // Collapse runs of whitespace but keep single newlines so the model sees
  // paragraph breaks.
  s = s
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
  return s;
}

/** Decode the handful of entities that show up in article HTML. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
}
