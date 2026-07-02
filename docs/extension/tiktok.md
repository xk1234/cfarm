# TikTok

URL match: `https://www.tiktok.com/*`

Detected platform: `tiktok`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

On regular TikTok pages, the extension injects:

- A fixed bottom-center `Swipe` button attached to `main` or `document.body`.
- Generic card-level `Swipe` buttons on matching content cards/articles.

This gives the user a way to save the currently visible TikTok context even when the page does not have predictable ad-card markup.

## Swipe Button Behavior

The fixed button uses `cfarm-swipe-fixed` and sits at the bottom center of the viewport.

Card-level buttons use `cfarm-swipe-card-button` and are appended to detected cards.

Clicking a button posts a message to the background service worker with a payload built from the chosen container.

## Data Collected

TikTok uses the generic payload builder.

| Field | How it is inferred |
| --- | --- |
| `advertiser` | Heading/strong/link text, falling back to document title or `tiktok`. |
| `platform` | `tiktok`. |
| `source` | `tiktok`. |
| `sourceUrl` | Current page URL. |
| `title` | Heading, caption excerpt, or document title. |
| `caption` | Text from the selected container. |
| `format` | `video` if a `video` element exists, otherwise image/carousel/unknown. |
| `cta` | `Shop now`, `Learn more`, or `Inspect Swipe`. |
| `mediaUrl` | Video URL/poster or largest image/background image. |
| `metadata.Source` | `tiktok`. |
| `metadata.URL` | Current page URL. |

## Save Flow

The background worker captures a PNG screenshot of the visible tab and posts it with the swipe payload to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- No TikTok-specific ad extraction exists for regular `www.tiktok.com`.
- Fixed-button saves can include broad page text if `main` is large.
- Card detection is generic and may attach buttons to content that is not an ad.
- TikTok Creative Center analytics enrichment does not run for regular TikTok URLs.
- The extension needs the local app running on port `3000`.
