# AI Reply Extension — Implementation Spec

**Goal:** Extend the existing CFarm Chrome extension so it can, on the user's own published posts (TikTok / Instagram / X / Threads), read the **top comments**, generate **context-aware AI replies** (the model sees both the original comment **and** the full slideshow/post it belongs to), surface them in an inline UI for one-click send, and pace sends with **anti-ban randomization**.

**Design stance (non-negotiable, from prior research — see `docs/` memory):** replies are **human-in-the-loop by default** (draft → user clicks Send). A fully-autonomous mode may exist behind an explicit opt-in toggle, but the rate limiter + randomized pacing are the backstop, not the safety mechanism. Only reply to comments on the **user's own** posts (this is compliant engagement; reply-guy automation on strangers' posts is out of scope for this spec).

**Decision already made:** build this **inside the existing extension** (`extension/`), not a new one. Keep it isolated via separate content-script + adapter modules and a namespaced message protocol (details in §6). Swipe code paths must remain byte-identical.

---

## 0. Files touched / added

**App (Next.js):**
- ADD `app/api/replies/resolve-post/route.ts` — CORS-open, resolves a live post URL → slideshow/post content (mirrors the no-auth `/api/swipes` pattern).
- ADD `app/api/replies/draft/route.ts` — CORS-open, generates AI replies for a batch of comments.
- ADD `app/api/replies/log/route.ts` — CORS-open, records sent replies (dedup + analytics).
- ADD `lib/reply-generation.ts` — the AI reply prompt + structured-output call.
- ADD `lib/reply-log.ts` — sent-reply store (`data/replies.json`) for dedup + rate accounting.
- EDIT `lib/publishing.ts` — **close the post-URL gap** (§2): persist platform post id/permalink at publish time.
- EDIT `lib/postfast-posts.ts` — add `platformPostId` field; populate `releaseUrl`.

**Extension:**
- ADD `extension/reply-adapters.js` — per-platform DOM registry (comment extraction, reply-box driving).
- ADD `extension/reply-content.js` — the reply content script (UI + orchestration).
- ADD `extension/reply-content.css` — inline panel styling.
- EDIT `extension/manifest.json` — new `content_scripts` entry, `alarms` permission, `threads.net` + `instagram.com` hosts.
- EDIT `extension/background.js` — new namespaced message handlers + the rate-limit token bucket (lives here, not in content scripts).
- EDIT `extension/popup.html` / `popup.js` / `popup.css` — reply settings + queue status.
- ADD `extension/reply-content.test.ts` — mirror `content.test.ts` conventions.

Swipe files (`content.js`, `platform-adapters.js`, `content.test.ts`) are **not** edited.

---

## 1. Existing architecture (read first)

- Extension is MV3. `extension/platform-adapters.js` is a declarative registry (`globalThis.CFARM_PLATFORM_ADAPTERS`, per-site `matches({host})` + selectors). `extension/content.js` (1,550 lines) is the swipe UI. `extension/background.js` (644 lines) is a message hub; its `onMessage` switches on `message.type` (e.g. `CFARM_SAVE_SWIPE`) and POSTs to `http://localhost:3000/api/swipes`.
- The extension→app endpoint template is `app/api/swipes/route.ts`: `dynamic = "force-dynamic"`, wide-open CORS (`Access-Control-Allow-Origin: "*"`, `GET/POST/OPTIONS`), **no auth** — designed to be called from content scripts on third-party pages. New reply endpoints follow this exact pattern.
- Generated slideshow content lives in `ResultRecord` (`lib/results.ts:42-55`) + `ResultSlideshowPayload` (`lib/results.ts:23-32`: `caption`, `hashtags`, `prompt`, `slides`). Per-slide text: `SlideshowSlide.textItems[].text` (`lib/slideshow-renderer.ts:7-40`). The **hook** is not a dedicated field — recover it from the joined `AutomationRunRecord.plan.hook` (`lib/automation-runner.ts:125-161`, runs stored in `runs.json`) or from `GeneratedSlideshowBenchmark.slides[]` where `role: "hook"` (`lib/slideshow-benchmarks.ts:90-103`).
- Published posts → `PostFastPostRecord` (`lib/postfast-posts.ts:32-50`), `sourceType`+`sourceId` link back to the slideshow/run. Publish seam is `publishPost` (`lib/publishing.ts:73-125`).
- Platform→account map: `PostFastSocialIntegration` (`lib/postfast-client.ts:51-55`, `provider` + `integration_id`), fetched live via `GET /api/postfast/integrations`.

