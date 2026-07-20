# Video MCP tools

> Video automation/output/collection discovery, safe updates, status reads, and
> publishing are callable. Server-side execution of a saved video automation,
> first-class video generation, and character training remain deferred until
> the public video runner/schema are stable.

There is no proposed `lumenclip_video_generate` tool. Videos use the common
automation contract so provider names, model settings, and internal rendering
services do not leak into MCP.

## Applicable tools

Complete input/output contracts live in
[../shared-contracts.md](../shared-contracts.md):

Use-case owners are [Templates](../templates/README.md),
[Automations](../automations/README.md),
[Collections](../collections/README.md),
[Outputs and operations](../outputs/README.md), and
[Accounts and publishing](../publishing/README.md).

- Discovery: `lumenclip_workspace_get`, `lumenclip_templates_list`,
  `lumenclip_template_get`, `lumenclip_automations_list`,
  `lumenclip_automation_get`, `lumenclip_collections_list`,
  `lumenclip_outputs_list`.
- Configuration: `lumenclip_automation_preview`,
  `lumenclip_automation_create_from_template`, `lumenclip_automation_save`,
  `lumenclip_automation_update`.
- Assets: `lumenclip_collection_save`,
  `lumenclip_collection_add_assets`, and proposed
  `lumenclip_external_assets_search`.
- Status/review: `lumenclip_outputs_list`, `lumenclip_operation_get`.
- Publishing: `lumenclip_accounts_list`, `lumenclip_output_publish`,
  `lumenclip_output_mark_published`.

For discovery, use `kind: "video"` and `mediaType: "video"`.

## Video template input and output

`lumenclip_template_get` for a video template must return these additional
public fields inside `template`:

| Field                      | Type        | Description                                                                           |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `video_format`             | string      | Stable task format such as `react_reveal`, `broll`, or `faceless`.                    |
| `media_slots`              | object[]    | Named source slots, accepted media types, minimum/maximum count, and duration policy. |
| `audio_policy`             | object      | Whether source audio, generated voice, or music is supported/required.                |
| `duration_policy`          | object      | Minimum, maximum, and full-playback requirements.                                     |
| `allowed_overrides_schema` | JSON Schema | Only stable user-editable controls.                                                   |

It must not expose provider model IDs, temporary render commands, API keys, or
internal storage paths.

## Configure a video automation

Use `lumenclip_automation_preview` with a template source:

```json
{
  "source": {
    "template_id": "react-reveal-v1",
    "template_version": "1"
  },
  "overrides": {
    "name": "Astrology React & Reveal",
    "topic": "astrology interpretation",
    "media_slots": {
      "anticipation": {
        "collection_id": "col_reactions",
        "playback": "full"
      },
      "reveal": {
        "asset_resource_uri": "lumenclip://collections/col_demos/items/demo_7",
        "playback": "full"
      }
    },
    "hooks": ["the placement that explains why you pull away first"]
  }
}
```

Output is the shared preview contract: `valid`, `preview_id`, field-level
`diff`, effective configuration, validation issues, and warnings. Apply with
`lumenclip_automation_create_from_template` or
`lumenclip_automation_update`.

## `lumenclip_automation_run` for video

This path is explicitly unavailable today. The app persists video automation
configuration and generated-video exports, but it does not expose one shared
server-side function that executes an arbitrary saved video automation. The MCP
tool rejects video IDs instead of misrouting them through the slideshow runner.

### Target input (future)

```json
{
  "automation_id": "auto_react_reveal",
  "topic": "Mercury signs during conflict",
  "count": 1,
  "idempotency_key": "video-run-001"
}
```

Supported per-run overrides may select already-approved media resource URIs but
may not invoke arbitrary providers or models.

### Output

Standard operation envelope with `kind: "automation.run"`. A successful video
output resource contains `id`, `output_type: "video"`, `automation_id`,
`status`, `publication_state: "not_published"`, duration, dimensions, caption,
source-media provenance, warning list, `preview_uri`, signed media links, and
`resource_uri`.

Common failures: `MEDIA_UNAVAILABLE`, `UNSUPPORTED_CAPABILITY`,
`QUOTA_EXCEEDED`, `CONCURRENCY_LIMIT`, `PROVIDER_UNAVAILABLE`, and
`OPERATION_FAILED`.

## Publication

Publishing is never part of generation. After review, resolve a named account
with `lumenclip_accounts_list`, confirm it supports `publish_video`, and call
`lumenclip_output_publish`. The output is a separate publish operation with
provider evidence on success.

## Explicitly unavailable tools

- Arbitrary provider/model invocation.
- Character training.
- Provider-specific faceless-video tools.
- Browser-cookie or session-token import.
- A generic raw FFmpeg/render-command tool.
