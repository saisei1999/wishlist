/** Client side of the unfurl proxy. Everything here treats the response as untrusted. */

import { isHttpUrl } from './model';

export type UnfurlResult = {
  title: string | null;
  image: string | null;
  siteName: string | null;
};

export type UnfurlOutcome =
  | { ok: true; result: UnfurlResult }
  | { ok: false; reason: 'no-proxy' | 'invalid-url' | 'failed' };

export function proxyReady(proxyUrl: string): boolean {
  if (!proxyUrl.trim()) return false;
  try {
    return new URL(proxyUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Only absolute https image URLs are kept; anything else becomes null. */
export function safeImage(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function safeText(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function unfurl(proxyUrl: string, target: string, signal?: AbortSignal): Promise<UnfurlOutcome> {
  if (!isHttpUrl(target)) return { ok: false, reason: 'invalid-url' };
  if (!proxyReady(proxyUrl)) return { ok: false, reason: 'no-proxy' };

  try {
    const endpoint = new URL(proxyUrl);
    endpoint.searchParams.set('url', target.trim());
    const response = await fetch(endpoint.toString(), {
      signal: signal ?? AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return { ok: false, reason: 'failed' };
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'failed' };
    const data = payload as Record<string, unknown>;
    return {
      ok: true,
      result: {
        title: safeText(data.title),
        image: safeImage(data.image),
        siteName: safeText(data.siteName, 80),
      },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** The bookmarklet: opens the app with the current tab's URL queued for capture. */
export function bookmarkletHref(appUrl: string): string {
  const base = appUrl.replace(/[?#].*$/, '');
  return `javascript:(()=>{window.open('${base}?capture='+encodeURIComponent(location.href),'_blank','noopener')})()`;
}

/** Reads `?capture=` / `?shared=` off the address bar and clears it from history. */
export function takeCaptureParam(): string | null {
  const params = new URLSearchParams(location.search);
  const value = params.get('capture') ?? params.get('url');
  if (!value) return null;
  params.delete('capture');
  params.delete('url');
  const query = params.toString();
  const clean = `${location.pathname}${query ? `?${query}` : ''}`;
  history.replaceState(null, '', clean);
  return isHttpUrl(value) ? value : null;
}
