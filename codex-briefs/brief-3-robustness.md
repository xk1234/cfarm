# Task: Robustness + dedup for cfarm

Work in the current repo. Verify with `npx tsc --noEmit` frequently. Do NOT run vitest. Do not commit. This is a refactor — behavior must stay identical apart from added timeouts.

## 1. Shared HTTP helper with timeout
- Create `lib/http.ts`: `fetchWithTimeout(url, init?, { timeoutMs = 60000 })` using `AbortSignal.timeout`, and `fetchJson(...)` which additionally checks `res.ok` (throwing an error that includes status + a truncated body snippet) and safely parses JSON (clear error on non-JSON bodies instead of a raw SyntaxError).
- Adopt it in ALL external fetches in lib/: `kie-image.ts`, `kie-video.ts`, `rendi-ffmpeg.ts`, `slideshow-text-generation.ts` (fix the uncaught `response.json()` there), `deepl-translate.ts`, `pexels-search.ts`, `pinterest-search.ts`, `postfast-client.ts`, `openrouter-models.ts`, and file-download helpers. Choose sensible timeouts: ~30s for JSON APIs, ~120s for media downloads.

## 2. Generic poll helper
- Create `lib/poll.ts`: `pollUntil<T>(fn, { intervalMs, maxAttempts, description })` returning the first non-null/terminal result, throwing a descriptive timeout error otherwise.
- Replace the three hand-rolled poll loops in `lib/kie-image.ts`, `lib/kie-video.ts`, `lib/rendi-ffmpeg.ts` with it. Keep existing interval/attempt counts.

## 3. Consolidate duplicated micro-helpers
Helpers like `clean`, `readString`, `readRecord`, `isRecord`, `sleep` are redefined ~47 times across lib/ and app/api. Create `lib/guards.ts` exporting canonical versions (inspect the copies first; if variants differ in behavior, export the variants under distinct names rather than silently changing semantics). Replace local definitions with imports across lib/ and app/api. Mechanical change — no behavior change.

## 4. (Only if straightforward) Deduplicate KIE download helpers
`downloadRemoteImageToLocalAsset` (kie-image.ts) and `downloadCharacterVideo` (kie-video.ts) are near-identical; extract a shared download-to-local-asset helper. Skip if it turns risky.

Add small unit tests for `lib/http.ts` error shaping and `lib/poll.ts` (fake timers) if fast to write.