---

## 2. Prerequisite: close the "live post → slideshow" gap

**Problem:** nothing today maps a live TikTok/IG/X post URL back to the generated slideshow. `publishPost` captures only PostFast's internal `postfastPostId`; `PostFastPostRecord.releaseUrl` exists in the type but is **never populated**. The extension standing on a live post page has no way to ask "what's the content behind this post?".

**Fix (do this first — it's small and unblocks everything):**

1. In `lib/postfast-posts.ts`, add `platformPostId?: string` to `PostFastPostRecord`.
2. In `lib/publishing.ts` `publishPost`, after the PostFast create call, extract the platform-native id and permalink if the PostFast response provides them and persist onto the record (`platformPostId`, `releaseUrl`). PostFast's `GET /social-posts/analytics` requires a `platformPostId` and its post objects may expose the permalink — if the create response lacks it, add a lightweight follow-up sync (a `syncPublishedPostUrls()` helper called from the existing analytics fetch path) that backfills `releaseUrl`/`platformPostId` for records missing them.
3. **Resolution strategy in `resolve-post` must be tolerant** because URL backfill can lag:
   - **Primary:** exact match on `releaseUrl` / `platformPostId` (normalize URL: strip query params, trailing slash, lowercase host).
   - **Fallback:** fuzzy match the live post's caption text (extension extracts it from the DOM) against `ResultSlideshowPayload.caption` for the user's recent posts on that provider — normalized-Levenshtein ≥ 0.9 or hashtag-set overlap. Return `matchConfidence: "exact" | "fuzzy" | "none"`.
   - If `none`, the extension still works but the AI reply runs in "post-context-unknown" mode (comment-only) — see §4.

---

## 3. "Top comments only" — definition & extraction

**Definition (configurable, sensible defaults):** a comment is eligible iff it is a **top-level** comment (not a nested reply-to-reply) AND ranks in the **top N by like count** on the post. Defaults: `topN = 5`, `minLikes = 3`, exclude comments authored by the account itself, exclude comments already replied to by the account (detected via the reply log AND by scanning the DOM for an existing reply from the account under that comment).

Extraction lives in each platform adapter (`extension/reply-adapters.js`), shape mirrors the swipe registry:

```js
globalThis.CFARM_REPLY_ADAPTERS = [
  {
    id: "tiktok",
    matches({ host }) { return host.endsWith("tiktok.com") },
    // Locate the comment list container on a video page.
    commentListSelector: "[data-e2e='comment-list']",
    // Given the list root, return CommentNode[] (top-level only).
    extractComments(root) { /* returns CommentNode[] */ },
    // Drive the reply box for a given comment node and submit text.
    // MUST NOT auto-submit — see §5 (returns a submit() thunk the UI calls on click).
    prepareReply(commentNode, text) { /* returns { fill(), submit() } */ },
    // Detect an existing reply by the account under this comment.
    hasOwnReply(commentNode, accountHandle) { /* boolean */ },
  },
  // instagram (host includes instagram.com), x/twitter, threads (threads.net / threads.com)
]
```

```ts
type CommentNode = {
  platformCommentId: string | null   // from DOM data attrs where available
  authorHandle: string
  authorName: string
  text: string
  likeCount: number
  isTopLevel: boolean
  domRef: Element                     // anchor for injecting the reply UI + driving the box
}
```

**Selection function (in `reply-content.js`, platform-agnostic):**
```
eligible = comments
  .filter(c => c.isTopLevel)
  .filter(c => c.likeCount >= cfg.minLikes)
  .filter(c => c.authorHandle !== account.handle)
  .filter(c => !alreadyReplied(c))        // reply-log + hasOwnReply()
  .sort((a,b) => b.likeCount - a.likeCount)
  .slice(0, cfg.topN)
```

Platforms lazy-load comments — the adapter's `extractComments` must handle the visible set; the content script scrolls the comment container a bounded number of times (jittered, see §5) to load enough to pick a stable top-N, then stops. Never infinite-scroll the whole thread.

---

## 4. AI context-aware reply generation

### 4.1 Endpoint `POST /api/replies/draft`

Request (from extension background worker):
```ts
{
  postUrl: string,
  provider: "tiktok" | "instagram" | "x" | "threads",
  accountHandle: string,
  postCaptionFromDom?: string,          // used for fuzzy resolution + fallback context
  comments: { platformCommentId: string|null, authorHandle: string, text: string, likeCount: number }[]
}
```

Server flow:
1. `resolvePost(postUrl, provider, postCaptionFromDom)` (§2) → `{ matchConfidence, slideshow?: {...} }`.
2. Build **post context** for the model:
   - hook (from run/benchmark join), caption, hashtags, full ordered slide texts (`slides[].textItems[].text`), niche/voice preset (join through automation → the simplified X/Threads voice presets from `lib/x-post-presets.ts`, else the slideshow tone).
   - If `matchConfidence === "none"`: post context = `postCaptionFromDom` only, and the prompt is told the post body is partially unknown.
3. For each comment, call `generateReply()` (`lib/reply-generation.ts`) — ONE structured-output call per **batch** (all comments in a single call, array output) using the model registry (`lib/realfarm-generation-model-registry.ts` — add a `replyGeneration` use case, default a fast cheap model with a Sonnet fallback).
4. Return per-comment drafts + the resolved post title so the UI can show what it's replying about.

Response:
```ts
{
  matchConfidence: "exact" | "fuzzy" | "none",
  postTitle: string,
  replies: {
    forCommentId: string|null,
    forAuthorHandle: string,
    text: string,
    skip: boolean,          // model may decline (spam/hostile/nonsensical comment)
    skipReason?: string
  }[]
}
```

### 4.2 Prompt design (`lib/reply-generation.ts`)

System prompt (encode as constants):
- Role: "You are the creator replying to comments on your own {provider} post. Write a single short reply per comment, in the creator's voice."
- **Full post context block:** hook, caption, ordered slide texts, niche. This is what makes replies context-aware — the model can reference the actual content ("yeah slide 3 covers exactly that").
- Voice: reuse the voice preset system. Platform formatting caps: TikTok/IG ≤ 150 chars, X ≤ 240, Threads ≤ 2 short lines, 0–2 emoji.
- **Hard rules:** never invent facts/numbers not in the post; never include links; don't be sycophantic or repeat the comment back; vary sentence openings across the batch (anti-fingerprint — identical reply shapes are a detection + spam signal); if a comment is hostile/spam/bot/nonsense, set `skip: true` rather than engaging.
- Per-comment user message includes the comment text, author handle, like count.

Structured output schema: array of `{ forCommentId, text (minLength 1, maxLength per platform), skip (bool), skipReason }`. Validate + one repair retry (slideshow pattern in `lib/slideshow-text-generation.ts:147-287`): reject over-length, links, or empty non-skipped replies → re-prompt with the specific error.

**Batch de-dup:** after generation, if two replies are >0.8 similar (normalized), regenerate the later one with an instruction to differ — keeps a burst of replies from looking templated.

---

## 5. Anti-ban measures

All pacing/quota logic lives in the **background service worker** (only it sees all tabs). Two MV3 constraints: the worker is ephemeral (killed ~30s idle) so **all counters persist in `chrome.storage.local`, never in memory**; use **`chrome.alarms`**, never `setTimeout`, for scheduled sends.

### 5.1 Randomized spacing (the headline requirement)
- **Minimum gap between two sends (any platform):** random in `[90s, 240s]`, freshly jittered each time (uniform, not a fixed value). Never send two replies back-to-back.
- **Per-post burst cap:** at most `maxRepliesPerPostPerSession` (default 3) even if top-N is 5 — replying to *every* top comment on a post at once is a bright-line bot signal. Spread the rest to a later session.
- **Human-shaped jitter:** before each `submit()`, add a short randomized "compose delay" (fill the box, wait `[1.5s, 6s]` random, then send) so the DOM timing between focus→type→submit isn't machine-instant.
- **Typing simulation (optional, recommended):** the adapter's `fill()` sets the reply text via simulated input events with small random inter-key delays rather than pasting the whole string atomically.

### 5.2 Volume caps (token buckets in `chrome.storage.local`)
- Per-platform **per-hour** cap (default 8) and **per-day** cap (default 40), each a separate rolling window.
- Global per-day cap across all platforms (default 80).
- Caps are user-editable in the popup but hard-clamped to safe maxima in code (e.g. day ≤ 60/platform) so a mis-set field can't nuke an account.

### 5.3 Active-window + quiet-hours gating
- Only auto-advance the send queue during configured active windows (default the playbook windows: 8–10a, 12–1p, 5–7p, 7:45–9:15p local) and never after a configurable quiet hour (default 10pm). Outside windows, drafts still generate and queue; sends hold.

### 5.4 Behavioral hygiene
- **Never fully autonomous by default.** Default mode = draft appears inline, user clicks Send. The queue/rate-limiter applies even in manual mode (prevents a user from firing 20 clicks in 10s).
- Autonomous mode (opt-in toggle, default OFF): the worker releases queued sends respecting all of the above; still one at a time with the randomized gap.
- **Dedup:** never reply to the same `platformCommentId` twice (check `lib/reply-log.ts` before drafting and before sending). Also skip if `hasOwnReply()` sees an existing reply from the account.
- **Vary content:** enforced at generation (§4.2) — no identical/near-identical reply text within a rolling window (log stores a hash).
- **Fail-safe stop:** if the adapter can't find the reply box, or a send appears to fail (no optimistic reply node appears within a timeout), pause the whole queue and surface an error in the popup rather than retry-hammering.
- **Kill switch:** popup toggle that halts all queued sends immediately and clears the alarm.

---

## 6. Extension integration (keeping it maintainable)

### 6.1 Manifest — additive only
```jsonc
// permissions: add "alarms"
// host_permissions: add "https://www.instagram.com/*", "https://*.threads.net/*", "https://www.threads.net/*", "https://threads.com/*"
// content_scripts: add a SECOND entry (do not touch the swipe entry)
{
  "matches": ["https://x.com/*","https://twitter.com/*","https://www.instagram.com/*","https://www.tiktok.com/*","https://*.threads.net/*","https://threads.com/*"],
  "js": ["reply-adapters.js","reply-content.js"],
  "css": ["reply-content.css"],
  "run_at": "document_idle"
}
```
The two content scripts never import each other and share nothing but the background message bus. `reply-content.js` reads `globalThis.CFARM_REPLY_ADAPTERS`; `content.js` reads `globalThis.CFARM_PLATFORM_ADAPTERS`. No global name collisions.

### 6.2 Namespaced message protocol
Prefix every new message type with `CFARM_REPLY_` so the existing `background.js` switch stays unambiguous:
- `CFARM_REPLY_RESOLVE_AND_DRAFT` — content → bg → `POST /api/replies/draft` (bg does the fetch so CORS/localhost stays in one place, matching the swipe pattern). Returns drafts.
- `CFARM_REPLY_ENQUEUE_SEND` — content → bg: queue a `{tabId, platformCommentId, text, provider, accountHandle}` for send under rate limits.
- `CFARM_REPLY_QUEUE_STATE` — bg → content/popup: current queue + next-send countdown + quota remaining.
- `CFARM_REPLY_EXECUTE` — bg → content: "you're cleared to send this one now" → content calls the adapter's `submit()` and reports `CFARM_REPLY_SENT` (which bg logs via `POST /api/replies/log` and decrements buckets).
- `CFARM_REPLY_STOP_ALL` — popup → bg: kill switch.

If `background.js` grows past ~1k lines, split the service worker into modules (`"type": "module"`) with `background/swipe.js` + `background/reply-queue.js` — later refactor, not a prerequisite.

### 6.3 The send loop (background)
```
on CFARM_REPLY_ENQUEUE_SEND: push to queue in chrome.storage.local
chrome.alarms tick (every ~30s):
  if manual mode: only send items the user explicitly confirmed (flagged confirmed:true)
  if within active window && not quiet hours && buckets have room && now >= nextAllowedSendAt:
    pop next item → send CFARM_REPLY_EXECUTE to its tab
    on CFARM_REPLY_SENT: log, decrement buckets, set nextAllowedSendAt = now + rand(90..240)s
```

---

## 7. UI changes

### 7.1 Inline panel (`reply-content.js` + `reply-content.css`)
On a supported **own-post** page (detect: the resolve-post call returns a match, or the page is the account's own post — gate so the panel never appears on strangers' posts):
- A small floating **"CFarm Replies"** launcher button (bottom-right, visually distinct from the swipe button — different color/label so the two features never look like one).
- Click → panel listing the selected **top comments** (author, text, like count), each with:
  - the AI **draft reply** in an editable textarea (user can tweak before sending),
  - a **Send** button (queues via rate limiter; shows "queued — next send in ~2m" state),
  - a **Skip** button, and the model's `skipReason` shown inline when it declined.
- Panel header shows: resolved post title + `matchConfidence` badge ("matched to: <slideshow title>" / "post context unknown — replying from caption only").
- A **Regenerate** button per comment and a **Regenerate all** (re-calls draft).
- Live **quota strip**: "X/8 this hour · Y/40 today · next send ~2m" fed by `CFARM_REPLY_QUEUE_STATE`.
- **Mode toggle** in the panel: *Manual (default)* vs *Auto* (auto only appears if enabled in popup; shows a confirm the first time).

### 7.2 Popup (`popup.html/js/css`)
Add a **Replies** section (tab or collapsible), separate from swipe controls:
- Enable replies (per platform checkboxes).
- Top-comment settings: `topN`, `minLikes`.
- Rate limits: per-hour, per-day, global-day (with the hard-clamp note).
- Active windows + quiet hour.
- Autonomous mode toggle (default OFF, with a warning line).
- Kill switch button ("Stop all queued replies").
- Queue status readout.

---

## 8. Tests

Mirror `extension/content.test.ts` (jsdom fixtures of comment DOM) and app `vitest` conventions:
1. `reply-adapters.test` — per platform: `extractComments` returns top-level only with correct like counts; `hasOwnReply` detects an existing account reply; `prepareReply` returns fill/submit thunks and does **not** auto-submit.
2. Selection — top-N by likes, min-likes filter, self-exclusion, already-replied exclusion.
3. Rate limiter (background) — never sends below the min gap; respects hourly/daily/global buckets across simulated alarm ticks; counters survive a worker "restart" (reload from storage); quiet-hours/active-window gating; kill switch drains the queue.
4. `resolve-post` — exact URL match, fuzzy caption match ≥ threshold, `none` fallits back to caption-only; URL normalization.
5. `reply-generation` (mocked LLM) — batch output validated; over-length/link/empty repaired in one retry; hostile comment → `skip:true`; near-duplicate replies regenerated.
6. `publishing.ts` — publish now persists `platformPostId`/`releaseUrl`; backfill sync populates missing ones.
7. Message protocol — `CFARM_REPLY_*` handlers don't collide with `CFARM_SAVE_SWIPE`; swipe flow unaffected (run existing `content.test.ts` unchanged — it must stay green).

---

## 9. Commit sequence
1. App: close the post-URL gap (`publishing.ts`, `postfast-posts.ts`) + `resolve-post` route + tests.
2. App: `lib/reply-generation.ts` + `reply-log.ts` + `draft`/`log` routes + tests.
3. Extension: `reply-adapters.js` (+ tests) for one platform first (X — simplest DOM, and its own API rules make own-post replies clearly fine).
4. Extension: `reply-content.js` + CSS + inline panel (manual mode only).
5. Extension: background rate-limiter + queue + `chrome.alarms` + tests.
6. Extension: popup settings + kill switch.
7. Add remaining platform adapters (TikTok, Instagram, Threads).
8. Autonomous mode toggle (last, behind the opt-in).
9. Manual verification: on a real own X post, load top 5 comments → drafts reference the actual post content → send one → confirm ~90–240s enforced gap before the next, quota strip decrements, reply logged, and a second run skips the already-replied comment.

## 10. Scope guardrails
- Own posts only. The panel must not render on posts the account didn't author (gate on resolve-match or author-handle check).
- No links in replies, ever (also dodges X's $0.20 link premium if X API is ever used instead of DOM).
- Manual is the default; autonomous is opt-in and still fully rate-limited.
- Randomized gaps + per-post burst caps are mandatory, not configurable-to-zero (hard floor in code).
