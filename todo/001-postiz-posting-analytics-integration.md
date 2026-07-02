# Task 1: Integrate Postiz Posting And Analytics

Status: open
Priority: 1
Created: 2026-07-02

## Goal

Integrate Postiz so CFarm can publish generated content to connected social channels and pull real posting/analytics data back into the app.

## Findings

Postiz has a public API that can cover the posting and analytics workflow CFarm needs:

- Authentication uses an API key in the `Authorization` header, or OAuth2 tokens for acting on behalf of Postiz users.
- Cloud base URL is `https://api.postiz.com/public/v1`.
- Self-hosted base URL is `https://{NEXT_PUBLIC_BACKEND_URL}/public/v1`.
- Postiz UI calls social accounts "channels"; the API calls them "integrations".
- The create-post endpoint is rate-limited to 90 requests per hour, or 100 per hour on cloud. Batch multiple scheduled posts in one request where possible.
- Each platform has its own `settings.__type` schema. TikTok and X/Twitter need explicit platform settings.
- Media should be uploaded first through the upload endpoint, then referenced in the post payload's `image` array.
- Analytics is split into platform/channel analytics and individual post analytics.

Official API docs:

- API overview: https://docs.postiz.com/public-api/introduction
- List integrations: https://docs.postiz.com/public-api/integrations/list
- Connect channel OAuth URL: https://docs.postiz.com/public-api/integrations/connect
- Find available posting slot: https://docs.postiz.com/public-api/integrations/find-slot
- Upload file: https://docs.postiz.com/public-api/uploads/upload-file
- Create post: https://docs.postiz.com/public-api/posts/create
- List posts: https://docs.postiz.com/public-api/posts/list
- Platform analytics: https://docs.postiz.com/public-api/analytics/platform
- Post analytics: https://docs.postiz.com/public-api/analytics/post
- TikTok settings: https://docs.postiz.com/public-api/providers/tiktok
- X/Twitter settings: https://docs.postiz.com/public-api/providers/x

## Current App Findings

- `components/realfarm-workspace.tsx`
  - `createDraft()` currently returns `undefined`.
  - Generated video flows are not connected to a real publishing or draft workflow.
- `components/realfarm/greenscreen-view.tsx`
  - The visual preview is partially real through client-side canvas chroma-key rendering.
  - `Create` only calls the no-op `onCreate`.
  - `My Videos (99)` is seeded from `data/realfarm.json`, not generated/exported videos.
- `components/realfarm/ugc-ads-view.tsx`
  - The editor state is local-only.
  - Avatar/demo data is partially hardcoded or disconnected from `data/realfarm.json`.
  - `Create` only calls the no-op `onCreate`.
- `components/realfarm/calendar-analytics.tsx`
  - Posting schedule and analytics are UI/mock data today.
  - No Postiz sync or real channel analytics source exists.
- No local `lib/postiz-client.ts`, Postiz API routes, Postiz post mapping DB, generated video publishing state, or analytics cache exists yet.

## Integration Plan

1. Add a server-side Postiz client.
   - Create `lib/postiz-client.ts`.
   - Read `POSTIZ_API_KEY` and `POSTIZ_BASE_URL` from environment variables.
   - Wrap:
     - `GET /integrations`
     - `GET /social/{integration}`
     - `GET /find-slot/{id}`
     - `POST /upload`
     - `POST /posts`
     - `GET /posts?startDate=&endDate=`
     - `GET /analytics/{integration}`
     - `GET /analytics/post/{postId}`
   - Normalize Postiz errors for setup issues, rate limits, upload size, and retryable server errors.

2. Add local persistence for Postiz state.
   - Create `data/postiz-posts.json` or a similar local DB file.
   - Store mapping records:
     - `id`
     - `sourceType` (`greenscreen`, `ugc_ad`, `image`, `swipe`, etc.)
     - `sourceId`
     - `postizPostId`
     - `integrationId`
     - `provider`
     - `status` (`draft`, `scheduled`, `published`, `failed`)
     - `scheduledAt`
     - `releaseUrl`
     - `media`
     - `lastSyncedAt`
     - `analytics`
     - `error`

3. Add app API routes.
   - `GET /api/postiz/integrations`
   - `GET /api/postiz/connect-url?provider=`
   - `GET /api/postiz/find-slot?integrationId=`
   - `POST /api/postiz/upload`
   - `POST /api/postiz/posts`
   - `GET /api/postiz/posts?startDate=&endDate=`
   - `GET /api/postiz/analytics/platform?integrationId=&days=`
   - `GET /api/postiz/analytics/post?postId=&days=`

4. Wire publishing from generated assets.
   - Start with generated videos from Greenscreen and AI UGC once export records exist.
   - Upload the final MP4 to Postiz.
   - Create a Postiz post as `draft` by default for safety.
   - Let the user choose `draft`, `schedule`, or `now`.
   - Persist Postiz response IDs locally.
   - Show a clear failed state when upload/post creation fails.

5. Add platform-specific settings.
   - TikTok: include `__type: "tiktok"`, `title`, `privacy_level`, `duet`, `stitch`, `comment`, `autoAddMusic`, brand toggles, AI disclosure, and posting method.
   - X/Twitter: include `__type: "x"`, `who_can_reply_post`, optional `community`, `made_with_ai`, and `paid_partnership`.
   - Add provider defaults in one shared mapping so UI and API routes do not duplicate schemas.

6. Update UI.
   - Add connected channel selector using `GET /integrations`.
   - Add Postiz setup/status state when env vars or integrations are missing.
   - Add publish controls to generated video/image flows.
   - Replace hardcoded schedule rows with Postiz posts from `GET /posts`.
   - Replace hardcoded analytics cards where possible with platform/post analytics sync.
   - Show Postiz `releaseURL` once a post is published.

7. Add analytics sync.
   - Fetch connected integrations.
   - Fetch platform analytics per integration.
   - Fetch recent posts by date range.
   - Fetch post analytics for tracked Postiz post IDs.
   - Cache data locally with `lastSyncedAt` so the UI can render without blocking.

8. Handle failure modes.
   - `401`: missing or invalid API key.
   - `403`: API key does not own the integration/post.
   - `413`: media was inlined or payload is too large; upload media first.
   - `429`: create-post rate limit; back off and batch schedules.
   - `5xx`: retry with exponential backoff and keep local post state visible.

## Acceptance Criteria

- App can list connected Postiz integrations.
- App can upload a generated image/video asset to Postiz.
- App can create a Postiz draft from a generated asset.
- App can schedule or publish a post when the user explicitly chooses that action.
- Local DB stores Postiz post IDs and integration IDs for generated assets.
- Calendar/Schedule tab can render real Postiz posts for a selected date range.
- Analytics tab can render real platform analytics for connected integrations.
- Individual posted assets can show post-level analytics when Postiz returns them.
- Missing env vars, missing integrations, upload failure, and API rate limits are shown as actionable UI states.
- Existing mock data remains available only as fallback/demo data, not as the source of truth when Postiz is configured.

## Dependencies

- Implement generated video/export persistence first or in parallel:
  - `todo/implement-greenscreen-ugc-export-workflows.md`
- Decide whether CFarm will target Postiz Cloud, a self-hosted Postiz backend, or both through `POSTIZ_BASE_URL`.
- Add a real secret management path for `POSTIZ_API_KEY`; do not expose it to the client.
