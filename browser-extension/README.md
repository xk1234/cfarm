# LumenClip companion

This Chrome MV3 extension connects a logged-in TikTok session to LumenClip. It
imports TikTok Studio analytics and owns the TikTok comment workflow: capture,
draft review, editing, approval, optional hearts, and sending.

## URL-aware popup

The active TikTok tab determines the task shown in the popup:

- `https://www.tiktok.com/tiktokstudio/content` and Studio analytics report
  pages show the analytics import flow.
- An exact `https://www.tiktok.com/@handle/video/{id}` or
  `https://www.tiktok.com/@handle/photo/{id}` page shows the comment flow for
  that post only. TikTok can redirect slideshow `/video/` URLs to `/photo/`.
- Other pages explain the two supported locations and link back to TikTok
  Studio Content.

The popup includes the full next-step sequence for the detected task. Continue
in LumenClip carries the task and video ID in the URL. A Studio deep link opens
the import dialog and starts discovery automatically. The companion scrolls
the virtualized Studio Content list, collects every post URL exposed by the
logged-in account, and restores the user's scroll position. LumenClip creates
missing publication records under the matching connected account before the
existing private analytics capture begins. No post URLs or IDs need to be
entered manually. A video deep link finds the
matching published or user-linked LumenClip post, opens it, and starts comment
collection. If the account or linked post is missing, Analytics shows the exact
prerequisite instead of dropping the user on the generic overview.

An analytics sync owns one Studio tab only while it is running. Closing that
tab, closing Chrome, or restarting Chrome cancels the local sync instead of
recreating the tab. The cancelled capture stays paused until the user explicitly
chooses **Sync now** again.

## Comment review

Open the extension on an exact TikTok post and choose **Connect this post**,
or start **Collect in extension** from a TikTok post in LumenClip Analytics.
The signed collection is handed to the extension and capture starts
immediately.
Open the extension in **Comments** mode to see every captured comment beside
its drafted response.

- Edit or approve one response at a time.
- **Approve all** requires another confirmation when careful/flagged replies
  are included.
- Only approved drafts can be queued for sending.
- The extension posts queued replies through the logged-in TikTok tab and
  shows queued, sent, or failed state per response.

## Load unpacked

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select `browser-extension`.
4. Open TikTok Studio Content for analytics or one exact TikTok video for
   comments, then follow the steps shown in the popup.

## Content scripts

- `capture-main.js` observes TikTok Studio analytics `fetch` and XHR responses on the existing `tiktokstudio/analytics/*` pages.
- `capture-bridge.js` relays those captured responses to the extension service worker.
- `studio-discovery-helpers.js` and `studio-content.js` discover posts from the virtualized TikTok Studio Content table without reading cookies or browser storage.
- `tiktok.js` runs only on matching TikTok post pages after the worker requests a comments collection or an approved reply.
- `lumenclip-bridge.js` accepts Studio and Comments connection messages only on the configured LumenClip app origins.
