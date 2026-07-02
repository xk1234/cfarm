# TikTok Creative Center

URL match: `https://ads.tiktok.com/business/creativecenter/*`

Detected platform: `tiktok-creative`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

On TikTok Creative Center pages, the extension uses a specialized Top Ads card detector instead of the generic card matcher.

It searches for Top Ads card wrappers/classes such as:

- `TopadsVideoCard_card`
- `TopadsList_cardWrapper`
- `CommonGridLayoutDataList_cardWrapper`
- `TopadsVideoCard_cardVideo`
- `TopadsVideoCard_cardInfo`
- Links containing `/business/creativecenter/topads/`

Each detected Top Ads card gets an overlaid `✣ Swipe` card button.

## Swipe Button Behavior

Clicking `Swipe` builds a TikTok Creative Center-specific payload and sends it to the background service worker.

The button state changes as follows:

- `✣ Swipe`
- `Saving...`
- `✓ Swiped` on success
- `Server offline`, `Save failed`, or `Extension error` on failure

## Data Collected From The Card

The content script builds a specialized payload:

| Field | Source |
| --- | --- |
| `advertiser` | Hardcoded as `TikTok Top Ads`. |
| `platform` | `tiktok-creative`. |
| `source` | `tiktok-creative`. |
| `sourceUrl` | Top Ads analytics/detail link, falling back to current URL. |
| `title` | Top Ads title fields joined with ` · `. |
| `caption` | Text from the card. |
| `format` | Hardcoded as `video`. |
| `cta` | Hardcoded as `See analytics`. |
| `landingPageUrl` | Top Ads analytics/detail link. |
| `mediaUrl` | Best video URL/poster, falling back to largest image. |
| `metadata.Region` | `region` query param. |
| `metadata.Period` | `period` query param. |
| `metadata.Objective` | First Top Ads title value. |
| `metadata.Industry` | Second Top Ads title value. |
| `stats` | Values from `TopadsVideoCard_cardInfoItem` rows. |

## Analytics Detail Enrichment

If the payload's `sourceUrl` points to a Top Ads detail route, the background worker opens that page in an inactive tab.

It then:

- Waits for the detail page to load.
- Scrapes body text, title, videos, images, links, and script-embedded video URLs.
- Parses metrics such as uploaded date, duration, likes, comments, shares, CTR rank, CVR rank, clicks rank, conversion rank, remain rank, budget level, and industry benchmark.
- Merges those fields back into the payload.
- Closes the background tab.

## Save Flow

The background worker captures the visible tab screenshot and posts the enriched swipe to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- The detector depends heavily on TikTok's current class names.
- `advertiser` is always `TikTok Top Ads`; advertiser extraction is not specific.
- The detail-page analytics scraper is text/regex based.
- Analytics enrichment silently returns partial data if the background tab fails or the page shape changes.
- The extension needs the local app running on port `3000`.
