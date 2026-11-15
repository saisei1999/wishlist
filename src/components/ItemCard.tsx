import { useState } from 'react';
import {
  brandName,
  condenseTitle,
  faviconUrl,
  formatUsd,
  itemBrandSpan,
  monogram,
  targetDelta,
  TIER_LABELS,
  type Collection,
  type Item,
} from '../model';

type Props = {
  item: Item;
  collections: Collection[];
  onOpen: (item: Item, trigger?: HTMLElement | null) => void;
  onFetchImage: (item: Item) => void;
  onAddBrand: (item: Item, trigger?: HTMLElement | null) => void;
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
  onAddBrand,
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
  const [faviconBroken, setFaviconBroken] = useState(false);
  const [faviconLoaded, setFaviconLoaded] = useState(false);
  const icon = faviconUrl(item.url);
  const displayTitle = condenseTitle(item.title, item.siteName);
  const shop = brandName(item);
  // Two different brands can appear on one card: the shop it is sold by, and the
  // product's own maker. The shop leads quietly; the product brand is emphasised.
  const product = itemBrandSpan(displayTitle, item.brand);
  const titleTail = displayTitle;

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
            className="card-title card-link"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${item.title} — ${item.url}`}
          >
            <span className="favicon" aria-hidden="true">
              <span className={`favicon-dot plate-${item.color}`}>{monogram(displayTitle)}</span>
              {icon && !faviconBroken ? (
                <img
                  src={icon}
                  alt=""
                  className={faviconLoaded ? 'is-loaded' : ''}
                  onLoad={() => setFaviconLoaded(true)}
                  onError={() => setFaviconBroken(true)}
                />
              ) : null}
            </span>
            <span className="card-title-text">
              {shop ? (
                <>
                  <span className="chip-shop">{shop}</span>
                  <span className="chip-sep">·</span>
                </>
              ) : null}
              {product ? (
                <>
                  <strong className="chip-brand">{product.brand}</strong>
                  {product.rest ? ` ${product.rest}` : null}
                </>
              ) : (
                titleTail
              )}
            </span>
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
          {/* No maker known for this one: offer to name it rather than guess. */}
          {!product && shop ? (
            <button
              type="button"
              className="chip chip-add"
              onClick={(event) => onAddBrand(item, event.currentTarget)}
            >
              + brand
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
