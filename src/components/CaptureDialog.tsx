import { useState } from 'react';
import { Dialog } from './Dialog';
import { isHttpUrl, TIER_LABELS, TIERS, type Tier } from '../model';
import { proxyReady } from '../unfurl';

type Props = {
  initialUrl: string;
  proxyUrl: string;
  onClose: () => void;
  onCapture: (input: { title: string; url?: string; why?: string; tier: Tier }) => Promise<void>;
};

/**
 * Quick capture. One optional decision — the reason — and everything else can wait
 * until the item is opened.
 */
export function CaptureDialog({ initialUrl, proxyUrl, onClose, onCapture }: Props) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState(initialUrl);
  const [why, setWhy] = useState('');
  const [tier, setTier] = useState<Tier>('soon');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const linkOk = url.trim() === '' || isHttpUrl(url);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (url.trim() && !linkOk) {
      setError('That does not look like a full link. Include https:// or leave it empty.');
      return;
    }
    if (!title.trim() && !url.trim()) {
      setError('Give it a name, a link, or both.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCapture({ title: title.trim(), url: url.trim() || undefined, why: why.trim() || undefined, tier });
    } catch {
      setError('Could not save this item. Try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Add a want"
      subtitle={
        proxyReady(proxyUrl)
          ? 'Paste a link and the picture comes with it.'
          : 'No preview proxy set, so this saves a colour card. You can add an image later.'
      }
      labelledBy="capture-title"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="capture-form" className="button-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add it'}
          </button>
        </>
      }
    >
      <form id="capture-form" onSubmit={submit}>
        <label className="field">
          <span>
            What is it? <small>optional when you paste a link</small>
          </span>
          <input
            placeholder="A desk lamp that does not flicker"
            value={title}
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span>
            Link <small>optional</small>
          </span>
          <input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label className="field">
          <span>
            Why I want it <small>optional</small>
          </span>
          <input
            placeholder="Because the old one leaks"
            value={why}
            maxLength={200}
            onChange={(event) => setWhy(event.target.value)}
          />
        </label>
        <div className="field">
          <span>Tier</span>
          <div className="tier-picker" role="group" aria-label="Priority tier">
            {TIERS.map((value) => (
              <button type="button" key={value} aria-pressed={tier === value} onClick={() => setTier(value)}>
                {TIER_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <p className="error-note" role="alert">
            {error}
          </p>
        ) : null}
        <p className="hint-note">Press Escape to cancel. Nothing is saved until you add it.</p>
      </form>
    </Dialog>
  );
}
