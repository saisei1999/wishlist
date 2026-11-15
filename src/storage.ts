/** IndexedDB persistence, backup envelope and validation. No React. */

import {
  DEFAULT_SETTINGS,
  isColor,
  isHttpUrl,
  isStatus,
  isTier,
  type Collection,
  type Item,
  type Settings,
} from './model';

const DB_NAME = 'wishlist';
const DB_VERSION = 1;
const ITEMS = 'items';
const COLLECTIONS = 'collections';
const META = 'meta';
const SETTINGS_KEY = 'settings';
const MAX_BACKUP_BYTES = 5_000_000;
const MAX_ITEMS = 10_000;

let opening: Promise<IDBDatabase> | undefined;

export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(COLLECTIONS)) db.createObjectStore(COLLECTIONS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open storage'));
    request.onblocked = () => reject(new Error('Storage is blocked by another open tab'));
  });
  return opening;
}

function run<T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error('Storage write failed'));
        tx.onabort = () => reject(tx.error ?? new Error('Storage write aborted'));
      }),
  );
}

export const listItems = () => run<Item[]>(ITEMS, 'readonly', (store) => store.getAll() as IDBRequest<Item[]>);
export const putItem = (item: Item) => run<IDBValidKey>(ITEMS, 'readwrite', (store) => store.put(item));
export const deleteItem = (id: string) => run<undefined>(ITEMS, 'readwrite', (store) => store.delete(id));

export const listCollections = () =>
  run<Collection[]>(COLLECTIONS, 'readonly', (store) => store.getAll() as IDBRequest<Collection[]>);
export const putCollection = (collection: Collection) =>
  run<IDBValidKey>(COLLECTIONS, 'readwrite', (store) => store.put(collection));
export const deleteCollection = (id: string) =>
  run<undefined>(COLLECTIONS, 'readwrite', (store) => store.delete(id));

export function getSettings(): Promise<Settings> {
  return run<Settings | undefined>(META, 'readonly', (store) => store.get(SETTINGS_KEY) as IDBRequest<Settings | undefined>)
    .then((stored) => ({ ...DEFAULT_SETTINGS, ...(stored ?? {}) }))
    .catch(() => ({ ...DEFAULT_SETTINGS }));
}

export const saveSettings = (settings: Settings) =>
  run<IDBValidKey>(META, 'readwrite', (store) => store.put(settings, SETTINGS_KEY));

/** Free-form meta slot, used for the prune snooze and the service worker's pending share. */
export function readMeta<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>(META, 'readonly', (store) => store.get(key) as IDBRequest<T | undefined>).catch(
    () => undefined,
  );
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  try {
    await run<IDBValidKey>(META, 'readwrite', (store) => store.put(value, key));
  } catch {
    // Meta is best-effort: a failure here must never break a save.
  }
}

export type Backup = {
  format: 'wishlist';
  version: 1;
  exportedAt: string;
  items: Item[];
  collections: Collection[];
};

export function makeBackup(items: Item[], collections: Collection[]): string {
  const payload: Backup = {
    format: 'wishlist',
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
    collections,
  };
  return JSON.stringify(payload, null, 2);
}

function fail(message: string): never {
  throw new Error(message);
}

function validateItem(value: unknown, seen: Set<string>): Item {
  if (!value || typeof value !== 'object') fail('Invalid item');
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id || seen.has(item.id)) fail('Duplicate or missing item id');
  if (typeof item.title !== 'string' || !item.title.trim()) fail('Item without a title');
  if (!isTier(item.tier)) fail('Item without a valid tier');
  if (!isStatus(item.status)) fail('Item without a valid status');
  if (typeof item.order !== 'number' || !Number.isFinite(item.order)) fail('Item without a valid order');
  if (!Array.isArray(item.tags) || !item.tags.every((tag) => typeof tag === 'string')) fail('Invalid tags');
  if (!Array.isArray(item.collectionIds) || !item.collectionIds.every((id) => typeof id === 'string'))
    fail('Invalid collections');
  if (typeof item.createdAt !== 'string' || Number.isNaN(Date.parse(item.createdAt))) fail('Invalid createdAt');
  if (typeof item.updatedAt !== 'string' || Number.isNaN(Date.parse(item.updatedAt))) fail('Invalid updatedAt');
  if (item.url !== undefined && item.url !== '' && (typeof item.url !== 'string' || !isHttpUrl(item.url)))
    fail('Invalid url');
  if (item.image !== undefined && item.image !== '' && typeof item.image !== 'string') fail('Invalid image');
  for (const key of ['price', 'wasPrice', 'targetPrice'] as const) {
    const amount = item[key];
    if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0))
      fail(`Invalid ${key}`);
  }
  seen.add(item.id);
  return {
    ...(item as unknown as Item),
    color: isColor(item.color) ? item.color : 'slate',
    tags: (item.tags as string[]).slice(0, 40),
    collectionIds: (item.collectionIds as string[]).slice(0, 40),
  };
}

function validateCollection(value: unknown, seen: Set<string>): Collection {
  if (!value || typeof value !== 'object') fail('Invalid collection');
  const collection = value as Record<string, unknown>;
  if (typeof collection.id !== 'string' || !collection.id || seen.has(collection.id)) fail('Invalid collection id');
  if (typeof collection.name !== 'string' || !collection.name.trim()) fail('Collection without a name');
  if (typeof collection.createdAt !== 'string' || Number.isNaN(Date.parse(collection.createdAt)))
    fail('Invalid collection date');
  seen.add(collection.id);
  return {
    id: collection.id,
    name: collection.name.trim().slice(0, 80),
    createdAt: collection.createdAt,
  };
}

/** Validates a backup envelope completely before anything is written. */
export function parseBackup(text: string): { items: Item[]; collections: Collection[] } {
  if (text.length > MAX_BACKUP_BYTES) fail('Backup is too large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('Backup is not valid JSON');
  }
  if (!raw || typeof raw !== 'object') fail('Backup is not an object');
  const data = raw as Record<string, unknown>;
  if (data.format !== 'wishlist') fail('Not a wishlist backup');
  if (data.version !== 1) fail('Unsupported backup version');
  if (!Array.isArray(data.items)) fail('Backup has no items');
  if (data.items.length > MAX_ITEMS) fail('Backup has too many items');
  if (!Array.isArray(data.collections ?? [])) fail('Backup has invalid collections');

  const itemIds = new Set<string>();
  const items = data.items.map((value) => validateItem(value, itemIds));
  const collectionIds = new Set<string>();
  const collections = (data.collections as unknown[]).map((value) => validateCollection(value, collectionIds));

  return { items, collections };
}

/** Replaces everything in one transaction. Caller confirms first. */
export async function replaceAll(items: Item[], collections: Collection[]): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ITEMS, COLLECTIONS], 'readwrite');
    const itemStore = tx.objectStore(ITEMS);
    const collectionStore = tx.objectStore(COLLECTIONS);
    itemStore.clear();
    collectionStore.clear();
    for (const item of items) itemStore.put(item);
    for (const collection of collections) collectionStore.put(collection);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Restore failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Restore aborted'));
  });
}

export function downloadBackup(items: Item[], collections: Collection[]): void {
  const blob = new Blob([makeBackup(items, collections)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `wishlist-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
