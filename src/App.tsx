import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveView } from './components/ArchiveView';
import { CaptureDialog } from './components/CaptureDialog';
import { CollectionsView } from './components/CollectionsView';
import { EditorPane } from './components/EditorPane';
import { ItemCard } from './components/ItemCard';
import { SettingsView } from './components/SettingsView';
import {
  byTierAndOrder,
  DEFAULT_SETTINGS,
  formatUsd,
  monogram,
  newId,
  nextBuy,
  nextOrder,
  nowIso,
  nudge,
  openItems,
  PALETTE,
  pruneCandidates,
  reorderBefore,
  tagIndex,
  TIER_LABELS,
  TIERS,
  type Collection,
  type Item,
  type Settings,
  type Tier,
} from './model';
import {
  deleteCollection,
  deleteItem,
  downloadBackup,
  getSettings,
  listCollections,
  listItems,
  parseBackup,
  putCollection,
  putItem,
  readMeta,
  replaceAll,
  saveSettings,
  writeMeta,
} from './storage';
import { takeCaptureParam, unfurl } from './unfurl';

type Page = 'wants' | 'collections' | 'archive' | 'settings';
type Sort = 'manual' | 'newest' | 'price-low' | 'price-high' | 'title';

type Filters = {
  query: string;
  tier: 'all' | Tier;
  tag: string;
  collectionId: string;
  sort: Sort;
};

const EMPTY_FILTERS: Filters = { query: '', tier: 'all', tag: '', collectionId: '', sort: 'manual' };
const FILTER_KEY = 'wishlist.filters';
const PRUNE_KEY = 'pruneSnoozedFor';

function readFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw) as Partial<Filters>;
    return { ...EMPTY_FILTERS, ...parsed };
  } catch {
    return EMPTY_FILTERS;
  }
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [page, setPage] = useState<Page>('wants');
  const [filters, setFilters] = useState<Filters>(readFilters);
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [capture, setCapture] = useState<{ open: boolean; url: string }>({ open: false, url: '' });
  const [pruneOpen, setPruneOpen] = useState<Item[]>([]);
  const [snoozed, setSnoozed] = useState(true);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listItems(), listCollections(), getSettings(), readMeta<string>(PRUNE_KEY)])
      .then(([loadedItems, loadedCollections, loadedSettings, snooze]) => {
        if (!alive) return;
        setItems(loadedItems);
        setCollections(loadedCollections);
        setSettings(loadedSettings);
        setSnoozed(snooze === monthKey());
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setStorageError('Could not open local storage. Nothing has been changed.');
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // A share-target delivery or a bookmarklet hit arrives as a URL in the address bar.
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    void (async () => {
      const shared = await readMeta<{ url: string; at: string }>('pendingShare');
      if (alive && shared?.url) {
        await writeMeta('pendingShare', null);
        setCapture({ open: true, url: shared.url });
        return;
      }
      const fromLink = takeCaptureParam();
      if (alive && fromLink) setCapture({ open: true, url: fromLink });
    })();
    return () => {
      alive = false;
    };
  }, [loaded]);

  useEffect(() => {
    if (!loaded || snoozed) return;
    const candidates = pruneCandidates(items);
    setPruneOpen(candidates);
  }, [items, loaded, snoozed]);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      // Filter memory is a nicety; failing to persist it is harmless.
    }
  }, [filters]);

  const save = useCallback(async (item: Item): Promise<boolean> => {
    try {
      await putItem(item);
      setItems((old) => [...old.filter((entry) => entry.id !== item.id), item]);
      setStorageError('');
      return true;
    } catch {
      setStorageError('Could not save. Check browser storage space, then try again.');
      return false;
    }
  }, []);

  const createItem = useCallback(
    async (input: { title: string; url?: string; why?: string; tier: Tier }) => {
      const stamp = nowIso();
      const item: Item = {
        id: newId(),
        title: input.title || input.url || 'Untitled want',
        url: input.url,
        why: input.why,
        tags: [],
        collectionIds: [],
        tier: input.tier,
        order: nextOrder(items, input.tier),
        status: 'open',
        color: PALETTE[items.length % PALETTE.length] ?? 'slate',
        createdAt: stamp,
        updatedAt: stamp,
      };
      const ok = await save(item);
      if (!ok) return;

      if (input.url && settings.proxyUrl) {
        const outcome = await unfurl(settings.proxyUrl, input.url);
        if (outcome.ok) {
          const patch: Partial<Item> = { updatedAt: nowIso() };
          if (outcome.result.title) patch.title = outcome.result.title.slice(0, 160);
          if (outcome.result.image) patch.image = outcome.result.image;
          if (outcome.result.siteName) patch.siteName = outcome.result.siteName;
          const latest = { ...item, ...patch };
          await save(latest);
        }
      }
    },
    [items, save, settings.proxyUrl],
  );

  const updateItem = useCallback(
    async (id: string, patch: Partial<Item>): Promise<boolean> => {
      const current = items.find((item) => item.id === id);
      if (!current) return false;
      return save({ ...current, ...patch, updatedAt: nowIso() });
    },
    [items, save],
  );

  const openEditor = (item: Item, trigger?: HTMLElement | null) => {
    triggerRef.current = trigger ?? (document.activeElement as HTMLElement | null);
    setEditingId(item.id);
  };

  const closeEditor = () => {
    setEditingId(null);
  };

  const editing = items.find((item) => item.id === editingId) ?? null;

  // Returning focus must happen after the pane has actually unmounted, otherwise
  // the browser blurs the removed field to <body> and swallows the focus call.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editingId !== null) {
      wasEditing.current = true;
      return;
    }
    if (!wasEditing.current) return;
    wasEditing.current = false;
    const trigger = triggerRef.current;
    if (trigger && document.contains(trigger)) trigger.focus();
  }, [editingId]);

  const visible = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const list = openItems(items).filter((item) => {
      if (filters.tier !== 'all' && item.tier !== filters.tier) return false;
      if (filters.tag && !item.tags.includes(filters.tag)) return false;
      if (filters.collectionId && !item.collectionIds.includes(filters.collectionId)) return false;
      if (!query) return true;
      return `${item.title} ${item.why ?? ''} ${item.tags.join(' ')} ${item.siteName ?? ''}`
        .toLowerCase()
        .includes(query);
    });
    const sorted = [...list];
    switch (filters.sort) {
      case 'newest':
        return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      case 'price-low':
        return sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      case 'price-high':
        return sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return sorted.sort(byTierAndOrder);
    }
  }, [items, filters]);

  const featured = nextBuy(items);
  const openCount = openItems(items).length;
  const archivedCount = items.length - openCount;
  const allTags = useMemo(() => tagIndex(items), [items]);
  const activeFilterCount =
    (filters.tier !== 'all' ? 1 : 0) +
    (filters.tag ? 1 : 0) +
    (filters.collectionId ? 1 : 0) +
    (filters.sort !== 'manual' ? 1 : 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCapture({ open: true, url: '' });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const navItems: { page: Page; label: string; glyph: string; count?: number }[] = [
    { page: 'wants', label: 'Wants', glyph: '▦', count: openCount },
    { page: 'collections', label: 'Collections', glyph: '❐', count: collections.length },
    { page: 'archive', label: 'Archive', glyph: '◫', count: archivedCount },
    { page: 'settings', label: 'Settings', glyph: '⚙' },
  ];

  const navButton = (entry: (typeof navItems)[number]) => (
    <button
      key={entry.page}
      type="button"
      className={`nav-item ${page === entry.page ? 'active' : ''}`}
      onClick={() => {
        setPage(entry.page);
        setEditingId(null);
      }}
      data-tip={collapsed ? entry.label : undefined}
      aria-current={page === entry.page ? 'page' : undefined}
    >
      <span className="nav-icon" aria-hidden="true">
        {entry.glyph}
      </span>
      <span className="nav-label">{entry.label}</span>
      {entry.count !== undefined ? <span className="nav-count">{entry.count}</span> : null}
    </button>
  );

  const snoozePrune = async () => {
    setSnoozed(true);
    setPruneOpen([]);
    await writeMeta(PRUNE_KEY, monthKey());
  };

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-top">
          <span className="brand">wishlist</span>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M9 4.5v15" />
            </svg>
          </button>
        </div>
        <nav className="side-nav" aria-label="Sections">
          {navItems.map(navButton)}
        </nav>
        <div className="side-foot">
          <button
            type="button"
            className="nav-item"
            onClick={() => setCapture({ open: true, url: '' })}
            data-tip={collapsed ? 'Add a want' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">
              +
            </span>
            <span className="nav-label">Add a want</span>
          </button>
        </div>
      </aside>

      <main>
        <div className="mobile-header">
          <span>wishlist</span>
          <span className="topbar-label">LOCAL</span>
        </div>

        {storageError ? (
          <p className="error-note" role="alert" style={{ marginTop: 14 }}>
            {storageError}
          </p>
        ) : null}

        {page === 'wants' ? (
          <>
            <div className="topbar">
              <span className="topbar-label">WANTS</span>
              <span className="topbar-label">{settings.proxyUrl ? 'PREVIEWS ON' : 'PREVIEWS OFF'}</span>
            </div>
            <div className="title-row">
              <div>
                <h1>
                  Wants <span className="count">{String(visible.length).padStart(2, '0')}</span>
                </h1>
              </div>
              <p>{openCount} open · {archivedCount} archived</p>
            </div>

            {pruneOpen.length > 0 ? (
              <div className="prune-banner" role="status">
                <span>
                  {pruneOpen.length} {pruneOpen.length === 1 ? 'want has' : 'wants have'} not been touched in over 90
                  days. Still wanted?
                </span>
                <div className="actions">
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => {
                      const oldest = pruneOpen[0];
                      if (oldest) openEditor(oldest);
                    }}
                  >
                    Review oldest: {pruneOpen[0]?.title.slice(0, 28)}
                  </button>
                  <button type="button" className="link-button" onClick={snoozePrune}>
                    Not now
                  </button>
                </div>
              </div>
            ) : null}

            {featured ? (
              <section className="next-buy" aria-label="Next buy">
                <div className="thumb">
                  {featured.image ? (
                    <img src={featured.image} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span
                      className={`plate-fallback plate-${featured.color}`}
                      style={{ fontSize: 22, position: 'static', display: 'grid', height: '100%' }}
                      aria-hidden="true"
                    >
                      {monogram(featured.title)}
                    </span>
                  )}
                </div>
                <div className="body">
                  <p className="eyebrow">NEXT BUY</p>
                  <h2>{featured.title}</h2>
                  <p className="meta">
                    {formatUsd(featured.price) ? <span>{formatUsd(featured.price)}</span> : <span>No price yet</span>}
                    {featured.why ? <span>{featured.why}</span> : null}
                  </p>
                </div>
                <div className="actions">
                  <button type="button" className="button-ghost" onClick={() => openEditor(featured)}>
                    Open
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => void updateItem(featured.id, { status: 'purchased', purchasedOn: nowIso() })}
                  >
                    Bought it
                  </button>
                </div>
              </section>
            ) : null}

            <div className="controls">
              <label className="search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                  <circle cx="10.7" cy="10.7" r="6.2" />
                  <path d="m15.3 15.3 4.2 4.2" />
                </svg>
                <span className="sr-only">Search your wants</span>
                <input
                  value={filters.query}
                  onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                  placeholder="Search wants, tags, shops"
                />
              </label>
              <button type="button" className="pill-button primary" onClick={() => setCapture({ open: true, url: '' })}>
                + Add
              </button>
            </div>

            <div id="filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
              <label className="pill-button" style={{ gap: 8 }}>
                <span className="sr-only">Tier</span>
                <select
                  value={filters.tier}
                  onChange={(event) => setFilters({ ...filters, tier: event.target.value as Filters['tier'] })}
                  style={{ border: 0, background: 'transparent', font: 'inherit', color: 'inherit' }}
                >
                  <option value="all">All tiers</option>
                  {TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {TIER_LABELS[tier]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pill-button" style={{ gap: 8 }}>
                <span className="sr-only">Tag</span>
                <select
                  value={filters.tag}
                  onChange={(event) => setFilters({ ...filters, tag: event.target.value })}
                  style={{ border: 0, background: 'transparent', font: 'inherit', color: 'inherit' }}
                >
                  <option value="">All tags</option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pill-button" style={{ gap: 8 }}>
                <span className="sr-only">Collection</span>
                <select
                  value={filters.collectionId}
                  onChange={(event) => setFilters({ ...filters, collectionId: event.target.value })}
                  style={{ border: 0, background: 'transparent', font: 'inherit', color: 'inherit' }}
                >
                  <option value="">All collections</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pill-button" style={{ gap: 8 }}>
                <span className="sr-only">Sort</span>
                <select
                  value={filters.sort}
                  onChange={(event) => setFilters({ ...filters, sort: event.target.value as Sort })}
                  style={{ border: 0, background: 'transparent', font: 'inherit', color: 'inherit' }}
                >
                  <option value="manual">Manual order</option>
                  <option value="newest">Newest</option>
                  <option value="price-low">Price, low first</option>
                  <option value="price-high">Price, high first</option>
                  <option value="title">Title A–Z</option>
                </select>
              </label>
              {activeFilterCount > 0 ? (
                <button type="button" className="link-button" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Reset
                </button>
              ) : null}
            </div>

            {visible.length === 0 ? (
              <div className="empty">
                <h2>{items.length === 0 ? 'Nothing on the list yet' : 'Nothing matches those filters'}</h2>
                <p>
                  {items.length === 0
                    ? 'Paste a link, or press Ctrl/⌘ K. The picture comes with it when the preview proxy is set.'
                    : 'Loosen a filter, or reset them all.'}
                </p>
                <button type="button" className="button-primary" onClick={() => setCapture({ open: true, url: '' })}>
                  Add a want
                </button>
              </div>
            ) : (
              <div className="gallery" aria-label="Your wants">
                {visible.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    collections={collections}
                    onOpen={(target, trigger) => openEditor(target, trigger)}

                    onDragStart={() => undefined}
                    onDropBefore={(draggedId, targetId) => {
                      const next = reorderBefore(items, draggedId, targetId);
                      if (next === items) return;
                      setItems(next);
                      // Every item whose position changed has to be written, not just
                      // the dragged one, or a reload restores duplicate order values.
                      const changed = next.filter((entry) => {
                        const before = items.find((old) => old.id === entry.id);
                        return before && before.order !== entry.order;
                      });
                      for (const entry of changed) void save(entry);
                    }}
                    onNudge={(target, direction) => {
                      const next = nudge(items, target.id, direction);
                      if (next === items) return;
                      setItems(next);
                      const changed = next.filter((entry) => {
                        const before = items.find((old) => old.id === entry.id);
                        return before && before.order !== entry.order;
                      });
                      for (const entry of changed) void save(entry);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}

        {page === 'collections' ? (
          <CollectionsView
            collections={collections}
            items={items}
            onCreate={async (name) => {
              const collection: Collection = { id: newId(), name: name.slice(0, 80), createdAt: nowIso() };
              await putCollection(collection);
              setCollections((old) => [...old, collection]);
            }}
            onRename={async (collection, name) => {
              const renamed = { ...collection, name: name.slice(0, 80) };
              await putCollection(renamed);
              setCollections((old) => old.map((entry) => (entry.id === collection.id ? renamed : entry)));
            }}
            onDelete={async (collection) => {
              await deleteCollection(collection.id);
              setCollections((old) => old.filter((entry) => entry.id !== collection.id));
              for (const item of items.filter((entry) => entry.collectionIds.includes(collection.id))) {
                await updateItem(item.id, {
                  collectionIds: item.collectionIds.filter((id) => id !== collection.id),
                });
              }
            }}
            onOpenCollection={(collection) => {
              setFilters({ ...EMPTY_FILTERS, collectionId: collection.id });
              setPage('wants');
            }}
          />
        ) : null}

        {page === 'archive' ? (
          <ArchiveView
            items={items}
            onOpen={(item) => openEditor(item)}
            onReopen={(item) => void updateItem(item.id, { status: 'open', purchasedOn: undefined })}
          />
        ) : null}

        {page === 'settings' ? (
          <SettingsView
            proxyUrl={settings.proxyUrl}
            items={items}
            collections={collections}
            storageError={storageError}
            onSaveProxy={async (url) => {
              const next = { ...settings, proxyUrl: url };
              setSettings(next);
              await saveSettings(next);
            }}
            onExport={() => downloadBackup(items, collections)}
            onRestore={async (file) => {
              try {
                const parsed = parseBackup(await file.text());
                await replaceAll(parsed.items, parsed.collections);
                setItems(parsed.items);
                setCollections(parsed.collections);
                return {
                  ok: true,
                  message: `Restored ${parsed.items.length} items and ${parsed.collections.length} collections.`,
                };
              } catch (error) {
                return {
                  ok: false,
                  message: error instanceof Error ? `Restore failed: ${error.message}` : 'Restore failed.',
                };
              }
            }}
          />
        ) : null}

        <nav className="mobile-nav" aria-label="Sections">
          {navItems.slice(0, 3).map((entry) => (
            <button
              key={entry.page}
              type="button"
              className={page === entry.page ? 'active' : ''}
              onClick={() => {
                setPage(entry.page);
                setEditingId(null);
              }}
            >
              <span aria-hidden="true">{entry.glyph}</span>
              {entry.label}
            </button>
          ))}
          <button type="button" onClick={() => setCapture({ open: true, url: '' })}>
            <span aria-hidden="true">+</span>
            Add
          </button>
        </nav>
      </main>

      {editing ? (
        <EditorPane
          key={editing.id}
          item={editing}
          collections={collections}
          tagSuggestions={allTags}
          proxyUrl={settings.proxyUrl}
          onClose={closeEditor}
          onSave={(patch) => updateItem(editing.id, patch)}
          onDelete={async () => {
            try {
              await deleteItem(editing.id);
              setItems((old) => old.filter((entry) => entry.id !== editing.id));
              closeEditor();
            } catch {
              setStorageError('Could not delete that item.');
            }
          }}
        />
      ) : null}

      {capture.open ? (
        <CaptureDialog
          initialUrl={capture.url}
          proxyUrl={settings.proxyUrl}
          onClose={() => setCapture({ open: false, url: '' })}
          onCapture={async (input) => {
            await createItem(input);
            setCapture({ open: false, url: '' });
          }}
        />
      ) : null}
    </div>
  );
}
