# Task: Add Twitter/X Swiping

## Goal

Add CFarm Swipe Saver support for Twitter/X so users can save posts from `x.com` and `twitter.com` into the local swipe file with useful tweet metadata, media, screenshot, and platform filtering.

## Investigation Notes

Attempted to inspect the logged-in Chrome X session. Chrome is running and the active tab title was an X profile page, but DOM inspection through AppleScript failed because Chrome has `Allow JavaScript from Apple Events` turned off.

Observed repo state:

- `extension/manifest.json` does not include `x.com` or `twitter.com`.
- `extension/content.js` has no Twitter/X platform detection.
- Generic card detection would probably work for tweet `article` nodes once the content script runs, but saved records would currently be `unknown`.
- `SwipePlatform` in `lib/swipes.ts` does not include `twitter` or `x`.
- `SwipesView` platform filter does not include Twitter/X.

## Desired Website Behavior

On `x.com` and `twitter.com` pages:

1. Inject a `✣ Swipe` button into each tweet/post card.
2. Prefer tweet article containers over generic cards.
3. Save a canonical tweet URL when a status link is present.
4. Save author/display name/handle when available.
5. Save tweet text as caption.
6. Save image or video media when available.
7. Save visible screenshot through the existing background worker.
8. Mark records as platform/source `twitter`.
9. Avoid injecting buttons into nav/header/sidebar UI.

## Suggested URL Matches

Add to `manifest.json` host permissions and content script matches:

```json
"https://x.com/*",
"https://twitter.com/*"
```

Optional if needed later:

```json
"https://mobile.twitter.com/*"
```

## Suggested Platform Type

Use `twitter` as the internal platform label for both `x.com` and `twitter.com`.

Update `SwipePlatform`:

```ts
export type SwipePlatform =
  | "facebook"
  | "tiktok"
  | "tiktok-creative"
  | "tiktok-seller"
  | "google"
  | "twitter"
  | "unknown"
```

Update platform filter options in `components/realfarm/swipes-view.tsx`.

## Suggested Twitter/X Selectors

These should be verified in Chrome after enabling an inspection route or manually testing the extension:

```js
article[data-testid="tweet"]
article[role="article"]
[data-testid="tweetText"]
[data-testid="User-Name"]
time[datetime]
a[href*="/status/"]
img[src*="pbs.twimg.com/media"]
video
[data-testid="card.wrapper"]
[data-testid="tweetPhoto"]
[aria-label*="Promoted"]
```

## Suggested Content Script Changes

### Platform Detection

```js
if (host === "x.com" || host.endsWith(".x.com") || host.includes("twitter.com")) return "twitter"
```

### Platform Label

```js
case "twitter":
  return "twitter"
```

### Twitter Card Candidates

Add a Twitter-specific branch before generic card candidates:

```js
function twitterCardCandidates() {
  return uniqueElements(
    Array.from(document.querySelectorAll('article[data-testid="tweet"], article[role="article"]'))
      .filter((element) => element instanceof HTMLElement)
      .filter((element) => !element.closest("header, nav"))
      .filter((element) => textFrom(element, 240).length > 20 || element.querySelector("img,video"))
  ).slice(0, 80)
}
```

Then:

```js
if (platform() === "twitter") {
  return twitterCardCandidates()
}
```

### Twitter Payload Builder

Add a specialized payload builder:

```js
function twitterPayload(container) {
  const tweetText = textFrom(container.querySelector('[data-testid="tweetText"]'), 900)
  const userBlock = textFrom(container.querySelector('[data-testid="User-Name"]'), 180)
  const statusHref = Array.from(container.querySelectorAll('a[href*="/status/"]'))
    .map((link) => link.getAttribute("href") || "")
    .find(Boolean)
  const tweetUrl = absoluteUrl(statusHref) || location.href
  const mediaUrl = bestVideo(container) || bestImage(container)
  const timestamp = container.querySelector("time[datetime]")?.getAttribute("datetime") || ""
  const promoted = /promoted/i.test(textFrom(container, 1200))

  return {
    advertiser: userBlock || "Twitter/X",
    platform: "twitter",
    source: "twitter",
    sourceUrl: tweetUrl,
    title: tweetText.slice(0, 90) || userBlock || "Twitter/X post",
    caption: tweetText || textFrom(container, 900),
    format: inferFormat(container),
    cta: "Inspect Swipe",
    landingPageUrl: tweetUrl,
    mediaUrl,
    uploaded_at: timestamp,
    metadata: {
      Source: "Twitter/X",
      URL: location.href,
      TweetURL: tweetUrl,
      Promoted: promoted ? "true" : "false",
    },
    stats: inferTwitterStats(container),
    folder: "No Folder",
  }
}
```

### Twitter Stats Parser

Implement a conservative parser for visible engagement labels:

```js
function inferTwitterStats(container) {
  const stats = {}
  const labelText = Array.from(container.querySelectorAll("[aria-label]"))
    .map((node) => node.getAttribute("aria-label") || "")
    .join(" ")

  const patterns = [
    ["Replies", /(\d[\d,.]*[KMB]?)\s+repl/i],
    ["Reposts", /(\d[\d,.]*[KMB]?)\s+repost/i],
    ["Likes", /(\d[\d,.]*[KMB]?)\s+like/i],
    ["Views", /(\d[\d,.]*[KMB]?)\s+view/i],
  ]

  for (const [label, pattern] of patterns) {
    const match = labelText.match(pattern)
    if (match?.[1]) stats[label] = match[1]
  }

  return stats
}
```

Call `twitterPayload(container)` from `buildPayload()` when `platform() === "twitter"`.

## Suggested App Changes

- Add `twitter` to `SwipePlatform`.
- Add `Platform: twitter` to the Swipes tab filter options.
- Confirm `platformLabel()` in `lib/swipes.ts` maps `twitter` to `twitter`.
- Consider whether Twitter/X posts should be treated as `source: "twitter"` or `source: "x"`; prefer `twitter` for readable continuity unless product copy wants `x`.

## Testing Plan

1. Add `x.com` and `twitter.com` to manifest.
2. Reload the unpacked extension.
3. Open a profile page, home timeline, search results page, and single tweet page.
4. Confirm `✣ Swipe` appears on tweet cards only.
5. Swipe a text-only tweet.
6. Swipe an image tweet.
7. Swipe a video tweet.
8. Swipe a promoted tweet if one is visible.
9. Confirm `data/swipes/swipes.json` records have:
   - `platform: "twitter"`
   - canonical tweet `sourceUrl`
   - author/handle in `advertiser`
   - tweet text in `caption`
   - media URL or screenshot path
   - timestamp in `uploaded_at` when available
10. Reload the Swipes tab and confirm records render and filter under `Platform: twitter`.

## Acceptance Criteria

- Extension runs on `x.com` and `twitter.com`.
- Tweet cards get one `✣ Swipe` button each.
- Swiping a tweet creates a `SwipeRecord` with platform/source `twitter`.
- Tweet URL, author/handle, caption, timestamp, media, and engagement stats are captured when visible.
- Swipes tab can filter Twitter/X records.
- Existing Facebook/TikTok/Google swiping behavior remains unchanged.

## Open Questions

- Should this save all tweets, only promoted tweets, or both?
- Should internal platform be `twitter` or `x`?
- Should `advertiser` be display name, handle, or both?
- Should retweets/reposts save the reposting user or original author?
- Should quote tweets include quoted tweet text/media in metadata?
