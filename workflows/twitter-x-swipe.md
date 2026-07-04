# Twitter/X Swipe Extension Test

## Target

Use this workflow to verify the CFarm Swipe Saver extension can save a Twitter/X post:

`https://x.com/jforjacob/status/1937633268079210776`

## Preconditions

1. Start or confirm the local app is running at `http://localhost:3000`.
2. Load the unpacked Chrome extension from `/Users/yexinkang/Desktop/cfarm/extension`.
3. Confirm `extension/manifest.json` includes both `https://x.com/*` and `https://twitter.com/*`.
4. Use a Chrome profile that can open the target X post. If X shows a login wall or unavailable post state, the extension can only capture that visible page state.
5. If you are using a command-line temporary Chrome profile, verify the unpacked extension actually loaded before debugging selectors. A missing `✣ Swipe` button with a valid `article[data-tweet-id]` can mean Chrome did not auto-inject the unpacked extension in that launch.

## Manual Extension Test

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Reload on `CFarm Swipe Saver`.
4. Open `https://x.com/jforjacob/status/1937633268079210776`.
5. Wait for the tweet article to finish rendering.
6. Confirm exactly one `✣ Swipe` button appears on the tweet article, not in nav/sidebar UI.
7. Click `✣ Swipe`.
8. Confirm the button changes to `Saving...`, then `✓ Swiped`.
9. Open `data/swipes/swipes.json`.
10. Confirm the newest record has:
    - `platform: "twitter"`
    - `source: "twitter"`
    - `sourceUrl: "https://x.com/jforjacob/status/1937633268079210776"`
    - tweet text in `caption`
    - author/display name/handle in `advertiser`
    - `uploaded_at` when the post timestamp is visible
    - `mediaUrl` when the post contains visible image/video media
    - `screenshotPath` populated from the visible tab capture
11. Open the app Swipes tab and filter `Platform: twitter`.
12. Confirm the new swipe is visible. If the record exists in JSON but not the UI, check whether `screenshotPath` or `mediaUrl` is missing because `listSwipes()` filters records without captured media.

## Automated Checks

Run:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:$PATH npm test -- extension/content.test.ts
```

This verifies:

- Manifest registration for `x.com` and `twitter.com`.
- Host detection maps both domains to `twitter`.
- A representative tweet article builds a `twitter` swipe payload with canonical status URL, caption, author, timestamp, media URL, and visible engagement stats.

## Debugging Guide

If no button appears:

1. Confirm the extension was reloaded after manifest edits.
2. Confirm the target page URL starts with `https://x.com/` or `https://twitter.com/`.
3. Inspect the page for `article[data-testid="tweet"]` or `article[role="article"]`.
4. On logged-out X status pages, inspect for `article[data-tweet-id]`.
5. If X changed its DOM, update `twitterCardCandidates()` in `extension/content.js` and add a fixture to `extension/content.test.ts`.
6. If manual script injection works but automatic extension injection does not, reload the unpacked extension from `chrome://extensions` in the same Chrome profile and reload the X tab.

If the button saves but the record is incomplete:

1. Check the newest JSON record in `data/swipes/swipes.json`.
2. If `sourceUrl` is wrong, inspect status links matching `a[href*="/status/"]`.
3. If `caption` is empty, inspect `[data-testid="tweetText"]`.
4. If `advertiser` is empty, inspect `[data-testid="User-Name"]`.
5. If `mediaUrl` is empty, inspect visible `img[src*="pbs.twimg.com/media"]` or `video` nodes.
6. If the record does not appear in the UI, confirm `screenshotPath` or `mediaUrl` exists.

If saving fails:

1. Confirm `http://localhost:3000/api/swipes` responds.
2. Check the extension service worker console for `CFARM_SAVE_SWIPE` errors.
3. Check app terminal logs for `/api/swipes` POST errors.
4. Confirm Chrome granted the extension permission to capture the visible tab.

## Live Debug Notes

The logged-out page for this target currently renders the post as `article[data-tweet-id="1937633268079210776"]` with visible text lines instead of the usual `article[data-testid="tweet"]`, `[data-testid="tweetText"]`, and `[data-testid="User-Name"]` nodes.

The extension parser should therefore support both:

- logged-in / timeline DOM: `article[data-testid="tweet"]`, `article[role="article"]`
- logged-out status DOM: `article[data-tweet-id]`
