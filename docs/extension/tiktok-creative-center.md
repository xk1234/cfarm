# TikTok Creative Center

URL matches:

- `https://ads.tiktok.com/business/creativecenter/*`
- `https://ads.tiktok.com/creative/creativeCenter/*`

Detected platform: `tiktok-creative`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

On TikTok Creative Center pages, the extension uses specialized card detectors instead of the generic card matcher.

For Top Ads, it searches for card wrappers/classes such as:

- `TopadsVideoCard_card`
- `TopadsList_cardWrapper`
- `CommonGridLayoutDataList_cardWrapper`
- `TopadsVideoCard_cardVideo`
- `TopadsVideoCard_cardInfo`
- Links containing `/business/creativecenter/topads/`

Each detected Top Ads card gets an overlaid `✣ Swipe` card button.

For Creative Center trends video pages such as `/creative/creativeCenter/trends/video`, it searches for cards with:

- A `View details` control.
- `Video views` text.
- A creator follower count.
- A video or thumbnail image.

Each detected trends video card gets a `✣ Swipe` button inserted immediately under the video/thumbnail block.

When a trends video card is swiped, the extension clicks that card's `View details` control first. It waits for the in-page detail modal, scrapes the player and stats panel, closes the modal, and then saves the swipe payload.

## Swipe Button Behavior

Clicking `Swipe` builds a TikTok Creative Center-specific payload and sends it to the background service worker.

The button state changes as follows:

- `✣ Swipe`
- `Saving...`
- `✓ Swiped` on success
- `Server offline`, `Save failed`, or `Extension error` on failure

## Data Collected From The Card

The content script builds a specialized Top Ads payload:

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
| `landingPageUrl` | Best external destination link when found, otherwise the Top Ads analytics/detail link. |
| `mediaUrl` | Best video URL/poster, falling back to largest image. |
| `metadata.Region` | `region` query param. |
| `metadata.Period` | `period` query param. |
| `metadata.Objective` | First Top Ads title value. |
| `metadata.Industry` | Second Top Ads title value. |
| `stats` | Values from `TopadsVideoCard_cardInfoItem` rows. |

For trends video cards, the payload is:

| Field | Source |
| --- | --- |
| `advertiser` | Creator name, from avatar alt text or the text before the follower count. |
| `platform` | `tiktok-creative`. |
| `source` | `tiktok-creative`. |
| `sourceUrl` | TikTok post URL from the detail modal when available, otherwise the view-details URL/current trends URL. |
| `title` | Detail-modal caption when available, otherwise thumbnail caption alt text, creator, or `TikTok trending video`. |
| `caption` | Detail-modal caption when available, otherwise thumbnail caption alt text/card text. |
| `format` | Hardcoded as `video`. |
| `cta` | Hardcoded as `View details`. |
| `landingPageUrl` | TikTok post URL from the detail modal when available, otherwise the view-details URL/current trends URL. |
| `mediaUrl` | Direct detail-modal video URL when available, otherwise best video URL/poster or largest image. |
| `source_video_url` | Direct detail-modal video URL when available. |
| `time` | Detail-modal player duration in seconds when available. |
| `metadata.Region` | `region` query param. |
| `metadata.Period` | `period` query param. |
| `metadata.Followers` | Visible follower count. |
| `metadata.TikTok URL` | Detail-modal `View on TikTok` link. |
| `metadata.Time period` | Detail-modal data overview time period. |
| `stats.Video views` | Visible video views value. |
| `stats.Followers` | Detail-modal creator followers. |
| `stats.Median views` | Detail-modal median views. |
| `stats.Engagement` | Detail-modal summary engagement. |
| `stats.Organic video views` | Detail-modal data overview organic views. |
| `stats.Engagement rate` | Detail-modal data overview engagement rate. |
| `stats.6-second video views` | Detail-modal data overview six-second video views range. |
| `stats.Length` | Detail-modal player duration as a string. |

## Analytics Detail Enrichment

If the payload's `sourceUrl` points to a Top Ads detail route, the background worker opens that page in an inactive tab.

It then:

- Waits for the detail page to load.
- Scrapes body text, title, videos, images, links, and script-embedded video URLs.
- Parses metrics such as uploaded date, duration, likes, comments, shares, CTR rank, CVR rank, clicks rank, conversion rank, remain rank, budget level, and industry benchmark.
- Merges those fields back into the payload, including a destination landing page when the detail page exposes one.
- Closes the background tab.

## Save Flow

The background worker captures the visible tab screenshot, attempts landing-page mobile/desktop screenshots when a safe landing URL is available, and posts the swipe to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- The detector depends heavily on TikTok's current class names.
- `advertiser` is always `TikTok Top Ads`; advertiser extraction is not specific.
- Trends video cards depend on visible `View details`, `Video views`, and follower text.
- Trends modal enrichment depends on the current in-page modal shape, especially the `View on TikTok` link, `.time-duration`, caption container, summary `section` nodes, and `TopContentVideos-ModalContentInfo` metric rows.
- The detail-page analytics scraper is text/regex based.
- Analytics enrichment silently returns partial data if the background tab fails or the page shape changes.
- The app inserts a processing record first; video transcription and UGC analysis can complete after the save response.
- Landing-page screenshots are best-effort and can fail without blocking swipe creation.
- The extension needs the local app running on port `3000`.
