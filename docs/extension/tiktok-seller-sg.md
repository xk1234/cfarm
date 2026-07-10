# TikTok Seller SG

URL match: `https://seller-sg.tiktok.com/*`

Detected platform: `tiktok-seller`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

On TikTok Seller SG pages, the extension injects buttons only on the inspiration videos page:

```txt
/shoppable-videos/inspiration/videos
```

Within that page, it targets the video list container:

```txt
[data-tid="short_video_inspiration.video-tab.video-list"]
```

and card elements:

```txt
[data-tid="video-player"]
[id^="short_video_"][id$="-wrapper"]
```

## Swipe Button Behavior

Buttons use `cfarm-swipe-card-button` and are appended to each detected inspiration video card. Other Seller SG pages do not show `Swipe` buttons.

## Data Collected

TikTok Seller uses an inspiration-video payload builder.

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

- Seller support is specific to the inspiration videos page.
- Other Seller SG pages intentionally show no buttons.
- Card detection depends on TikTok Seller's `data-tid` attributes and `short_video_*` wrapper IDs.
- TikTok Creative Center analytics enrichment does not run for `tiktok-seller`.
- The extension needs the local app running on port `3000`.
