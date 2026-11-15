import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import {
  isHttpUrl,
  monogram,
  normalizedTags,
  targetDelta,
  formatUsd,
  TIER_LABELS,
  TIERS,
  type Collection,
  type Item,
  type Tier,
} from '../model';
import { unfurl, proxyReady } from '../unfurl';

type Props = {
  item: Item;
  collections: Collection[];
  tagSuggestions: string[];
  proxyUrl: string;
  onClose: () => void;
  onSave: (patch: Partial<Item>) => Promise<boolean>;
  onDelete: () => Promise<void>;
};

type FormState = {
  title: string;
  brand: string;
  url: string;
  image: string;
  why: string;
  notes: string;
  price: string;
  wasPrice: string;
  targetPrice: string;
  tags: string;
  tier: Tier;
  collectionIds: string[];
};

function toForm(item: Item): FormState {
  return {
    title: item.title,
    brand: item.brand ?? '',
    url: item.url ?? '',
    image: item.image ?? '',
    why: item.why ?? '',
    notes: item.notes ?? '',
    price: item.price === undefined ? '' : String(item.price),
    wasPrice: item.wasPrice === undefined ? '' : String(item.wasPrice),
    targetPrice: item.targetPrice === undefined ? '' : String(item.targetPrice),
    tags: item.tags.join(', '),
    tier: item.tier,
    collectionIds: item.collectionIds,
  };
}

function toNumber(value: string): number | undefined {
  const trimmed = value.trim().replace(/[$,\s]/g, '');
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : undefined;
}

/**
 * The item editor. Escape always closes: with unsaved edits it asks first, but it
 * never strands the user inside the pane.
 */
