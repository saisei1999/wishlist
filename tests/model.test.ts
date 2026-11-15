import { describe, expect, it } from 'vitest';
import {
  byTierAndOrder,
  formatUsd,
  monogram,
  newId,
  nextBuy,
  nextOrder,
  normalizedTags,
  nudge,
  openItems,
  pruneCandidates,
  reorderBefore,
  tagIndex,
  targetDelta,
  type Item,
} from '../src/model';

function item(over: Partial<Item> = {}): Item {
  return {
    id: over.id ?? newId(),
    title: over.title ?? 'Thing',
    tags: [],
    collectionIds: [],
    tier: 'soon',
    order: 0,
    status: 'open',
    color: 'slate',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('priority', () => {
  it('picks exactly one next buy: the lowest order in the next tier', () => {
    const items = [
      item({ id: 'a', tier: 'next', order: 2 }),
      item({ id: 'b', tier: 'next', order: 1 }),
      item({ id: 'c', tier: 'soon', order: 0 }),
    ];
    expect(nextBuy(items)?.id).toBe('b');
  });

  it('ignores purchased and dropped items when choosing next buy', () => {
    const items = [item({ id: 'a', tier: 'next', order: 0, status: 'purchased' })];
    expect(nextBuy(items)).toBeNull();
  });

  it('orders by tier before manual order', () => {
    const items = [item({ id: 'a', tier: 'someday', order: 0 }), item({ id: 'b', tier: 'next', order: 9 })];
    expect(items.sort(byTierAndOrder).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('places a new item at the end of its tier', () => {
    const items = [item({ tier: 'soon', order: 0 }), item({ tier: 'soon', order: 4 })];
    expect(nextOrder(items, 'soon')).toBe(5);
    expect(nextOrder(items, 'next')).toBe(0);
  });

  it('reorders before a target and renumbers the tier without mutating input', () => {
    const items = [
      item({ id: 'a', tier: 'soon', order: 0 }),
      item({ id: 'b', tier: 'soon', order: 1 }),
      item({ id: 'c', tier: 'soon', order: 2 }),
    ];
    const moved = reorderBefore(items, 'c', 'a');
    expect(moved.filter((i) => i.tier === 'soon').sort(byTierAndOrder).map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('refuses to reorder across tiers', () => {
    const items = [item({ id: 'a', tier: 'soon' }), item({ id: 'b', tier: 'next' })];
    expect(reorderBefore(items, 'a', 'b')).toBe(items);
  });

  it('nudges one slot and stops at the edges', () => {
    const items = [
      item({ id: 'a', tier: 'soon', order: 0 }),
      item({ id: 'b', tier: 'soon', order: 1 }),
    ];
    expect(nudge(items, 'b', -1).sort(byTierAndOrder).map((i) => i.id)).toEqual(['b', 'a']);
    expect(nudge(items, 'a', -1)).toBe(items);
    expect(nudge(items, 'b', 1)).toBe(items);
  });
});

describe('money', () => {
  it('formats USD and hides a missing price instead of showing zero', () => {
    expect(formatUsd(32)).toBe('$32');
    expect(formatUsd(32.5)).toBe('$32.50');
    expect(formatUsd(undefined)).toBeNull();
    expect(formatUsd(Number.NaN)).toBeNull();
  });

  it('reports the delta to target, and says "at target" when reached', () => {
    expect(targetDelta(item({ price: 32, targetPrice: 25 }))).toEqual({
      amount: 7,
      label: '$7 over target',
      atOrBelow: false,
    });
    expect(targetDelta(item({ price: 25, targetPrice: 25 }))?.label).toBe('at target');
    expect(targetDelta(item({ price: 25 }))).toBeNull();
    expect(targetDelta(item({ targetPrice: 25 }))).toBeNull();
  });
});

describe('lifecycle', () => {
  it('keeps only open items in the gallery set', () => {
    const items = [item({ status: 'open' }), item({ status: 'purchased' }), item({ status: 'dropped' })];
    expect(openItems(items)).toHaveLength(1);
  });

  it('flags open items untouched for more than 90 days, oldest first', () => {
    const now = Date.parse('2026-06-01T00:00:00.000Z');
    const items = [
      item({ id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'fresh', updatedAt: '2026-05-20T00:00:00.000Z' }),
      item({ id: 'bought', status: 'purchased', updatedAt: '2025-01-01T00:00:00.000Z' }),
    ];
    expect(pruneCandidates(items, now).map((i) => i.id)).toEqual(['old']);
  });

  it('does not flag an item edited inside the window', () => {
    const now = Date.parse('2026-06-01T00:00:00.000Z');
    const items = [item({ updatedAt: '2026-04-01T00:00:00.000Z' })];
    expect(pruneCandidates(items, now)).toHaveLength(0);
  });
});

describe('tags and text', () => {
  it('dedupes tags case-insensitively, keeping the first spelling', () => {
    expect(normalizedTags('Coffee, coffee , ,Kitchen')).toEqual(['Coffee', 'Kitchen']);
  });

  it('orders tags by use count then alphabetically', () => {
    const items = [
      item({ tags: ['a', 'b'] }),
      item({ tags: ['b'] }),
      item({ tags: ['c'] }),
    ];
    expect(tagIndex(items)).toEqual(['b', 'a', 'c']);
  });

  it('builds a two-letter monogram for the fallback plate', () => {
    expect(monogram('Hollow Knight')).toBe('HK');
    expect(monogram('Lamp')).toBe('L');
    expect(monogram('   ')).toBe('?');
  });
});
