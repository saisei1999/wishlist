import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeBackup, parseBackup, putItem, listItems, replaceAll, getSettings, saveSettings } from '../src/storage';
import type { Collection, Item } from '../src/model';

function item(over: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    title: 'Desk lamp',
    tags: ['home'],
    collectionIds: [],
    tier: 'soon',
    order: 0,
    status: 'open',
    color: 'blue',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const collection: Collection = { id: 'c1', name: 'Birthday', createdAt: '2026-01-01T00:00:00.000Z' };

beforeEach(async () => {
  await replaceAll([], []);
});

describe('backup round trip', () => {
  it('restores exactly what was exported', () => {
    const items = [item(), item({ id: 'i2', title: 'Kettle', tier: 'next', order: 3, price: 40 })];
    const parsed = parseBackup(makeBackup(items, [collection]));
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[1]?.price).toBe(40);
    expect(parsed.collections[0]?.name).toBe('Birthday');
  });
});

describe('validation refuses bad files', () => {
  const bad = (payload: unknown) => () => parseBackup(JSON.stringify(payload));
  const base = () => ({ format: 'wishlist', version: 1, items: [item()], collections: [] });

  it('rejects a foreign file', () => {
    expect(bad({ format: 'stillroom', version: 1, items: [] })).toThrow(/wishlist/);
  });

  it('rejects an unknown version', () => {
    expect(bad({ ...base(), version: 2 })).toThrow(/version/);
  });

  it('rejects a duplicate id', () => {
    expect(bad({ ...base(), items: [item(), item()] })).toThrow(/Duplicate/);
  });

  it('rejects a bad tier or status', () => {
    expect(bad({ ...base(), items: [item({ tier: 'urgent' as never })] })).toThrow(/tier/);
    expect(bad({ ...base(), items: [item({ status: 'maybe' as never })] })).toThrow(/status/);
  });

  it('rejects a negative price and a non-http url', () => {
    expect(bad({ ...base(), items: [item({ price: -5 })] })).toThrow(/price/);
    expect(bad({ ...base(), items: [item({ url: 'javascript:alert(1)' })] })).toThrow(/url/);
  });

  it('rejects malformed JSON without touching storage', () => {
    expect(() => parseBackup('{oops')).toThrow(/JSON/);
  });
});

describe('writes', () => {
  it('persists an item and reads it back', async () => {
    await putItem(item());
    const all = await listItems();
    expect(all.map((i) => i.title)).toEqual(['Desk lamp']);
  });

  it('replaces the whole library in one transaction', async () => {
    await putItem(item());
    await replaceAll([item({ id: 'x', title: 'New' })], []);
    const all = await listItems();
    expect(all).toHaveLength(1);
    expect(all[0]?.title).toBe('New');
  });

  it('round-trips settings with defaults', async () => {
    expect(await getSettings()).toEqual({ proxyUrl: '' });
    await saveSettings({ proxyUrl: 'https://example.workers.dev' });
    expect((await getSettings()).proxyUrl).toBe('https://example.workers.dev');
  });
});
