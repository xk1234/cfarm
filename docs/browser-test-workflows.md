# User journey test workflows

Real end-to-end journeys an actual creator takes in CFarm — organized by the
job they're trying to get done, not by feature. Each journey crosses several
parts of the app and touches live services (Appwrite, KIE, OpenRouter, Rendi,
PostFast, the browser extension, Apify/Pinterest/Pexels). Run them in a browser
against a real environment.

Each journey: **Who / why** → **Path** (the click-path a user follows) →
**Success** (what the user should end up with).

---

## Journey 1 — First run: create a character and generate content
**Who / why:** A brand-new user lands in the app and wants to produce their first
AI UGC image.

**Path:**
1. Open the app → **AI UGC avatars**.
2. **New Character** → give it a name, fill in attributes (or upload a photo and
   auto-extract attributes).
3. Save → the character shows in the sidebar and is selected.
4. In the composer, type a prompt, choose a model + aspect ratio → **Generate**.
5. Generate a couple more; use one result **as a source image** and generate an
   edit from it.

**Success:** A character exists with a preview; several generations sit in the
grid; the user can preview them full-screen; everything is still there after a
refresh.

---

## Journey 2 — The flagship: stand up a daily faceless TikTok automation
**Who / why:** A creator wants a "set it and forget it" pipeline that posts a
fresh slideshow to TikTok every day. This is the core product loop and touches
the most surface area.

**Path:**
1. **Collections** → import a batch of images (Pinterest/Tumblr URL) → let them
   download → caption them.
2. (Optional) **Variable collections** → create word lists (e.g. `zodiac`,
   `occasion`) for dynamic hooks.
3. **Automations** → new automation.
4. Configure: pick the image collection, set the schedule + timezone/posting
   times, write the hook (with `[[slot]]` dynamic tags), body, and CTA text
   items, choose slideshow vs video.
5. **Connect a TikTok account** (PostFast) and attach it to the automation.
6. Set the automation to **Live**.
7. Force-run it once to preview the output; open the automation's recent runs.
8. **Schedule** view → confirm the generated post appears on the calendar.

**Success:** A live automation exists; a forced run produces a real slideshow
(text + selected images rendered, hooks filled from the word lists, no duplicate
image/hook reuse), a result + run are recorded, and the scheduled post shows on
the calendar tied to the connected account.

---

## Journey 3 — Swipe a winning ad and recreate it
**Who / why:** A performance marketer sees a competitor ad, saves it to their
swipe file, studies why it works, and recreates the concept with their own
character.

**Path:**
1. Install the browser extension. Visit a supported platform (TikTok Creative
   Center / Facebook Ads Library / Google Ads Transparency / X) → click **Swipe**
   on an ad.
2. Back in the app → **Swipes** → the ad appears with media + screenshots.
3. Open a **video** swipe → read the auto transcript + UGC aesthetic analysis.
4. Filter/search the swipe file to compare a few saved ads.
5. Go to **AI UGC avatars** → use the swipe as inspiration: set a reference image
   / prompt and run **recreate reference** (or a matching workflow) with a
   character.

**Success:** The ad is saved locally with downloaded media; a video swipe finishes
analysis (transcript + breakdown); the user can browse/filter their swipe file
and produce a new on-brand asset inspired by it.

---

## Journey 4 — Turn a character image into a UGC video
**Who / why:** A creator wants a short talking/motion UGC clip, not just a still.

**Path:**
1. **AI UGC avatars** → select a character → generate (or pick) an image.
2. Run an **image → video** workflow (motion control / pose-variation cut video).
3. Wait through the progress state; the card switches to showing the video.
4. Play it back; download / use it.

**Success:** A video is generated from the image, attached to the character, plays
in the browser, and persists (and cascade-deletes with the generation if removed).

---

## Journey 5 — Produce and post a greenscreen meme video
**Who / why:** A creator makes greenscreen meme content and schedules it.

**Path:**
1. **Greenscreen Memes** → configure the meme (background, text, source) →
   generate.
2. Watch the export go queued → ready; play it.
3. From the exports list, **schedule** it to a social account.

