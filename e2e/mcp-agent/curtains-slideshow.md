# E2E: build and generate a curtains slideshow through MCP

**Executed by:** an AI agent driving the MCP tools.
**Goal:** prove an agent can be asked to create a slideshow automation, edit its
hooks, tone and granular text settings, and generate real slides — end to end,
over the real transport, against the real backend.

**Result vocabulary:** `PASS` (assertion observed), `FAIL` (assertion not met),
`BLOCKED` (could not run — e.g. transport unreachable). `BLOCKED` is never
`PASS`. Report the transport you used (see README).

Record the value of every `→ remember` line; later steps depend on them.

---

## Step 0 — Preconditions

**0.1 Transport reachable.** Issue the `initialize` handshake from the README.
> **Assert:** `result.serverInfo.name === "lumenclip"`.
> On failure: `BLOCKED`. Do not continue.

**0.2 The server can reach its data backend.** Handshaking proves only that the
route is mounted, so issue one real read:

```json
{"name":"lumenclip_automations_list","arguments":{"limit":1}}
```
> **Assert:** a result with an `items` array, and `isError` is absent/false.
> A body of `fetch failed` means the server cannot reach Appwrite — `BLOCKED`,
> and report the endpoint it is configured against.

**0.3 An image collection exists.**

```json
{"name":"lumenclip_collections_list","arguments":{"mediaType":"image","minimumItemCount":1,"limit":20}}
```
> **Assert:** `total >= 1`.
> → remember `COLLECTION_ID` = the id of a collection with the most items.
> Curtain-specific imagery is not required; the test verifies the pipeline, and
> image *relevance* is judged in step 8, not asserted mechanically.

---

## Step 1 — Create (C)

```json
{"name":"lumenclip_automation_create","arguments":{
  "name":"Curtains Buying Guide","kind":"slideshow","status":"paused",
  "requestId":"<unique-per-run>"}}
```
> **Assert:** an automation id is returned.
> → remember `AUTOMATION_ID`.
> Keep `status: "paused"` — a live automation would be picked up by the
> scheduler mid-test.

**Note on `expectedUpdatedAt`:** most mutating tools take an optimistic-lock
timestamp. Re-read the automation with `lumenclip_automation_get` immediately
before each mutation and pass the fresh `updatedAt`. A stale value is a
legitimate conflict error, not a product bug.

---

## Step 2 — Read (R)

```json
{"name":"lumenclip_automation_get","arguments":{"automationId":"<AUTOMATION_ID>"}}
```
> **Assert:** `automation.name === "Curtains Buying Guide"` and `automation.kind === "slideshow"`.
> → remember `UPDATED_AT`, and the `textItems[0].id` of the `hook`, `body` and
> `cta` blocks in `schema.formatting`.
>
> **Do not hardcode text item ids.** They are generated per automation
> (e.g. `text-aw0wwill`), and differ from the ids on older automations
> (`text-body-paragraph`). Always read them from the schema.

---

## Step 3 — Hooks: create

```json
{"name":"lumenclip_automation_hook_upsert","arguments":{
  "automationId":"<AUTOMATION_ID>",
  "hooks":[
    {"text":"[[SLIDE_COUNT]] curtain mistakes that make a room look smaller"},
    {"text":"blackout vs sheer curtains — which one actually suits you"},
    {"text":"the curtain length nobody gets right"}]}}
```
> **Assert:** returned pool `total === 3`.
> → remember `HOOK_ID` = the id of the "curtain length" hook.
>
> `[[SLIDE_COUNT]]` is a runtime variable resolved to the rendered body-slide
> count. It needs no word collection.

---

## Step 4 — Hooks: update, disable, delete (U/D)

**4.1 Update by id** (re-read `updatedAt` first):

```json
{"name":"lumenclip_automation_hook_upsert","arguments":{
  "automationId":"<AUTOMATION_ID>","expectedUpdatedAt":"<UPDATED_AT>",
  "hooks":[{"id":"<HOOK_ID>","text":"the curtain length almost everyone gets wrong"}]}}
```
> **Assert:** the hook with `HOOK_ID` now reads "…almost everyone gets wrong",
> and pool `total` is still 3 — an edit must not append a duplicate.

**4.2 Disable:** `lumenclip_automation_hook_set_enabled` with `enabled: false`.
> **Assert:** that hook has `enabled === false` and is still present. Disabled
> hooks are retained for performance attribution.

**4.3 Delete:** `lumenclip_automation_hook_delete` with `confirmDelete: true`.
> **Assert:** pool `total === 2` and `HOOK_ID` is absent.

---

## Step 5 — Tone

Tone is not exposed by a dedicated tool. Read the automation, patch
`schema.tone` and `schema.prompt_formatting.style`, and send the **complete**
schema back via `lumenclip_automation_schema_update` — it is a whole-schema
replace, so a partial object will drop configuration.

```jsonc
"tone": {"value":"practical and warm, like a decorator who has hung a thousand curtains","preset":"custom"},
"prompt_formatting": {"style":"All text in lowercase. Plain, concrete, no interior-design jargon."}
```

Also point every image slot at `COLLECTION_ID` in the same update:
`schema.image_collection_ids.first_slide.collection`, `.all_slides`, and
`.cta_slide.cta_collection_id`.

