# LumenClip TikTok Studio Analytics companion

This unpacked Chrome extension captures the structured analytics responses that
TikTok Studio already loads in the user's logged-in tab. It sends only the
derived API response to a server-created, post-scoped LumenClip capture job.
TikTok cookies, browser storage, and account credentials are never read or
stored.

## Install for local development

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. In LumenClip, open TikTok Analytics and choose **Sync TikTok Studio**, or open
   one linked post and choose **Import from TikTok Studio**.
5. Choose **Start automatic capture**. LumenClip connects the extension directly;
   there is no pairing code to copy.
6. The companion visits Overview, Viewers, and Engagement for every allowlisted
   post in sequence.
7. Each validated Overview is saved automatically. Later Viewers and Engagement
   responses enrich the same snapshot.

The Overview response includes the platform post ID, creator username, and
photo/video shape. LumenClip uses those fields to persist the canonical public
TikTok URL on both the linked publication and analytics snapshot; the extension
does not scrape a rendered anchor or require the user to paste the link.

The extension keeps a one-year, capture-only device credential. It polls for
pending jobs, while every individual job remains short-lived and explicitly
allowlists the linked TikTok post IDs selected by LumenClip. Clearing the companion
connection removes the device credential from Chrome.
