# Slideshow MCP tools

> Partially implemented. Existing slideshow automations can generate a manual
> draft with `lumenclip_slideshow_generate`. Direct brief-based and explicit
> slide creation remain proposed.

Slideshow workflows use the shared discovery, automation, collection,
operation, output, and publishing tools documented in
[../shared-contracts.md](../shared-contracts.md), plus the two slideshow-native
tools below.

Primary contracts: [Templates](../templates/README.md),
[Automations](../automations/README.md),
[Collections](../collections/README.md),
[Outputs and operations](../outputs/README.md), and
[Accounts and publishing](../publishing/README.md).

## Applicable shared tools

`lumenclip_workspace_get`, `lumenclip_templates_list`,
`lumenclip_template_get`, `lumenclip_automations_list`,
`lumenclip_automation_get`, `lumenclip_collections_list`,
`lumenclip_outputs_list`, `lumenclip_accounts_list`,
`lumenclip_automation_preview`, `lumenclip_automation_create_from_template`,
`lumenclip_automation_save`, `lumenclip_automation_update`,
`lumenclip_collection_save`, `lumenclip_collection_add_assets`,
`lumenclip_automation_run`, `lumenclip_operation_get`,
`lumenclip_output_publish`, and `lumenclip_output_mark_published`.

For slideshow discovery, pass `kind: "slideshow"`. Compatible image collections
use `mediaType: "image"`; word-variable collections use `mediaType: "word"`.

## `lumenclip_slideshow_generate`

Implemented. Runs one existing slideshow automation immediately. Generation is
billable and may wait for text generation and rendering, but it never schedules
or publishes the output. A paused automation can be run manually without
resuming its recurring schedule.

### Input

| Field          | Type   | Required | Description                                                               |
| -------------- | ------ | -------- | ------------------------------------------------------------------------- |
| `automationId` | string | yes      | Existing caller-owned slideshow automation.                               |
| `requestId`    | string | no       | Caller trace key recorded on the run; it is not an idempotency guarantee. |

### Output

Returns the request ID plus concise run summaries:

```json
{
  "automationId": "auto_astrology_info",
  "requestId": "manual-draft-001",
  "runs": [
    {
      "runId": "automation-run-123",
      "slideshowId": "slideshow-123",
      "status": "succeeded",
      "title": "Mercury signs in conflict",
      "hook": "how each mercury sign handles an argument",
      "slideCount": 7,
      "thumbnailUrl": "https://...",
      "outputImages": ["https://..."],
      "createdAt": "2026-07-18T12:00:00.000Z"
    }
  ],
  "skipped": []
}
```

An empty `runs` array is accompanied by a `skipped` reason such as `no_images`.
Provider, collection, hook-variable, generation, and rendering errors surface
as MCP tool errors.

The future natural-language brief form remains planned as a separate expansion
of this tool; it is not accepted by the current implementation.

## `lumenclip_slideshow_create`

Creates a deterministic slideshow from explicit slide content and referenced
media. Scope `lumenclip:generate`. It is asynchronous only when rendering or
media generation is requested.

### Input

| Field                         | Type                     | Required | Description                                                      |
| ----------------------------- | ------------------------ | -------- | ---------------------------------------------------------------- |
| `title`                       | string                   | yes      | Output title.                                                    |
| `aspect_ratio`                | `9:16 \| 4:5 \| 1:1`     | yes      | Shared frame ratio.                                              |
| `font`                        | string                   | no       | Supported workspace font.                                        |
| `slides`                      | object[]                 | yes      | Ordered explicit slides; at least one.                           |
| `slides[].id`                 | string                   | no       | Caller-stable slide ID.                                          |
| `slides[].role`               | `hook \| content \| cta` | no       | Semantic role.                                                   |
| `slides[].text`               | string                   | no       | Primary slide text.                                              |
| `slides[].text_items`         | object[]                 | no       | Explicit text, placement, alignment, size, and style controls.   |
| `slides[].media.resource_uri` | string                   | yes      | Existing collection item, output media, or trusted MCP resource. |
| `slides[].layout`             | string                   | no       | Supported named layout.                                          |
| `slides[].overlay`            | boolean                  | no       | Shared readability overlay.                                      |
| `caption`                     | string                   | no       | Social caption.                                                  |
| `hashtags`                    | string[]                 | no       | Normalized tags.                                                 |
| `render`                      | boolean                  | no       | Produce rendered image assets; default `true`.                   |
| `render_video`                | boolean                  | no       | Also produce a video artifact.                                   |
| `idempotency_key`             | string                   | yes      | Retry-safe key.                                                  |

### Output

When no rendering is requested, returns a ready `output` and `warnings`.
Otherwise returns an operation envelope with `kind: "slideshow.create"` and the
output resource on success. Rendered images use cover cropping to fill the
selected aspect ratio; media bytes are accessed through signed preview links,
not embedded in the tool result.

## Slideshow automation run

Use `lumenclip_automation_run` with a slideshow automation:

```json
{
  "automationId": "auto_astrology_info",
  "requestId": "astro-mercury-001"
}
```

Output is an `automation.run` operation. Manual results remain unpublished and
unscheduled regardless of the automation's live schedule.

## Review and publish sequence

1. Discover a template and image collection.
2. Preview and save a paused automation, or call a slideshow-native tool.
3. Poll `lumenclip_operation_get`.
4. Read `lumenclip://outputs/{id}` and inspect every slide.
5. Resolve account capabilities with `lumenclip_accounts_list`.
6. Publish only through `lumenclip_output_publish` with explicit targets and
   `confirmPublish: true`.
