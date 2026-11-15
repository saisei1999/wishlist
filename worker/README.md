# Link preview proxy

One Cloudflare Worker that turns a product URL into `{ title, image, siteName }`, so cards can show
the page's own picture without you uploading anything.

## Why a Worker and not the browser

A browser cannot read another site's Open Graph tags — cross-origin rules block it. Something on a
server has to fetch the page. This is that something: no database, no storage of what you saved, no
account, free on Cloudflare's plan (100k requests/day).

## Deploy

```bash
npm install -g wrangler      # or: npx wrangler
wrangler login
npx wrangler deploy --config worker/wrangler.toml
```

Wrangler prints a URL like `https://wishlist-unfurl.<account>.workers.dev`. Open Wishlist →
Settings → Link previews, paste it, save. Nothing else to configure.

## Contract

```
GET /?url=<encoded absolute http(s) url>

200  { "title": "…", "image": "https://…", "siteName": "…" }
400  { "error": "invalid-url" }
405  { "error": "method-not-allowed" }
415  not HTML
502  { "error": "fetch-failed", "detail": "…" }
```

`image` may be `null`; the app then draws the colour plate. The image is hotlinked, never copied.

## Safety

- `http(s)` only; `javascript:`, `file:` and friends are refused before any fetch.
- Loopback, private, link-local and CGNAT address ranges are refused, including on redirects, so the
  Worker cannot be used to probe an internal network.
- Redirects are followed manually, at most three, re-checked at each hop.
- 6 second timeout, 2 MB body cap, HTML content type required, reading stops at `</head>`.
- Nothing is logged about the URL beyond what Cloudflare's own request logs retain.

## If you never deploy it

The app works without the proxy. Pasting a link saves a card with the domain as the title and a
colour plate, with an image field you can fill by hand. The proxy only buys the automatic picture.
