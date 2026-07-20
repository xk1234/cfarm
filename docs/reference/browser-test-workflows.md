---
title: "User journey test workflows"
---

End-to-end browser journeys for the current LumenClip product. They are organized by
the job a user is trying to complete rather than by component. Run them against
an environment with the relevant Appwrite and provider configuration.

For automated browser setup, see [../../e2e/README.md](../../e2e/README.md).
For the endpoint calls behind each journey, see
[backend-endpoints.md](backend-endpoints.md).

Each journey contains a path and a concrete success condition. Provider-backed
steps should also be exercised with a missing key or failed upstream response.

## Journey 1 — Create a scheduled slideshow automation

**Goal:** Turn a reusable collection into a recurring slideshow pipeline.

1. Open **Collections** and create/import an image collection.
2. Caption the images; verify captions persist after refresh.
3. Optionally create variable collections for hook slots.
4. Open **Automations** and create a slideshow automation.
5. Select the collection, configure hook/body/CTA sections, schedule/timezone,
   language, and slideshow/video output.
6. Connect or select a PostFast account.
7. Save the automation, set it live, and generate one manual draft.
8. Open the generated slideshow and inspect its text, images, caption, and
   publication status.
9. Open **Schedule** and confirm future automation slots are projected.

**Success:** The automation and collection persist; the manual run creates a run
and result without an automatic publication date; scheduled slots target the
selected account and timezone.

## Journey 2 — Review, edit, and mark a slideshow published

**Goal:** Exercise the generated-content lifecycle without relying on automatic
publishing.

1. Open an automation's recent runs.
2. Open a generated slideshow.
3. Edit title/caption/hashtags.
4. Replace one image with another unused image from the automation's configured
   collections.
5. Remove a content slide while keeping at least one slide.
6. Choose **Mark as published** from the not-published status control.
7. Attempt another edit or deletion.

**Success:** Metadata and slide changes update both result and run views. Marking
published records publication evidence and blocks later destructive edits.

## Journey 3 — Publish or schedule through PostFast

**Goal:** Send prepared content to an explicit connected account.

1. Open a ready slideshow or generated video.
2. Open its publishing flow.
3. Select an integration and choose draft, post-now, scheduled, or manual.
4. For scheduled mode, choose an explicit date/time.
5. Confirm the item appears in **Schedule** with the correct account/platform.
6. Cancel one scheduled item from the calendar.

**Success:** PostFast receives media and copy, local output publication state is
updated, the calendar merges local/remote records without duplicates, and
cancellation removes both the remote schedule and its local publication record.

## Journey 4 — Produce a greenscreen meme export

**Goal:** Produce a reusable short video and take it through export state.

1. Open **Greenscreen Memes**.
2. Choose a greenscreen source and image collection/background.
3. Configure text and layout.
4. Start an export and watch `queued -> processing -> ready`.
5. Play the finished media and open the publishing flow.

**Success:** The generated-video record persists, queue position disappears when
ready, media plays from Storage, and published/scheduled exports cannot be
deleted.

**Known gap:** The workspace `onCreate` callback is currently documented as a
no-op in `STATE.md`; record the failure until that gap is fixed rather than
mistaking the preview for a completed export.

## Journey 5 — Curate collections and assets

**Goal:** Maintain the reusable content library used by automations.

1. Import more images into an existing collection and verify URL/hash
   deduplication.
2. Caption one image, then caption a full small collection.
3. Edit or upscale an image and save the resulting URL where the UI permits.
4. Create image and video collections; verify media-type filtering in selectors.
5. Upload an asset and edit its caption.
6. Upload an MP3/WAV through the sound picker and verify it appears after reload.
7. Delete a stale collection and verify unreferenced imported files disappear
   without breaking remaining collections.

**Success:** Collection/asset records persist in `permanent_assets`, media loads
through `/api/local-assets/**`, and shared file cleanup does not remove bytes
still referenced elsewhere.

## Journey 6 — Run X or Threads automation

**Goal:** Configure and generate native text-platform content.

1. Open **Automations** and create an X or Threads automation.
2. Set niche, audience/promise, output type, generation voice, media policy,
   publishing integration, and schedule.
3. Derive the content brief.
4. Generate a draft from a topic or discovered trend candidate.
5. Review the run's posts, plan, benchmark result, and review warnings.
6. Publish an approved single post through its configured integration.
7. Reload and verify the run remains in automation history.

**Success:** Definitions persist in `x_automations`, runs persist as
`outputs/source_key=x_automation_run`, recent-use memory updates, and publishing
state is reflected in the run and schedule.

## Journey 7 — Monitor multiple accounts

**Goal:** Validate calendar and analytics behavior across several pipelines.

1. Create two or three automations with different schedules and integrations.
2. Generate/schedule content across them.
3. Open **Schedule** and filter by account, platform, status, automation, and
   source type.
4. Confirm projected slots, queued work, failures, manual actions, scheduled
   posts, and published posts use distinct lifecycle states.
5. Open **Analytics**, select accounts/range, and trigger refresh.
6. Confirm unsupported platform metrics are not shown as misleading zero rows.

**Success:** Cross-account items are attributed correctly, filters are stable,
snapshots persist, and analytics capability labels match each provider.

## Journey 8 — Team access and private demos

**Goal:** Verify settings data and workspace read-sharing boundaries.

1. Invite a second email from team settings.
2. Accept the invitation while logged in as that user.
3. Verify the member can read shareable outputs but cannot mutate the owner's
   automations or private collections.
4. Upload a settings demo video as the owner.
5. Verify the owner can stream it and an unrelated user cannot.

**Success:** `workspace_members` and Appwrite Teams agree on accepted state,
shareable output reads work, private writes remain owner-only, and demo bytes
are owner-protected.

## Cross-journey checks

- Empty states are useful and do not throw on a new workspace.
- Refreshing never loses persisted records.
- Loading indicators appear for generation, rendering, syncing, and upload.
- Missing provider keys produce actionable errors rather than hangs.
- Media supports thumbnails and byte ranges where required.
- Manual generation remains `not_published` and unscheduled by default.
- A scheduled or published output cannot be deleted through an alternate UI.
- Disconnected PostFast integrations disappear from selectors and are removed
  from automation targets.
- No UI/API response exposes Appwrite or provider credentials.

## Suggested run order

1. Journey 1 (collection -> automation -> result).
2. Journeys 2 and 3 (content lifecycle and publishing).
3. Journey 7 (calendar and analytics across accounts).
4. Journey 6 (X/Threads generation and publishing).
5. Journeys 4 and 5 (video export and library maintenance).
6. Journey 8 (multitenancy and private media).
