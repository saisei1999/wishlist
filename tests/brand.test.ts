import { describe, expect, it } from 'vitest';
import { brandName } from '../src/model';

describe('brandName', () => {
  it('uses what the page calls itself, minus the domain tail', () => {
    expect(brandName({ siteName: 'amazon.com', url: 'https://www.amazon.com/dp/B07FZ8S74R' })).toBe('Amazon');
    expect(brandName({ siteName: 'UNIQLO', url: 'https://www.uniqlo.com/x' })).toBe('UNIQLO');
    expect(brandName({ siteName: 'GitHub', url: 'https://github.com/a/b' })).toBe('GitHub');
  });

  it('falls back to the site host when the page says nothing', () => {
    expect(brandName({ url: 'https://www.etsy.com/listing/1' })).toBe('Etsy');
    expect(brandName({ url: 'https://store.steampowered.com/app/1' })).toBe('Store');
  });

  it('returns null without a link, so nothing is invented', () => {
    expect(brandName({})).toBeNull();
    expect(brandName({ siteName: '   ' })).toBeNull();
    expect(brandName({ url: 'not a url' })).toBeNull();
  });
});
