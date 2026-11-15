import { describe, expect, it } from 'vitest';
import { itemBrandSpan } from '../src/model';

describe('itemBrandSpan', () => {
  it('picks the maker and model out of a product title', () => {
    expect(itemBrandSpan('Shure MV7X XLR Podcast Microphone')).toEqual({
      brand: 'Shure MV7X',
      rest: 'XLR Podcast Microphone',
    });
    expect(itemBrandSpan('Sony WH-1000XM5 Wireless Noise Cancelling Headphones')).toEqual({
      brand: 'Sony WH-1000XM5',
      rest: 'Wireless Noise Cancelling Headphones',
    });
  });

  it('splits on a brand typed in the editor, even without a model code', () => {
    expect(itemBrandSpan('MV7X XLR podcast microphone', 'Shure')).toEqual({
      brand: 'Shure',
      rest: 'MV7X XLR podcast microphone',
    });
    expect(itemBrandSpan('Shure MV7X XLR Podcast Microphone', 'Shure')).toEqual({
      brand: 'Shure',
      rest: 'MV7X XLR Podcast Microphone',
    });
  });

  it('refuses to guess when there is no model code', () => {
    expect(itemBrandSpan('Unisex AIRism Cotton Oversized T-Shirt')).toBeNull();
    expect(itemBrandSpan('Hand-thrown mug')).toBeNull();
    expect(itemBrandSpan('')).toBeNull();
  });

  it('leads with a brand you typed, even when the title omits it', () => {
    // Common on Amazon: the page title is generic, so the maker has to come from you.
    expect(itemBrandSpan('XLR Podcast Microphone', 'Shure')).toEqual({
      brand: 'Shure',
      rest: 'XLR Podcast Microphone',
    });
    // It also never silently overrides a title that names a different maker.
    expect(itemBrandSpan('Soundcore Anker P20i Earbuds', 'Shure')).toEqual({
      brand: 'Shure',
      rest: 'Soundcore Anker P20i Earbuds',
    });
  });
});
