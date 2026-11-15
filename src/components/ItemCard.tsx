import { useState } from 'react';
import { formatUsd, monogram, targetDelta, TIER_LABELS, type Collection, type Item } from '../model';

type Props = {
  item: Item;
  collections: Collection[];
  onOpen: (item: Item, trigger?: HTMLElement | null) => void;
  onFetchImage: (item: Item) => void;
  canFetchImage: boolean;
  onDragStart: (item: Item) => void;
  onDropBefore: (draggedId: string, targetId: string) => void;
  onNudge: (item: Item, direction: -1 | 1) => void;
};

/** One square card. The whole plate is the primary click target. */
export function ItemCard({
  item,
  collections,
  onOpen,
  onFetchImage,
  canFetchImage,
  onDragStart,
  onDropBefore,
  onNudge,
}: Props) {
  const price = formatUsd(item.price);
  const delta = targetDelta(item);
  const collection = collections.find((entry) => item.collectionIds.includes(entry.id));
  // A hotlinked image can 404 or refuse to load; the colour plate is the fallback.
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = Boolean(item.image) && !imageBroken;

  return (
    <article
      className={`card tier-${item.tier}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', item.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(item);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const dragged = event.dataTransfer.getData('text/plain');
        if (dragged) onDropBefore(dragged, item.id);
      }}
      onKeyDown={(event) => {
        // Keyboard equivalent of dragging: Alt + arrow keys nudges within the tier.
        if (!event.altKey) return;
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          onNudge(item, event.key === 'ArrowUp' ? -1 : 1);
        }
      }}
      aria-label={`${item.title}, ${TIER_LABELS[item.tier]}${price ? `, ${price}` : ''}`}
    >
      <div className="plate">
        {showImage ? (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <span className={`plate-fallback plate-${item.color}`} aria-hidden="true">
            {monogram(item.title)}
          </span>
        )}
        <button
          type="button"
          className="plate-open"
          onClick={(event) => onOpen(item, event.currentTarget)}
          aria-label={`Edit ${item.title}`}
        />
        {price ? (
          <p className="price-badge">
            {price}
            {delta ? <span className="target">{delta.atOrBelow ? 'at target' : delta.label}</span> : null}
          </p>
        ) : null}
        <p className="tier-tag">{TIER_LABELS[item.tier]}</p>
        {!item.image && item.url && canFetchImage ? (
          <button
            type="button"
            className="fetch-image"
            onClick={(event) => {
              event.stopPropagation();
              onFetchImage(item);
            }}
          >
            Get picture
          </button>
        ) : null}
      </div>

      <div className="card-body">
        {item.url ? (
          <a
            className="card-title"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${item.url}`}
          >
            {item.title}
          </a>
        ) : (
          <button type="button" className="card-title" onClick={(event) => onOpen(item, event.currentTarget)}>
            {item.title}
          </button>
        )}
        {item.why ? <p className="card-why">{item.why}</p> : null}
        <div className="card-foot">
          {collection ? <span className="chip collection">{collection.name}</span> : null}
          {item.tags.slice(0, 2).map((tag) => (
            <span className="chip" key={tag}>
              {tag}
            </span>
          ))}
          {item.tags.length > 2 ? <span className="chip">+{item.tags.length - 2}</span> : null}
        </div>
      </div>
    </article>
  );
}
