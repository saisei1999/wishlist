import { describe, expect, it } from 'vitest';
import { titleFromUrl } from '../src/model';

describe('titleFromUrl', () => {
  it('reads an ASIN listing as host plus code, not a sprawled URL', () => {
    expect(titleFromUrl('https://www.amazon.com/dp/B0F2PYB1GJ')).toBe('amazon.com · B0F2PYB1GJ');
  });

  it('uses a slug when there is one', () => {
    expect(titleFromUrl('https://www.uniqlo.com/us/en/products/E455359-000/00')).toBe('uniqlo.com · E455359 000');
    expect(titleFromUrl('https://shop.example.com/cat/desk-lamp-pro')).toBe('shop.example.com · desk lamp pro');
  });

  it('falls back to the host, then to a placeholder', () => {
    expect(titleFromUrl('https://example.com/')).toBe('example.com');
    expect(titleFromUrl(undefined)).toBe('Untitled want');
    expect(titleFromUrl('not a url')).toBe('Untitled want');
  });
});
