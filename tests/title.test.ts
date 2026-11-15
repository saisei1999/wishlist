import { describe, expect, it } from 'vitest';
import { condenseTitle, faviconUrl } from '../src/model';

describe('condenseTitle', () => {
  it('drops a shop name stapled to the end', () => {
    expect(condenseTitle('Logitech MX Master 3S | Amazon.com', 'amazon.com')).toBe('Logitech MX Master 3S');
    expect(condenseTitle('AIRism Cotton Tee | UNIQLO', 'uniqlo.com')).toBe('AIRism Cotton Tee');
  });

  it('drops a site name used as a prefix', () => {
    const out = condenseTitle('GitHub - saisei1999/wishlist: A local-first wish list', 'GitHub');
    expect(out.startsWith('saisei1999/wishlist')).toBe(true);
    expect(out).not.toContain('GitHub -');
  });

  it('leaves a short clean title untouched', () => {
    expect(condenseTitle('Espresso tamper, 58.5mm')).toBe('Espresso tamper, 58.5mm');
  });

  it('cuts a long title at a word boundary, never mid-word', () => {
    const long = 'Unisex AIRism Cotton Oversized T-Shirt with a very long descriptive tail indeed';
    const out = condenseTitle(long, 'uniqlo.com');
    expect(out.length).toBeLessThanOrEqual(74);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it('keeps meaning over brevity when the head is too short', () => {
    const out = condenseTitle('Sony WH-1000XM5 Wireless Noise Cancelling Headphones (Black)', undefined);
    // 60 characters: fits inside the two-line clamp without an ellipsis.
    expect(out.length).toBeLessThanOrEqual(74);
    expect(out.startsWith('Sony WH-1000XM5')).toBe(true);
    expect(out.endsWith('…')).toBe(false);
  });

  it('never returns an empty string', () => {
    expect(condenseTitle('   ')).toBe('');
    expect(condenseTitle('X')).toBe('X');
  });
});

describe('faviconUrl', () => {
  it('uses the site itself, not a third-party favicon service', () => {
    expect(faviconUrl('https://www.uniqlo.com/us/en/products/E455359-000/00')).toBe('https://www.uniqlo.com/favicon.ico');
  });

  it('returns null for a missing or broken url', () => {
    expect(faviconUrl(undefined)).toBeNull();
    expect(faviconUrl('not a url')).toBeNull();
  });
});
