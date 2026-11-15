import { formatUsd, type Item } from '../model';

type Props = {
  items: Item[];
  onReopen: (item: Item) => void;
  onOpen: (item: Item) => void;
};

export function ArchiveView({ items, onReopen, onOpen }: Props) {
  const archived = items
    .filter((item) => item.status !== 'open')
    .sort((a, b) => (b.purchasedOn ?? b.updatedAt).localeCompare(a.purchasedOn ?? a.updatedAt));

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>
            Archive <span className="count">{String(archived.length).padStart(2, '0')}</span>
          </h1>
        </div>
        <p>Bought or dropped. Kept so the list stays honest.</p>
      </div>

      {archived.length === 0 ? (
        <div className="empty">
          <h2>Nothing archived</h2>
          <p>When you mark something bought, it lands here with the date — off the gallery, still on the record.</p>
        </div>
      ) : (
        <ul className="row-list">
          {archived.map((item) => (
            <li className="row-item" key={item.id}>
              <div className="grow">
                <strong>{item.title}</strong>
                <div className="sub">
                  {item.status === 'purchased' ? 'Bought' : 'Dropped'}
                  {item.purchasedOn ? ` · ${item.purchasedOn.slice(0, 10)}` : ''}
                  {formatUsd(item.price) ? ` · ${formatUsd(item.price)}` : ''}
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="button-ghost" onClick={() => onOpen(item)}>
                  Open
                </button>
                <button type="button" className="button-ghost" onClick={() => onReopen(item)}>
                  Put back on the list
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
