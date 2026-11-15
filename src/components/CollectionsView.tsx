import { useState } from 'react';
import { Dialog } from './Dialog';
import type { Collection, Item } from '../model';

type Props = {
  collections: Collection[];
  items: Item[];
  onCreate: (name: string) => Promise<void>;
  onRename: (collection: Collection, name: string) => Promise<void>;
  onDelete: (collection: Collection) => Promise<void>;
  onOpenCollection: (collection: Collection) => void;
};

export function CollectionsView({ collections, items, onCreate, onRename, onDelete, onOpenCollection }: Props) {
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<Collection | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [removing, setRemoving] = useState<Collection | null>(null);

  const count = (collection: Collection) =>
    items.filter((item) => item.collectionIds.includes(collection.id) && item.status === 'open').length;

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>
            Collections <span className="count">{String(collections.length).padStart(2, '0')}</span>
          </h1>
        </div>
        <p>One level, no nesting. An item can sit in several.</p>
      </div>

      <div className="panel">
        <h2>New collection</h2>
        <p>For a birthday, a move, a room, a person.</p>
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const name = draft.trim();
            if (!name) return;
            await onCreate(name);
            setDraft('');
          }}
        >
          <label className="sr-only" htmlFor="new-collection">
            Collection name
          </label>
          <input
            id="new-collection"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Birthday party"
            maxLength={80}
          />
          <button type="submit" className="button-primary" disabled={!draft.trim()}>
            Create
          </button>
        </form>
      </div>

      {collections.length === 0 ? (
        <div className="empty">
          <h2>No collections yet</h2>
          <p>A collection is a shelf: the things you would buy together. Tags cut across them.</p>
        </div>
      ) : (
        <ul className="row-list">
          {collections.map((collection) => (
            <li className="row-item" key={collection.id}>
              <div className="grow">
                <strong>{collection.name}</strong>
                <div className="sub">
                  {count(collection)} open {count(collection) === 1 ? 'want' : 'wants'}
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="button-ghost" onClick={() => onOpenCollection(collection)}>
                  Open
                </button>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => {
                    setRenaming(collection);
                    setRenameValue(collection.name);
                  }}
                >
                  Rename
                </button>
                <button type="button" className="button-danger" onClick={() => setRemoving(collection)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {renaming ? (
        <Dialog
          title="Rename collection"
          labelledBy="rename-title"
          onClose={() => setRenaming(null)}
          footer={
            <>
              <button type="button" className="button-ghost" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={async () => {
                  const name = renameValue.trim();
                  if (!name) return;
                  await onRename(renaming, name);
                  setRenaming(null);
                }}
              >
                Save name
              </button>
            </>
          }
        >
          <label className="field">
            <span>Name</span>
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              maxLength={80}
              autoFocus
            />
          </label>
        </Dialog>
      ) : null}

      {removing ? (
        <Dialog
          title={`Delete “${removing.name}”?`}
          subtitle="The items stay in your library; only the shelf goes away."
          labelledBy="remove-title"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="button-ghost" onClick={() => setRemoving(null)}>
                Keep it
              </button>
              <button
                type="button"
                className="button-primary"
                style={{ background: '#97403c' }}
                onClick={async () => {
                  await onDelete(removing);
                  setRemoving(null);
                }}
              >
                Delete collection
              </button>
            </>
          }
        >
          <p className="hint-note">{count(removing)} open wants are in it right now.</p>
        </Dialog>
      ) : null}
    </section>
  );
}
