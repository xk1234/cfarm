# CFarm Swipe Saver Extension

This unpacked Chrome extension injects `Swipe` buttons into supported ad pages, saves captured swipe data to the local app, and imports intercepted Tumblr images into local image collections.

## Supported pages

- Facebook Ads Library
- TikTok Creative Center top ads and trends videos
- TikTok
- Twitter/X posts
- Google Ads Transparency Center
- Tumblr post pages through the extension popup image importer

## Local setup

1. Start the app with `npm run dev`.
2. Open Chrome `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select `/Users/yexinkang/Desktop/cfarm/extension`.
6. Visit a supported ad page and click `Swipe`.
7. For Tumblr, visit the post page, reload it with the extension enabled, open the extension popup, select captured images, then import them into an image collection.

Saved records are written to `/Users/yexinkang/Desktop/cfarm/data/swipes/swipes.json`.
Captured screenshots are written to `/Users/yexinkang/Desktop/cfarm/data/swipes/assets`.
Imported Tumblr images are downloaded to `/Users/yexinkang/Desktop/cfarm/data/image-collections/files` and persisted in `/Users/yexinkang/Desktop/cfarm/data/image-collections.json`.