export function EditorPane({ item, collections, tagSuggestions, proxyUrl, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(item));
  const [baseline, setBaseline] = useState<FormState>(() => toForm(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [askDiscard, setAskDiscard] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (askDiscard || askDelete) return; // the dialog owns it
      event.preventDefault();
      if (dirty) setAskDiscard(true);
      else onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dirty, askDiscard, askDelete, onClose]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((old) => ({ ...old, [key]: value }));

  async function refetchPreview() {
    if (!isHttpUrl(form.url)) {
      setFetchNote('Enter a full https link first.');
      return;
    }
    if (!proxyReady(proxyUrl)) {
      setFetchNote('No link-preview proxy set. Add one in Settings, or fill the image URL yourself.');
      return;
    }
    setFetching(true);
    setFetchNote('');
    const outcome = await unfurl(proxyUrl, form.url);
    setFetching(false);
    if (!outcome.ok) {
      setFetchNote('The preview could not be read. The link is still saved.');
      return;
    }
    setForm((old) => ({
      ...old,
      title: outcome.result.title && old.title.trim().length === 0 ? outcome.result.title : old.title,
      image: outcome.result.image ?? old.image,
    }));
    setFetchNote(outcome.result.image ? 'Preview updated.' : 'No preview image on that page.');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    setError('');
    const patch: Partial<Item> = {
      title: form.title.trim().slice(0, 160),
      brand: form.brand.trim().slice(0, 60) || undefined,
      url: form.url.trim() && isHttpUrl(form.url) ? form.url.trim() : undefined,
      image: form.image.trim() || undefined,
      why: form.why.trim().slice(0, 200),
      notes: form.notes,
      price: toNumber(form.price),
      wasPrice: toNumber(form.wasPrice),
      targetPrice: toNumber(form.targetPrice),
      tags: normalizedTags(form.tags),
      tier: form.tier,
      collectionIds: form.collectionIds,
    };
    const ok = await onSave(patch);
    setSaving(false);
    if (!ok) {
      setError('That did not save. Your changes are still here — try again.');
      return;
    }
    setBaseline(toForm({ ...item, ...patch }));
  }

  const delta = targetDelta({
    ...item,
    price: toNumber(form.price),
    targetPrice: toNumber(form.targetPrice),
  });

  return (
    <aside className="editor" aria-label="Item editor">
      <div className="editor-head">
        <span>ITEM</span>
        <button
          type="button"
          className="icon-button"
          onClick={() => (dirty ? setAskDiscard(true) : onClose())}
          aria-label="Close item editor"
        >
          ×
        </button>
      </div>

      <form
        className="editor-body"
        onSubmit={submit}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void submit(event);
          }
        }}
      >
        <label className="field editor-title">
          <span className="sr-only">Title</span>
          <input ref={titleRef} value={form.title} onChange={(e) => set('title', e.target.value)} required maxLength={160} />
        </label>

        <div className="preview-thumb">
          {form.image ? (
            <img src={form.image} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className={`preview-plate plate-${item.color}`} aria-hidden="true">
              {monogram(form.title || '?')}
            </span>
          )}
          <div className="info">
            <strong>{item.siteName || 'No preview'}</strong>
            {delta ? (
              <span>
                {formatUsd(toNumber(form.price))} — {delta.label}
              </span>
            ) : (
              <span>Add a price and a target to see the gap.</span>
            )}
          </div>
        </div>

        <div className="field">
          <span>
            Link <small>https only</small>
          </span>
          <input
            type="url"
            placeholder="https://…"
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            aria-describedby="link-note"
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="button-ghost" onClick={refetchPreview} disabled={fetching}>
              {fetching ? 'Reading page…' : 'Fetch preview'}
            </button>
            {form.url && isHttpUrl(form.url) ? (
              <a href={form.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                Open link ↗
              </a>
            ) : null}
          </div>
          <p className="hint-note" id="link-note">
            {fetchNote || 'Images are hotlinked from the page, never copied.'}
          </p>
        </div>

        <label className="field">
          <span>Why I want it</span>
          <input
            placeholder="One line you will thank yourself for later"
            value={form.why}
            maxLength={200}
            onChange={(e) => set('why', e.target.value)}
          />
        </label>

        <label className="field">
          <span>
            Item brand <small>the maker, not the shop — e.g. Shure</small>
          </span>
          <input
            placeholder="Shure"
            value={form.brand}
            maxLength={60}
            onChange={(e) => set('brand', e.target.value)}
            aria-describedby="brand-note"
          />
          <p className="hint-note" id="brand-note">
            Shown bold at the start of the card title, after the shop name.
          </p>
        </label>

        <div className="field">
          <span>
            Picture <small>URL, or upload one (max 2 MB)</small>
          </span>
          <input
            type="url"
            placeholder="https://…/photo.jpg"
            value={form.image.startsWith('data:') ? '' : form.image}
            onChange={(event) => set('image', event.target.value)}
            aria-describedby="picture-note"
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="button-ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
              Upload a picture
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (!file) return;
                  if (file.size > 2_000_000) {
                    setFetchNote('That picture is larger than 2 MB — use its link instead.');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    set('image', String(reader.result ?? ''));
                    setFetchNote('Picture added from your device.');
                  };
                  reader.onerror = () => setFetchNote('Could not read that file.');
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {form.image ? (
              <button type="button" className="button-danger" onClick={() => set('image', '')}>
                Remove picture
              </button>
            ) : null}
          </div>
          <p className="hint-note" id="picture-note">
            {form.image.startsWith('data:')
              ? 'This picture lives inside your library and travels with the JSON backup.'
              : 'Amazon blocks page reads, so paste a picture link or upload one for those.'}
          </p>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Price (USD)</span>
            <input inputMode="decimal" placeholder="0" value={form.price} onChange={(e) => set('price', e.target.value)} />
          </label>
          <label className="field">
            <span>Was</span>
            <input inputMode="decimal" placeholder="0" value={form.wasPrice} onChange={(e) => set('wasPrice', e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>
            Target price <small>what you would actually pay</small>
          </span>
          <input
            inputMode="decimal"
            placeholder="0"
            value={form.targetPrice}
            onChange={(e) => set('targetPrice', e.target.value)}
          />
        </label>

        <div className="field">
          <span>Tier</span>
          <div className="tier-picker" role="group" aria-label="Priority tier">
            {TIERS.map((tier) => (
              <button
                type="button"
                key={tier}
                aria-pressed={form.tier === tier}
                onClick={() => set('tier', tier)}
              >
                {TIER_LABELS[tier]}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>
            Tags <small>comma separated</small>
          </span>
          <input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="kitchen, gift ideas" />
          {tagSuggestions.length > 0 ? (
            <div className="tag-suggestions">
              {tagSuggestions
                .filter((tag) => !form.tags.toLowerCase().includes(tag.toLowerCase()))
                .slice(0, 6)
                .map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => set('tags', form.tags.trim() ? `${form.tags.replace(/,\s*$/, '')}, ${tag}` : tag)}
                  >
                    + {tag}
                  </button>
                ))}
            </div>
          ) : null}
        </label>

        {collections.length > 0 ? (
          <div className="field">
            <span>Collections</span>
            <div className="collection-picks" role="group" aria-label="Collections">
              {collections.map((collection) => (
                <button
                  type="button"
                  key={collection.id}
                  aria-pressed={form.collectionIds.includes(collection.id)}
                  onClick={() =>
                    set(
                      'collectionIds',
                      form.collectionIds.includes(collection.id)
                        ? form.collectionIds.filter((id) => id !== collection.id)
                        : [...form.collectionIds, collection.id],
                    )
                  }
                >
                  {collection.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="field">
          <span>Notes</span>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Sizes, colours, where to buy…" />
        </label>

        {error ? <p className="error-note" role="alert">{error}</p> : null}
      </form>

      <div className="editor-foot">
        <button type="button" className="button-danger" onClick={() => setAskDelete(true)}>
          Delete
        </button>
        <span className="status" aria-live="polite">
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved on this device'}
        </span>
        <button type="button" className="button-primary" onClick={submit} disabled={!dirty || saving || !form.title.trim()}>
          Save
        </button>
      </div>

      {askDiscard ? (
        <Dialog
          title="Discard unsaved changes?"
          subtitle="This item's edits will be lost."
          labelledBy="discard-title"
          onClose={() => setAskDiscard(false)}
          footer={
            <>
              <button type="button" className="button-ghost" onClick={() => setAskDiscard(false)}>
                Keep editing
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  setAskDiscard(false);
                  setBaseline(form);
                  onClose();
                }}
              >
                Discard
              </button>
            </>
          }
        >
          <p className="hint-note">Nothing else changes; the saved item stays as it was.</p>
        </Dialog>
      ) : null}

      {askDelete ? (
        <Dialog
          title="Delete this item?"
          subtitle="It will be removed from this library. This cannot be undone."
          labelledBy="delete-title"
          onClose={() => setAskDelete(false)}
          footer={
            <>
              <button type="button" className="button-ghost" onClick={() => setAskDelete(false)}>
                Keep it
              </button>
              <button
                type="button"
                className="button-primary"
                style={{ background: '#97403c' }}
                onClick={() => {
                  setAskDelete(false);
                  void onDelete();
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p className="hint-note">Export a backup first if you are unsure.</p>
        </Dialog>
      ) : null}
    </aside>
  );
}