**Success:** A rendered greenscreen video export exists and plays; scheduling opens
the PostFast flow and creates a scheduled post.

---

## Journey 6 — Build a one-off slideshow by hand
**Who / why:** A creator wants a single custom slideshow, not an automation.

**Path:**
1. From a collection or the slideshow flow, assemble slides: pick images, add
   hook/body text with styles, set aspect ratio, add an overlay, pick a sound.
2. Enable "export as video" and render.
3. Open the slideshow viewer and play it; export/download.
4. Optionally schedule/post it.

**Success:** Slides render with correct text/styles/overlays; a playable MP4 +
thumbnail are produced (via Rendi); the slideshow is viewable and postable.

---

## Journey 7 — Research-driven content with knowledge bases + variables
**Who / why:** A creator grounds their automations in real source material and
rotates dynamic copy.

**Path:**
1. **Knowledge bases** → create one → upload sources (PDF/text) → queue a refresh
   → wait for ready.
2. **Variable collections** → create/curate word lists.
3. **Automations** → build an automation that uses the knowledge base context and
   `[[slot]]` variables in its hooks → run.

**Success:** Sources are ingested and refreshed; variables expand in generated
hooks; the automation output reflects the researched material.

---

## Journey 8 — Curate and maintain a content library
**Who / why:** Ongoing housekeeping a heavy user does between campaigns.

**Path:**
1. **Collections** → import more images; re-caption; edit/upscale individual
   images; delete a stale collection (confirm shared images aren't lost).
2. **Assets** → upload outfit/reference assets; run reference import + analysis;
   caption/generate assets.
3. Reuse those assets inside a character generation (attach as prompt inputs).

**Success:** The library stays consistent — imports, captions, edits, and deletes
behave correctly, and assets are selectable in the character composer.

---

## Journey 9 — Scale to multiple automations + accounts, then monitor
**Who / why:** An agency/power user running several content streams at once.

**Path:**
1. Create 2–3 automations targeting different collections/schedules/accounts.
2. Connect multiple social integrations.
3. Let them run (or force-run) across a few days.
4. **Schedule** view → see all posts on the calendar without collisions.
5. **Analytics** → review performance.
6. Adjust one automation (pause it, edit hooks) and confirm the change takes.

**Success:** Multiple pipelines coexist; the calendar shows each account's posts
correctly; analytics render; pausing/editing an automation is reflected
immediately and persists.

---

## Journey 10 — Iterate on a losing automation
**Who / why:** A creator reviews results and tunes an underperformer.

**Path:**
1. **Automations** → open an automation → review its recent runs + generated
   slideshows.
2. Delete weak runs/slideshows.
3. Edit the automation (swap collection, rewrite hooks, change slide count) →
   re-run → compare the new output.
4. If abandoning it, delete the whole automation and confirm its runs/slideshows/
   scheduled posts are cleaned up.

**Success:** The user can inspect, prune, re-generate, and fully remove an
automation and all its downstream artifacts.

---

## Cross-journey things a real user will hit (weave into the above)
- **Empty states** on every view (new account with no data) render helpfully.
- **Reloads mid-journey** never lose data (Appwrite persistence).
- **Provider failures** (KIE/OpenRouter quota or bad input) show a clear,
  actionable message rather than a hang or generic error.
- **Long-running generations** show progress and don't block the rest of the UI.
- **Media everywhere** (thumbnails, previews, exported video) loads from Storage
  and isn't cropped/broken.
- **Navigation** between views mid-task preserves in-progress state where expected.

---

## Suggested run order
Highest coverage-per-minute for real usage:
1. **Journey 2** (daily automation) — exercises the most of the app in one path.
2. **Journey 3** (swipe → recreate) — extension + swipes + character.
3. **Journey 1 & 4** (character create → image → video).
4. **Journey 6** (manual slideshow) + **Journey 5** (greenscreen).
5. **Journey 9 & 10** (scale + iterate) for multi-entity and lifecycle behavior.
6. **Journey 7 & 8** (knowledge/variables + library upkeep).
