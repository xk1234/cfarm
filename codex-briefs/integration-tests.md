# cfarm — Integration test plan (real-world industry fixtures)

Companion to `next-level-roadmap.md`. Tests are vitest, run locally (NOT in the Codex VM — native bindings broken there; Codex should still write/update them). No real network: every external host (OpenRouter, PostFast, KIE, Rendi, Firecrawl, DeepL, Pexels) is mocked at fetch level with recorded fixture responses.

## Industry → fixture assignment

Each industry exercises a distinct code path. Curtains and wall hacking overlap with interior design as full fixtures, so they're scoped to the one feature they test best.

| Fixture | Role | Epics covered |
|---|---|---|
| `interior-design` | Primary slideshow fixture: image-rich, room-captioned images | Golden path, A2 image dedup, A3 context images |
| `property-sales` | Data changes weekly (prices, rates, cooling measures) | A4 research hooks, A8.6/B5 analytics loop |
| `lucky-charms` | Astrology/zodiac word collections + UGC persona wearing product | A1 combinatoric hooks, A6/A7 creator binding & persona |
| `balloon-art` | Occasion/seasonal demand (weddings, CNY, National Day) | A8 scheduling/jitter/retry, A1 occasion collections |
| `curtains` | Physical product demo clips | A5 video templates only |
| `wall-hacking` | Competitor-heavy SG reno niche, lots of FB ads to swipe | B1/B2/B3 swipe pipeline only |

## Harness (build first)

- [ ] `test/integration/harness.ts`: (a) temp data dir per test — all json stores + asset dirs pointed at a tmp root (the runner already accepts `postfastRootDir`/root inputs; extend where paths are hardcoded); (b) `mockFetch(routes)` — host-pattern → fixture response, records call log for assertions; (c) seeded RNG injected via the existing `random` params (`chooseImages`, `selectRandomIndex`); (d) frozen clock via Luxon `Settings.now`; (e) fixture loaders from `test/fixtures/<industry>/` (images = tiny generated PNGs, not real photos).

## Tests

- [ ] **IT-1 Golden path slideshow run** (`interior-design`): seed automation (hooks, schedule due "now" SGT, collection of 20 captioned room images, auto_post on) → invoke the cron handler → assert: run record created & claimed once, slide PNGs rendered to disk, hook came from the list, PostFast mock called exactly once per integration with correct mediaItems, run `socialStatuses` = published, ledger entries (image hashes + hook key) written.
- [ ] **IT-2 No repeats across runs** (`interior-design`, A2): run the same automation 5×: no image hash reused while pool lasts; on pool exhaustion, LRU fallback picked and reuse-warning flag set on the run; hook never repeats within the exclusion window.
- [ ] **IT-3 Combinatoric hooks** (`lucky-charms`, A1): template `"{zodiac} girls, this {charm} is why your luck changed"` + zodiac(12) & charm(4) word collections → 10 runs: substitutions persisted on plan, no template+substitution combination repeats, plain (non-template) hooks still work unchanged.
- [ ] **IT-4 Context image selection** (`interior-design`, A3): mode `context`; generated text about "small bedroom" → mocked ranking response picks a bedroom-captioned image (assert prompt sent to OpenRouter contained the captions list); when top match is in the dedup exclusion window, second-best is chosen; match rationale persisted on the run.
- [ ] **IT-5 Knowledge base + research refresh** (`property-sales`, A4): knowledge collection with manual evergreen entries + refresh config; mocked Firecrawl returns rate-cut news → cron refresh distills facts into KB entries with expiry; run's generation prompt contains fresh entries (assert entry ids persisted on plan); second refresh within `every_hours` does NOT refetch (single Firecrawl call in log); Firecrawl 500 → KB unchanged, error recorded on collection, run still succeeds; all research entries expired → run succeeds on manual entries with `knowledge: "stale"` flag. Runner makes zero research-backend calls itself.
- [ ] **IT-6 Video template render** (`curtains`, A5): `hook_demo` template (curtain demo clip + hook overlay + CTA) → Rendi mock returns async job; run enters `rendering`, poll completes → `ready`; publish is NOT called before `ready`, called after; output mp4 path on the result record.
- [ ] **IT-7 Creator binding & persona** (`lucky-charms`, A6/A7): account bound to creator "Mei" → run sources images only from Mei's creator collection (assert every chosen hash ∈ collection); an image outside the collection in the same automation is rejected/warned; caption prompt includes Mei's `speaking_style`; `GET /api/characters/[id]/status` returns activity consistent with frozen clock + routine.
- [ ] **IT-8 Scheduling semantics** (`balloon-art`, A8): Asia/Singapore timezone slots with jitter ±10min — jitter stable per run (stored at claim); two automations posting to one account respect `min_gap_minutes` (second skips to next tick); two overlapping cron invocations claim a slot exactly once; publish failure retries with backoff on later ticks then marks `failed` after N attempts.
- [ ] **IT-9 Swipe pipeline end-to-end** (`wall-hacking`, B1–B3): extension-shaped `POST /api/swipes` payload saved with assets; SAME ad posted again → no duplicate record, `last_seen_at`/`times_seen` bumped (B2 longevity); mocked transcription+analysis complete with suggested_tags; `POST /api/swipes/[id]/generate` with brand profile returns hooks/angles/script (strict-JSON mock); send-to-automation appends hooks via `schemaWithAutomationHooks` with `{source:"swipe", swipe_id}` provenance; swipe search finds the record by a transcription phrase.
- [ ] **IT-10 Analytics loop** (`property-sales`, A8.6/B5): analytics fixture ingested → engagement-by-hour computed, suggested times exposed (and NOT auto-applied to schedule); ledger + provenance join resolves a published post back to its source hook and swipe; winner score for swipes is deterministic against the fixture and unit-documented.

## Rules

- Every test asserts on the mock call log (which external APIs were hit, how many times) — catches accidental real-network or duplicate-call regressions.
- Deterministic: seeded RNG + frozen clock; a test that passes must pass 100 consecutive runs.
- Each IT maps 1:1 to roadmap epics; when an epic lands, its IT lands in the same change.
