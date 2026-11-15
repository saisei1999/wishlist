import { useState } from 'react';
import { Dialog } from './Dialog';
import { proxyReady, bookmarkletHref } from '../unfurl';
import { parseBackup } from '../storage';
import type { Collection, Item } from '../model';

type Props = {
  proxyUrl: string;
  items: Item[];
  collections: Collection[];
  storageError: string;
  onSaveProxy: (url: string) => Promise<void>;
  onExport: () => void;
  onRestore: (file: File) => Promise<{ ok: boolean; message: string }>;
};

export function SettingsView({ proxyUrl, items, collections, storageError, onSaveProxy, onExport, onRestore }: Props) {
  const [proxy, setProxy] = useState(proxyUrl);
  const [savedNote, setSavedNote] = useState('');
  const [restoreNote, setRestoreNote] = useState('');
  const [pending, setPending] = useState<{ file: File; items: number; collections: number } | null>(null);

  const appUrl = `${location.origin}${location.pathname}`;

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Settings</h1>
        </div>
        <p>{items.length} items · {collections.length} collections · stored in this browser</p>
      </div>

      {storageError ? (
        <p className="error-note" role="alert">
          {storageError}
        </p>
      ) : null}

      <div className="panel">
        <h2>Link previews</h2>
        <p>
          Paste your Cloudflare Worker URL here. Without it, cards fall back to a colour plate and you can still add
          an image URL by hand.
        </p>
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSaveProxy(proxy.trim());
            setSavedNote(proxyReady(proxy.trim()) ? 'Saved. Previews are on.' : 'Saved. Previews are off.');
          }}
        >
          <label className="sr-only" htmlFor="proxy-url">
            Preview proxy URL
          </label>
          <input
            id="proxy-url"
            value={proxy}
            onChange={(event) => setProxy(event.target.value)}
            placeholder="https://wishlist-unfurl.you.workers.dev"
            inputMode="url"
          />
          <button type="submit" className="button-primary">
            Save
          </button>
        </form>
        <p className="hint-note">
          Status: {proxyReady(proxy) ? 'previews enabled' : 'previews off'} · {savedNote || 'deploy the worker in worker/README.md'}
        </p>
      </div>

      <div className="panel">
        <h2>Quick capture</h2>
        <p>Drag this to your bookmarks bar. Clicking it on any product page opens Wishlist with the link queued.</p>
        <a
          className="button-ghost"
          href={bookmarkletHref(appUrl)}
          onClick={(event) => event.preventDefault()}
          draggable
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
        >
          Add to Wishlist
        </a>
        <p className="hint-note">
          Keyboard: press <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd> anywhere in the app to capture.
        </p>
      </div>

      <div className="panel">
        <h2>Your data</h2>
        <p>
          Everything lives in this browser on this device. Clearing browser data removes it, and browsers can evict
          storage. Export regularly — the file is the backup that survives.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="button-primary" onClick={onExport}>
            Export JSON backup
          </button>
          <label className="button-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Restore from a backup
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                setRestoreNote('');
                try {
                  const text = await file.text();
                  const parsed = parseBackup(text);
                  setPending({ file, items: parsed.items.length, collections: parsed.collections.length });
                } catch (error) {
                  setPending(null);
                  setRestoreNote(error instanceof Error ? `That file was not accepted: ${error.message}` : 'That file was not accepted.');
                }
              }}
            />
          </label>
        </div>
        {restoreNote ? (
          <p className="error-note" role="alert" style={{ marginTop: 12 }}>
            {restoreNote}
          </p>
        ) : null}
        <p className="hint-note">Restore replaces the whole library only after you confirm. A failed file changes nothing.</p>
      </div>

      {pending ? (
        <Dialog
          title="Replace this library?"
          subtitle={`The backup holds ${pending.items} items and ${pending.collections} collections. Yours will be replaced.`}
          labelledBy="restore-title"
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="button-ghost" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={async () => {
                  const result = await onRestore(pending.file);
                  setPending(null);
                  setRestoreNote(result.message);
                }}
              >
                Replace everything
              </button>
            </>
          }
        >
          <p className="hint-note">Export your current library first if you want a way back.</p>
        </Dialog>
      ) : null}
    </section>
  );
}
