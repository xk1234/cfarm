# TikTok

URL match: `https://www.tiktok.com/*`

Detected platform: `tiktok`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

On regular TikTok pages, the extension injects only into specific TikTok post surfaces:

- Profile/grid posts: `[data-e2e="user-post-item"]` inside `[id^="grid-item-container-"]` when the card contains a `/@user/video/...` or `/@user/photo/...` link.
- Canonical video/photo pages: the current feed article `article[data-e2e="recommend-list-item-container"]` when it contains `section[data-e2e="feed-video"]`, a `video`, and `[data-e2e="video-desc"]`.

## Swipe Button Behavior

Grid buttons use `cfarm-swipe-tiktok-grid-button`. Feed-page buttons are inserted below the current `section[data-e2e="feed-video"]`.

Clicking a button posts a message to the background service worker with a payload built from the chosen container.

## Data Collected

TikTok uses post-specific payload builders for profile grid posts and canonical feed articles.

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

- No fixed full-page TikTok button is injected.
- Generic card detection is not used for TikTok.
- Feed-page capture is limited to canonical TikTok video/photo URLs where the current article can be identified.
- TikTok Creative Center analytics enrichment does not run for regular TikTok URLs.
- The extension needs the local app running on port `3000`.
