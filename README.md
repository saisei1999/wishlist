# Wishlist

A local-first wish list. Capture a link, get a card with its picture, tag it, sort it into a collection, and decide what to buy next.

Single user. No accounts. Your data lives in this browser and exports as one JSON file you hold.

## Run

Requires Node.js 20+.

```bash
npm install
npm run dev      # http://127.0.0.1:5180
npm test         # unit tests
npm run build    # type-check and build
```

Link previews need the Cloudflare Worker in `worker/`. Without it the app still works: cards fall back to a colour plate with a monogram. Set the proxy URL in Settings → Link previews.

## What it does

- **Capture** by pasting a link, pressing `Ctrl/⌘ K`, a bookmarklet, or the phone share sheet.
- **Cards** with title, image, price, and a one-line *why I want it*.
- **Priority tiers** — Next buy / Soon / Someday — with drag ordering, and one single "Next buy" strip.
- **Collections** (many-to-many, no nesting) and **tags**.
- **Archive** for bought items, plus a monthly nudge about anything older than 90 days.
- **Export / restore** a versioned JSON backup.

Deliberately absent: accounts, sharing, price alerts, price history, auto-tagging, native apps.

See [docs/SPEC.md](docs/SPEC.md) for the full specification and [worker/README.md](worker/README.md) for the link-preview proxy.

## Data and privacy

Everything is stored in this browser's IndexedDB under the site origin. Clearing browser data removes it; export regularly. Link previews send only the URL you paste to your own Worker, which fetches the page and returns title, image and site name — nothing about your list leaves the machine.