> **Assert:** re-reading shows the new `tone.value` and the collection ids.
> Generation fails without an image collection, so this is a precondition for
> step 7 as much as a tone check.

---

## Step 6 — Granular text settings

For each block, using the text item id read in step 2 and a fresh `updatedAt`:

| block | patch |
|---|---|
| `hook` | `wordLengthMin: 6, wordLengthMax: 12, contentDirection: "lowercase curtain hook", textAlign: "center"` |
| `body` | `wordLengthMin: 12, wordLengthMax: 18, fontSize: "9px", contentDirection: "one concrete curtain tip a first-time buyer can act on today"` |
| `cta`  | `wordLengthMin: 5, wordLengthMax: 10, contentDirection: "ask which room they're doing next"` |

```json
{"name":"lumenclip_automation_text_item_update","arguments":{
  "automationId":"<AUTOMATION_ID>","blockId":"body","textItemId":"<BODY_TEXT_ITEM_ID>",
  "expectedUpdatedAt":"<UPDATED_AT>","patch":{ }}}
```
> **Assert:** each patched field reads back with the value you set.

Then set slide counts so there is something to render:

```json
{"name":"lumenclip_automation_formatting_update","arguments":{
  "automationId":"<AUTOMATION_ID>","blockId":"body","expectedUpdatedAt":"<UPDATED_AT>",
  "patch":{"slideCountMode":"static","slideCount":4,"aiImageSelection":true,"overlay":true}}}
```
and the same for `cta` with `slideCount: 1, ctaLocation: "last"`.
> **Assert:** `body.slideCount === 4` and `cta.slideCount === 1` on read-back.

---

## Step 7 — Generate

```json
{"name":"lumenclip_slideshow_generate","arguments":{
  "automationId":"<AUTOMATION_ID>","requestId":"<unique-per-run>"}}
```
This runs the real generator: text generation, visual-concept derivation,
image ranking and selection, then rasterisation. Expect roughly 30–60s.

> **Assert:** a run is returned with `status` not `failed`, and `slideCount === 6`
> (1 hook + 4 body + 1 cta).
> → remember `OUTPUT_ID` (the slideshow id) and the returned `slides` links.
>
> **Assert:** each slide entry carries a `renderedImageUrl`.
> **Assert:** the response includes a `violations` array — word-range misses are
> reported here and must **not** fail the run. A non-empty `violations` with a
> successful run is a PASS, not a FAIL.
>
> On failure, capture the error verbatim. Provider errors carry the real cause
> in `metadata`; a bare message means the diagnostics regressed and that is
> itself a finding.

---

## Step 8 — Verify the output

```json
{"name":"lumenclip_output_get","arguments":{"outputId":"<OUTPUT_ID>"}}
```
> **Assert:** `actualSlideCount === 6`, `bodySlideCount === 4`.
> **Assert:** every slide has non-empty `renderedText` and a `renderedImageUrl`.
> **Assert:** the resolved hook is one of the two surviving hooks from step 4.
> **Assert:** if the hook contains `[[SLIDE_COUNT]]`, the resolved text contains
> the body-slide count (`4`), not the literal token.

**Then actually look at a rendered slide.** Fetch `renderedImageUrl` for slide 2
and view it.
> **Assert:** the text is legible — real glyphs, not `□` tofu boxes. This is the
> only check that catches a missing font in the render environment; no
> programmatic assertion in the suite covers it, because a host with system
> fonts renders fine even when the bundled font is absent.
> **Judge, and report in prose:** does the copy read as the configured tone, and
> is the chosen image plausibly related to the slide's subject? These are
> qualitative — report them, do not fail the run on them.

---

## Step 9 — Clean up

```json
{"name":"lumenclip_automation_delete","arguments":{
  "automationId":"<AUTOMATION_ID>","requestId":"<unique-per-run>","confirmDelete":true}}
```
> **Assert:** the automation no longer appears in `lumenclip_automations_list`.
> This cascades its generated slideshows, runs, queue jobs and draft
> publications. Skip only if handing the run to a human — and say so.

---

## Reporting template

```
transport: connector | http | in-process
backend:   <APPWRITE_ENDPOINT the server is configured against>

step 0 preconditions      PASS/FAIL/BLOCKED
step 1 create             …
step 2 read               …
step 3 hooks create       …
step 4 hooks u/d          …
step 5 tone               …
step 6 text settings      …
step 7 generate           …
step 8 verify output      …
step 9 cleanup            …

qualitative: <tone fidelity, image relevance, anything surprising>
findings:    <product bugs observed, with exact tool + args + response>
```

---

## Known state at time of writing (2026-07-25)

- Steps 1–6 have been observed `PASS` in-process against the VPS backend
  (`http://66.42.56.29/v1`). That is `in-process` transport, so by the rule
  above it is **not** a passing run of this test.
- The deployed endpoint (`https://cfarm-eight.vercel.app/mcp`) **handshakes**
  but every `tools/call` returns `fetch failed`, i.e. the deployed app cannot
  reach its Appwrite backend — step 0.2 is currently `BLOCKED` there. Likely its
  environment still points at the exhausted Appwrite Cloud project rather than
  the VPS, and its `APPWRITE_ENDPOINT` needs updating.
- Steps 7–9 have never been run over a real transport.
