# Wishlist — specification

Status: implemented in this repository. Written before the build, kept as the contract.

## 1. Product

A personal wish list that beats a Notion database on four specific complaints:

1. It should not become an endless undifferentiated list.
2. Pictures should appear without manual uploading.
3. Priority must exist, so "what do I buy next" has an answer.
4. Items need tags, and things need containers (a birthday, a move, a project).

One user. No account, no sync, no server database.

## 2. Non-goals

Accounts, shareable or claimable lists, price alerts and automation, price history, automatic
tagging, native apps, Obsidian sync, and any book/film progress tracking (that is stillroom's job).

## 3. Model

```
Item
  id            string (uuid)
  title         string (required, <=160)
  url           string? https only
  image         string? absolute https URL, hotlinked not rehosted
  siteName      string? from the unfurl result
  price         number? current price in USD
  wasPrice      number? previous / before-sale price in USD
  targetPrice   number? the price he would actually pay
  why           string? one line, "why I want it"
  notes         string? free text
  tags          string[]
  collectionIds string[]
  tier          'next' | 'soon' | 'someday'
  order         number  manual ordering inside a tier
  status        'open' | 'purchased' | 'dropped'
  purchasedOn   string? ISO date
  color         string  palette key for the fallback plate
  createdAt     string  ISO
  updatedAt     string  ISO

Collection
  id, name (required, <=80), createdAt
```

Money is USD, stored as a number. Currency beyond USD is a note, not a field, in v1.

## 4. Rules

- **One item type.** A wish is a wish: a thing, an experience, a vague intent with a link.
- **Priority** is a tier plus a manual position inside it. The "Next buy" strip shows exactly one
  item: the lowest-ordered open item in the `next` tier.
- **Money is never implied.** A missing price shows nothing, not `$0`. `targetPrice` renders as a
  delta ("$7 over target") so an unusable field still says something true.
- **Archive, don't delete.** Purchased or dropped items leave the gallery, keep their record, and
  show in Archive with the date. Deleting is a separate, confirmed action.
- **Pruning is a prompt, not a purge.** Once per calendar month the app offers to review open items
  untouched for more than 90 days. Nothing is removed without an explicit choice.
- **Nothing is silently replaced.** Restore validates the whole file first and replaces only after
  confirmation; a failed restore leaves the existing library untouched.
- **The proxy is untrusted.** Anything it returns is validated before it is stored, and a missing
  or failing proxy degrades to the colour plate, never to a broken layout.

## 5. Capture

Four surfaces, one destination list:

1. **Paste** — a link field on the Wants screen; pasting a URL fills the capture dialog and starts
   the unfurl.
2. **`Ctrl/⌘ K`** — quick capture dialog from anywhere in the app.
3. **Bookmarklet** — opens the app with `?capture=<url>`; the app prefills and unfurls.
4. **Web Share Target** — the PWA manifest registers `/share-target`; the service worker receives the
   shared URL, stores it as a pending capture, and the app picks it up on load. Supported on Android
   and desktop Chromium. iOS Safari has no share target; an iOS Shortcut against the same worker
   endpoint is a later addition.

Capture asks for exactly one optional thing: *why I want it*.

## 6. Link previews

Cloudflare Worker (`worker/`), no database.

```
GET /?url=<encoded https url>
200 { title, image, siteName }
400 invalid url / non-http scheme
415 not HTML
502 fetch failed, timeout, or oversized body
```

Guards: http(s) only, no redirects to private or link-local address ranges, 6s timeout, 2 MB body
cap, `text/html` only, image URL must be absolute https and is never rehosted. The client stores
title, image and site name against the item and never re-fetches on every render.

## 7. Screens

| Screen | Contents |
|---|---|
| Wants | Search, filter (tier, tag, collection), sort, "Next buy" strip, square gallery, prune banner |
| Item editor | Side pane. Title, link, image, reason, price / was / target, tier, tags, collections, notes, delete |
| Collections | List with counts, create, rename, delete (items survive) |
| Archive | Purchased and dropped items with dates, restore to open |
| Settings | Link previews proxy URL and status, export, restore, storage status |

Navigation: Wants · Collections · Archive, with a ⚙ entry for Settings. No fake workspace.

## 8. Accessibility floor

Non-negotiable, carried from the stillroom audit:

- `Escape` closes the editor and the dialogs; focus moves into the editor when it opens and returns
  to the trigger when it closes.
- Interactive targets are at least 44×44 CSS px, or have a 44px hit area.
- Body and secondary text meet WCAG AA (4.5:1) against their real background.
- No native `confirm()`; a focus-trapped, labelled dialog instead.
- Status, tier and price are never conveyed by colour alone.
- `prefers-reduced-motion` removes all transitions.

## 9. Data safety

IndexedDB database `wishlist`, version 1, stores `items`, `collections`, `meta`. Every write is a
single transaction; failures surface as visible errors and never as a silent success. Export writes
a `{format:"wishlist", version:1, exportedAt, items, collections}` envelope; restore validates
format, version, field types, duplicate ids and size (5 MB) before replacing.

## 10. Release gate

`npm test` and `npm run build` pass, the acceptance walkthrough in §11 works in a real browser at
390px and 1440px, and the Pages deploy serves from `main`.

## 11. Acceptance walkthrough

1. Paste a product URL with the proxy configured → a card appears with the page's image and title.
2. Without a proxy → the same flow saves a titled colour plate, no error shown.
3. Set an item to Next buy with a target below its price → the strip shows it and the card reads
   "$7 over target".
4. Drag a card above another inside Soon → order survives a reload.
5. Mark an item purchased → it leaves the gallery and appears in Archive with today's date.
6. Reload with a collection filter applied → the filter is restored.
7. Export, clear the site's storage, restore → identical library, identical order.
8. Open the editor, press Escape → it closes, focus returns to the card.
9. Tab through the gallery at 390px → every control is reachable, nothing is clipped.
