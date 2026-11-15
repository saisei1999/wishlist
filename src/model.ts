/** Pure domain logic. No DOM, no storage, no React. */

export const TIERS = ['next', 'soon', 'someday'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  next: 'Next buy',
  soon: 'Soon',
  someday: 'Someday',
};

export const STATUSES = ['open', 'purchased', 'dropped'] as const;
export type ItemStatus = (typeof STATUSES)[number];

export const PALETTE = ['blue', 'ochre', 'rose', 'slate', 'violet', 'teal'] as const;
export type Color = (typeof PALETTE)[number];

export type Item = {
  id: string;
  title: string;
  url?: string;
  image?: string;
  siteName?: string;
  price?: number;
  wasPrice?: number;
  targetPrice?: number;
  why?: string;
  notes?: string;
  tags: string[];
  collectionIds: string[];
  tier: Tier;
  order: number;
  status: ItemStatus;
  purchasedOn?: string;
  color: Color;
  createdAt: string;
  updatedAt: string;
};

export type Collection = {
  id: string;
  name: string;
  createdAt: string;
};

export type Settings = {
  proxyUrl: string;
};

export const DEFAULT_SETTINGS: Settings = { proxyUrl: '' };

/** Days an open item may sit untouched before the app offers to review it. */
export const PRUNE_DAYS = 90;

export const isTier = (value: unknown): value is Tier => TIERS.includes(value as Tier);
export const isStatus = (value: unknown): value is ItemStatus => STATUSES.includes(value as ItemStatus);
export const isColor = (value: unknown): value is Color => PALETTE.includes(value as Color);

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatUsd(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return `$${value.toFixed(2).replace(/\.00$/, '')}`;
}

/**
 * How far the price sits from the target. Returns null when either number is
 * missing, which keeps an unusable field from inventing a claim.
 */
export function targetDelta(item: Item): { amount: number; label: string; atOrBelow: boolean } | null {
  const { price, targetPrice } = item;
  if (price === undefined || targetPrice === undefined) return null;
  if (!Number.isFinite(price) || !Number.isFinite(targetPrice)) return null;
  const amount = Math.round((price - targetPrice) * 100) / 100;
  if (amount <= 0) return { amount, label: 'at target', atOrBelow: true };
  return { amount, label: `${formatUsd(amount)} over target`, atOrBelow: false };
}

/** Open items, grouped by tier, in manual order. */
export function openItems(items: Item[]): Item[] {
  return items.filter((item) => item.status === 'open');
}

export function byTierAndOrder(a: Item, b: Item): number {
  const tierDiff = TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier);
  if (tierDiff !== 0) return tierDiff;
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt.localeCompare(b.createdAt);
}

/** The single item the "Next buy" strip shows. */
export function nextBuy(items: Item[]): Item | null {
  const candidates = openItems(items)
    .filter((item) => item.tier === 'next')
    .sort(byTierAndOrder);
  return candidates[0] ?? null;
}

/** Highest order value in a tier, so new items land at the end. */
export function nextOrder(items: Item[], tier: Tier): number {
  const values = items.filter((item) => item.tier === tier).map((item) => item.order);
  return values.length === 0 ? 0 : Math.max(...values) + 1;
}

/**
 * Moves `id` to sit directly before `beforeId` inside its own tier, renumbering
 * that tier to 0..n-1. Pure: returns a new array, never mutates the input.
 */
export function reorderBefore(items: Item[], id: string, beforeId: string): Item[] {
  const moving = items.find((item) => item.id === id);
  const target = items.find((item) => item.id === beforeId);
  if (!moving || !target || moving.id === target.id) return items;
  if (moving.tier !== target.tier) return items;

  const tierItems = items
    .filter((item) => item.tier === moving.tier)
    .sort(byTierAndOrder)
    .filter((item) => item.id !== moving.id);

  const index = tierItems.findIndex((item) => item.id === target.id);
  const insertAt = index < 0 ? tierItems.length : index;
  tierItems.splice(insertAt, 0, moving);

  const renumbered = new Map(tierItems.map((item, i) => [item.id, i]));
  return items.map((item) =>
    item.tier === moving.tier && renumbered.has(item.id)
      ? { ...item, order: renumbered.get(item.id) ?? item.order }
      : item,
  );
}

/** Moves an item one slot up (-1) or down (+1) inside its tier. Keyboard path. */
export function nudge(items: Item[], id: string, direction: -1 | 1): Item[] {
  const moving = items.find((item) => item.id === id);
  if (!moving) return items;
  const tierItems = items.filter((item) => item.tier === moving.tier).sort(byTierAndOrder);
  const from = tierItems.findIndex((item) => item.id === id);
  const to = from + direction;
  const neighbour = tierItems[to];
  if (from < 0 || !neighbour) return items;
  // Swap the two positions, then renumber the tier 0..n-1 so it stays tidy.
  const swapped = tierItems.map((item, index) => {
    if (index === from) return { ...item, order: to };
    if (index === to) return { ...item, order: from };
    return item;
  });
  const renumbered = new Map(swapped.sort(byTierAndOrder).map((item, index) => [item.id, index]));
  return items.map((item) =>
    item.tier === moving.tier && renumbered.has(item.id)
      ? { ...item, order: renumbered.get(item.id) ?? item.order }
      : item,
  );
}

/** Open items untouched for longer than 90 days, oldest first. */
export function pruneCandidates(items: Item[], now: number = Date.now(), days: number = PRUNE_DAYS): Item[] {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return openItems(items)
    .filter((item) => Date.parse(item.updatedAt) < cutoff)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

/** All tags in use, cleverly ordered by frequency then alphabetically. */
export function tagIndex(items: Item[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

/** Trims, caps and de-duplicates tags case-insensitively, keeping first spelling. */
export function normalizedTags(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : input.split(',');
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of raw) {
    const tag = value.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function monogram(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const second = words[1]?.[0] ?? '';
  return (first + second).toUpperCase();
}
