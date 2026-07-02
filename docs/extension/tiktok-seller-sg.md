# TikTok Seller SG

URL match: `https://seller-sg.tiktok.com/*`

Detected platform: `tiktok-seller`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

On TikTok Seller SG pages, the extension injects two kinds of controls:

- A fixed bottom-center `Swipe` button attached to `main` or `document.body`.
- Generic card-level `Swipe` buttons on detected ad/card-like elements.

The fixed button exists because TikTok seller pages may not expose clean ad card containers. The generic card scanner still runs afterward and may add per-card buttons when matching cards are found.

## Swipe Button Behavior

The fixed button uses:

- CSS class `cfarm-swipe-fixed`
- Bottom-center placement
- Minimum width of `360px`

Clicking either fixed or card button builds a generic payload and sends it to the background worker.

## Data Collected

TikTok Seller uses the generic payload builder.

It tries to infer:

| Field | How it is inferred |
| --- | --- |
| `advertiser` | Heading/strong/link text inside the selected container, falling back to document title. |
| `platform` | `tiktok-seller`. |
| `source` | `tiktok-seller`. |
| `sourceUrl` | Current page URL. |
| `title` | Best heading, caption excerpt, or document title. |
| `caption` | Text from the selected container. |
| `format` | Based on video/img counts. |
| `cta` | `Shop now`, `Learn more`, or `Inspect Swipe`. |
| `mediaUrl` | Best video URL/poster or largest image/background image. |
| `metadata.Source` | `tiktok-seller`. |
| `metadata.URL` | Current page URL. |

## Save Flow

The background worker captures the visible tab and posts to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- No seller-specific DOM parser exists.
- The fixed button saves `main` or the full body, so captured text can be broad.
- Card buttons depend on generic selectors and may attach to non-ad cards.
- TikTok Creative Center analytics enrichment does not run for `tiktok-seller`.
- The extension needs the local app running on port `3000`.
