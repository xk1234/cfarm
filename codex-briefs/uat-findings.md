# UAT findings — issues found in run outputs (2026-07-07)

Reviewed: 8 UAT runs in `data/automations/runs.json`, rendered slides in `data/slideshows/outputs/`, `data/usage-ledger.json`, `data/image-collections.json`, `data/word-collections/`, `data/swipes/swipes.json`, `data/generated-videos/exports.json`, `data/postfast-posts.json`.

## P0 — output is unusable as-is

### 1. Body slides render the automation TITLE, not generated text
Every run: slide 1 = hook (correct), slides 2–4 literally say "UAT Zodiac lucky charms", "UAT Dedup stress test", etc. Verified visually in `slideshow-6773cd5e.../slide-002.png`. Captions are just the lowercased hook; `hashtags` is `""` on all 8 runs. `generateSlideshowText` either wasn't called or failed and silently fell back to the title.
**Fix:** in `lib/automation-runner.ts` / `lib/slideshow-text-generation.ts` — never fall back to title for body text. If text gen fails, fail the run (or retry once) and record the error on the run record. Add caption + hashtag generation to the same call. Log the OpenRouter failure reason on the plan debug.

### 2. Slot substitution grammar: "POV: you're a aries"
Blind string replace produces "a aries" and lowercase zodiac names on the rendered slide (`slide-001.png`).
**Fix in `lib/hook-expansion.ts`:** (a) a/an correction when the word before a slot is a/an; (b) per-slot casing option (`title` | `lower` | `as-is`), defaulting to title-case for proper-noun-ish collections like zodiac. Add tests: "a aries"→"an Aries", "a birthday" stays.

### 3. `textPlacement: "top"` is ignored
Slide text items specify `textPlacement: "top"` but hooks render vertically centered. `grep textPlacement lib/slideshow-renderer.ts` → no hits: the renderer never reads it.
**Fix:** honor `textPlacement` (top/center/bottom with safe margins) in `renderedSlideSvg`, add a renderer test snapshotting y-positions.

## P1 — data integrity

### 4. Usage ledger keys images by URL, not content hash
Ledger `kind:"image"` keys are `/api/local-assets/.../<file>.jpg`. Collections have no `hash` field at all (roadmap A2.2 not implemented). Re-imported or renamed copies of the same image will evade dedup. Also found duplicate ledger rows for the same image in the same run (e.g. `slot.jpg` twice under one run_id).
**Fix:** implement sha256 `image.hash` on import + backfill script; ledger records hashes; dedupe entries per (run, kind, key) on write.

### 5. Placeholder instructions recorded as hook usage
Ledger contains `kind:"hook"` entries like "create a concise slideshow narrative for the selected topic." — a default-template instruction line, not a hook. `isHookInstruction` filtering isn't applied on the ledger write path.
**Fix:** filter instruction lines before recording hook usage; purge existing instruction entries in the same migration.

### 6. Integration-test residue polluting production data
`data/usage-ledger.json` has 713 entries across ~140 `automation-local-*` automation IDs that don't exist in `automations.json` (repeating 3/4/5/6/12-entry patterns = vitest fan-out). Tests are writing to the real `data/` dir — the harness temp-dir isolation doesn't cover the ledger path (likely hardcoded, not respecting the root override). There's also a leftover "Untitled automation" (`automation-local-5c7c1b0d-...`) in automations.json.
**Fix:** route the ledger path through the same configurable root as other stores; make the test harness fail loudly if any store resolves outside the tmp root; clean the ledger of orphan automation IDs + delete the stray automation.

### 7. `plan.imageCollectionIds` holds names, tripled
e.g. `["UAT Dedup Stress","UAT Dedup Stress","UAT Dedup Stress"]` — collection NAME repeated once per section (hook/content/cta) instead of unique IDs.
**Fix:** store unique collection ids; keep per-section mapping in a separate field if needed.

### 8. Jitter not reflected in scheduledFor
`automation-uat-balloon-calendar` has `jitter_minutes: 15` and the runner reads it (`automation-runner.ts:371`), but the run's `scheduledFor` is exactly on the hour. Runs may have been force-triggered — but then the applied jitter offset should still be persisted on the run for auditability.
**Fix:** persist `jitterAppliedMinutes` (or the jittered target time) on the run record; confirm jitter applies on cron-claimed (non-forced) slots with a test.

## P2 — UAT setup gaps (recipes can't validate their feature yet)

These aren't code bugs; the seeding shortcuts mean 5 of the 8 recipes exercise nothing beyond the golden path:

- **One hook per automation** (`hookCandidates.length === 1`, `selectedHookIndex: 0` everywhere). Hook rotation/dedup is untestable, and with an exclusion window the 2nd run will starve. Seed 5–10 hooks per recipe as written in `docs/uat-automations.md`.
- **All 8 collections share the same 12 Pinterest nature textures** (4 images each, overlapping windows), captioned "UAT HDB Rooms 2" etc. Context matching (A3) can't be validated without descriptive captions; Mei-only binding can't be validated when her "photos" are textures also present in other collections; cross-collection URL-dedup interactions confound the dedup test. Seed real per-industry images with descriptive captions.
- **Features never configured:** `image_selection` undefined on hdb-rooms (context mode untested); `research` undefined on property-market — it fakes research with a `market` word collection; `output_format`/`video_template_id` undefined on curtain-demo — it produced a slideshow, `generated-videos/exports.json` has nothing newer than Jul 4; `auto_post: false` + zero integrations everywhere — `socialStatuses: []`, publish path never exercised (postfast-posts.json unchanged).
- **Mei doesn't exist** — only character "Jade"; no creator collection, no account binding store. The "Mei persona" automation is a plain slideshow automation with "Mei's take:" typed into the hook.
- **`data/swipes/swipes.json` is EMPTY** — the swipe-pipeline automation was hand-seeded; its hooks carry no swipe provenance. Recipe 6 requires actually swiping ads via the extension first.
- Minor: word-collection ids are bare name strings ("market") not generated ids; `occasion` collection is missing wedding/CNY/National Day; dedup-stress collection has 4 images (doc says 8) and has only run once, so exhaustion was never reached.

## Suggested order
1 → 2 → 3 (visible output quality) → 6 (stop test pollution before it worsens) → 4/5/7 (ledger correctness) → 8 → re-seed UAT per P2 and re-run all 8 recipes.
