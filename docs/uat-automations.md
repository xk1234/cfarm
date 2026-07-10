# UAT automations — real recipes to verify the new setup

Set these up in the app after the matching epic lands, let them run, and check output by hand. Ordered roughly by roadmap order. `[[slot]]` = word-collection slot (Epic A1 syntax).

---

## 1. Zodiac lucky charms (A1 combinatoric hooks)

- Word collections: `zodiac` (12 signs), `charm` (bracelet, brooch, anklet, pendant, jade ring)
- Hooks:
  - `why [[zodiac]] girls always end up the luckiest`
  - `the [[charm]] every [[zodiac]] needs before 2027`
  - `POV: you're a [[zodiac]] and someone gifts you a [[charm]]`
- Images: your charm product collection
- Schedule: 2×/day

**Pass if:** each run shows a different zodiac/charm combo; run detail shows the template + substitutions; after ~60 runs combos start recycling only when genuinely exhausted; hook text reads naturally (no raw `[[...]]` leaking into slides).

## 2. HDB room ideas (A3 context images + A2 image dedup)

- Collection: 30+ interior photos captioned by room ("scandi living room", "small bedroom with platform bed", "dark kitchen"...)
- Hooks: `5 [[room]] ideas that make your HDB look expensive`, `your [[room]] is boring, here's why` with word collection `room` (living room, bedroom, kitchen, toilet, balcony)
- Image selection mode: `context`

**Pass if:** a "bedroom" hook run uses only bedroom photos; match rationale visible on run detail; same photo doesn't appear again within the exclusion window; when it must reuse, the run shows a reuse warning.

## 3. Property market pulse (A4 knowledge base + research)

- Knowledge collection `SG property market`: manual evergreen entries (your agency's positioning, districts you cover, commission model) + refresh queries: `singapore property cooling measures`, `URA private home price index`, `HDB resale prices this month`, `mortgage rates singapore` (refresh every 24h, entries expire 48h)
- Link collection to the automation, mode: hooks + text
- Hooks seeded generic: `buyers are doing this before the next announcement`

**Pass if:** KB fills with dated, sourced facts after the first refresh; generated hooks reference something that actually happened this week (verify against Google, and check the run detail lists which KB entries were injected); refresh runs at most once per 24h (check `last_refreshed_at`); if you kill the research key, refresh errors are recorded but runs keep working from manual/evergreen entries and show a `stale` flag once research entries expire.

## 4. Curtain demo videos (A5 video templates)

- Template: `hook_demo` — hook overlay → curtain install/close-up demo clip → CTA
- Assets: 5–6 short demo clips, 3 CTA lines
- Hooks: `the curtain trick landlords don't want you to know`, `day/night curtains explained in 15 seconds`

**Pass if:** mp4 renders 9:16 with readable overlay text; run sits in `rendering` then flips to `ready`; post publishes only after ready; different demo clip across consecutive runs.

## 5. Balloon occasions calendar (A8 scheduling + A1)

- Word collection: `occasion` (wedding, birthday, baby shower, CNY, National Day, proposal)
- Hooks: `[[occasion]] balloon setups that broke our group chat`, `what $80 vs $800 [[occasion]] balloons look like`
- Schedule: 3 slots/day, jitter ±15min, min gap 90min vs your other automations on the same account

**Pass if:** actual post times differ from slot times by ≤15min and vary daily; no two posts on the same account within 90min; nothing double-posts even when a run is slow; pausing the automation stops slots immediately.

## 6. Wall hacking swipe→automation (B1–B3 pipeline)

- Swipe 10–15 SG reno/wall-hacking ads from FB Ads Library via the extension
- Set brand profile (your reno service, audience, tone)
- On 3 best swipes: generate hooks/script → send to a new `wall-hacking` automation

**Pass if:** re-swiping the same ad bumps "seen" instead of duplicating; transcription + tags appear on swipe detail; generated hooks land in the automation with swipe provenance visible; search finds a swipe by a phrase from its transcription.

## 7. "Mei" the charm girl (A6/A7 creator binding + persona)

- Create character Mei, generate 15+ images of her wearing/holding charms
- Bind one TikTok account → Mei's creator collection; give her a persona (bubbly, superstitious, Sims-style routine)
- Point automation #1's image source at her collection for that account

**Pass if:** every post on the bound account shows only Mei; captions read in her voice (compare against an unbound account's captions); her status chip changes through the day per her routine; chatting with her stays in character.

## 8. Dedup stress test (A2, deliberately starved)

- Clone automation #5 but with a tiny collection (8 images), run 3×/day
- Let it run ~4 days

**Pass if:** first ~2.5 days no repeats; after exhaustion it reuses least-recently-used images and flags the run; hooks keep rotating independently of image exhaustion; nothing crashes.

---

Suggested rollout: run 1 & 8 first (hooks + dedup are the foundation), then 2, 5, 3, 6, 4, 7 as each epic lands. Keep all of them pointing at a burner/draft account until 5 (scheduling) passes.
