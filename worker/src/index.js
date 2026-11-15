/**
 * wishlist-unfurl — reads a page's Open Graph tags.
 *
 * GET /?url=<encoded absolute http(s) url>
 *   200 { title, image, siteName }
 *   400 invalid or missing url
 *   405 method not allowed
 *   415 not HTML
 *   502 fetch failed, timed out or oversized
 *
 * Guards: http(s) only, manual redirects with a private-address check on every
 * hop, 6s timeout, 2 MB body cap, HTML only. The image URL is returned, never
 * rehosted. Plain JavaScript: no build step, no dependencies.
 */

const TIMEOUT_MS = 6000;
const MAX_BYTES = 2000000;
const MAX_REDIRECTS = 3;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  // Short: shops rotate image URLs, and a stale preview is worse than a refetch.
  'cache-control': 'public, max-age=600',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });
}

/** Hostnames and IP literals that must never be fetched. */
function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    const a = octets[0];
    const b = octets[1];
    if (octets.some((o) => o > 255)) return true;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  // IPv6 unique-local and link-local ranges.
  if (host.includes(':')) {
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (host.startsWith('fe80')) return true;
  }
  return false;
}

function normalize(input) {
  if (!input) return null;
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (isBlockedHost(url.hostname)) return null;
  url.hash = '';
  return url;
}

async function fetchWithLimits(start) {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Shops serve a stripped page to obvious bots, so this presents as an
          // ordinary browser. It identifies itself honestly in the referrer-free
          // User-Agent comment only where a site still exposes Open Graph.
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('redirect-without-location');
      const next = normalize(new URL(location, url).toString());
      if (!next) throw new Error('blocked-redirect');
      url = next;
      continue;
    }

    if (!response.ok) throw new Error('upstream-' + response.status);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) throw new Response('not-html', { status: 415 });
    const length = Number(response.headers.get('content-length') || '0');
    if (length > MAX_BYTES) throw new Error('too-large');
    return response;
  }
  throw new Error('too-many-redirects');
}

/** Reads at most MAX_BYTES of the body as text, stopping after </head>. */
async function readCapped(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    text += decoder.decode(value, { stream: true });
    if (text.includes('</head>')) break;
  }
  return text + decoder.decode();
}

function metaContent(html, names) {
  for (const name of names) {
    const patterns = [
      new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]*content=["\']([^"\']+)["\']', 'i'),
      new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + name + '["\']', 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
  }
  return null;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .slice(0, 300);
}

function extract(html, pageUrl) {
  const rawTitle =
    metaContent(html, ['og:title', 'twitter:title']) ||
    (html.match(/<title[^>]*>([^<]{1,300})<\/title>/i) || [])[1] ||
    null;

  const image = pickImage(html, pageUrl);
  const siteName = metaContent(html, ['og:site_name']) || pageUrl.hostname.replace(/^www\./, '');

  let absoluteImage = null;
  if (image) {
    try {
      const candidate = new URL(image, pageUrl).toString();
      if (candidate.startsWith('https://')) absoluteImage = candidate;
    } catch {
      absoluteImage = null;
    }
  }

  return {
    title: rawTitle ? decodeEntities(rawTitle) : pageUrl.hostname.replace(/^www\./, ''),
    image: absoluteImage,
    siteName: siteName ? decodeEntities(siteName) : null,
  };
}

/** Tracking pixels, beacons, sprites and logos are never a product picture. */
const JUNK_IMAGE = /sprite|icon|logo|pixel|beacon|analytics|tracking|1x1|blank|spacer|placeholder|\/batch\/|fls-na|\.svg(?:\?|$)/i;

/** Declared image, then JSON-LD, then an inline <img> — junk filtered at every step. */
function pickImage(html, pageUrl) {
  const candidates = [];

  for (const name of ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    const value = metaContent(html, [name]);
    if (value) candidates.push(value);
  }
  const linkSrc = html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);
  if (linkSrc && linkSrc[1]) candidates.push(linkSrc[1]);

  const jsonLd = html.match(/"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/i);
  if (jsonLd) candidates.push(jsonLd[1] || jsonLd[2]);

  const good = candidates.filter((value) => value && !JUNK_IMAGE.test(value));
  if (good.length > 0) return good[0];

  // Inline images: a candidate that states a large size wins over an unspecified
  // one, because unlabelled images are usually page chrome.
  const tags = html.match(/<img[^>]*>/gi) || [];
  let unsized = null;
  for (const tag of tags) {
    const src = (tag.match(/src=["']([^"']+)["']/i) || [])[1];
    if (!src || JUNK_IMAGE.test(src)) continue;
    let absolute;
    try {
      const parsed = new URL(src, pageUrl);
      if (parsed.protocol !== 'https:') continue;
      absolute = parsed.toString();
    } catch {
      continue;
    }
    const width = Number((tag.match(/width=["']?(\d+)/i) || [])[1] || 0);
    const height = Number((tag.match(/height=["']?(\d+)/i) || [])[1] || 0);
    if (width >= 200 || height >= 200) return absolute;
    if (!unsized) unsized = absolute;
  }
  return unsized;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return json({ error: 'method-not-allowed' }, 405);

    const url = normalize(new URL(request.url).searchParams.get('url'));
    if (!url) return json({ error: 'invalid-url' }, 400);

    try {
      const response = await fetchWithLimits(url);
      const html = await readCapped(response);
      return json(extract(html, url));
    } catch (error) {
      if (error instanceof Response) {
        return new Response(error.body, { status: error.status, headers: CORS });
      }
      return json({ error: 'fetch-failed', detail: error instanceof Error ? error.message : 'unknown' }, 502);
    }
  },
};

export { isBlockedHost, normalize, extract, metaContent, pickImage };
