# Video MCP tools

> AI UGC cost estimation, asynchronous draft generation, operation status,
> video automation/output/collection discovery, safe updates, and publishing
> are callable. Completed videos receive a signed public viewer and download
> link. Browser-rendered product-demo and greenscreen templates are not MCP
> generation capabilities yet.

There is no generic `lumenclip_video_generate` tool. Videos use the common
automation contract so provider names, model settings, and internal rendering
services do not leak into MCP. AI UGC has a narrow first-class surface because
it already has one durable worker and checkpoint contract.

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
- AI UGC: `lumenclip_ugc_estimate`, `lumenclip_ugc_generate`, or the common
  `lumenclip_automation_run` with a saved UGC automation ID.
- Publishing: `lumenclip_accounts_list`, `lumenclip_output_publish`,
  `lumenclip_output_mark_published`.

For discovery, use `kind: "ugc"` for AI UGC automations, `kind: "video"` for
other video automations, and `mediaType: "video"` for media collections.

## AI UGC estimate and generation

`lumenclip_ugc_estimate` is read-only. Pass a saved `automationId`, optional
estimate-only overrides (`actorSource`, `actorAssetUrl`, `voiceModel`,
`lipSyncTier`, `targetDurationSeconds`, and `brollCount`), or only those
estimate fields to price a hypothetical run. It returns an itemized USD
estimate and the assumptions used; it never queues work.

`lumenclip_ugc_generate` requires a saved live UGC `automationId` and stable
`requestId`. It validates the product brief/URL and voice configuration, checks
the UGC feature flag, and queues `run-ugc-automation`. A repeated request ID
returns the same queue job. The result includes `runId`, `expectedOutputId`,
the cost estimate, a `ugc.generate` operation, and a ready-to-call
`lumenclip_operation_get` next action.

The worker runs analysis, script, actor, voice, motion, lip sync, B-roll,
composition, storage, and a draft-only publication checkpoint. MCP-originated
runs explicitly disable automatic publishing. Review the resulting video and
use `lumenclip_output_publish` with `confirmPublish: true` separately.

Poll `lumenclip_operation_get` until the operation succeeds. Its video output,
`lumenclip_outputs_list`, and `lumenclip_output_get` include:

- `publicViewUrl`: a signed public page at `/share/videos/{outputId}` with an
  in-browser player, description, hashtags, and download action.
- `downloadUrl`: a signed direct-media endpoint with byte-range support.

Both URLs are absolute when `BASE_URL` is configured. Their token binds the
owner and output ID, so the page does not expose an owner-scoped storage URL.

Generation requires `ENABLE_UGC_AUTOMATION=true` in both the MCP process and
job worker plus the configured provider keys. Duration is normalized to
15–180 seconds and B-roll to 0–6 assets.

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

## `lumenclip_automation_run` for non-UGC video

This path is explicitly unavailable today. The app persists video automation
configuration and generated-video exports, but it does not expose one shared
server-side function that executes an arbitrary saved video automation. The MCP
tool rejects video IDs instead of misrouting them through the slideshow runner.

This includes the saved **UGC Product Demo** template and the greenscreen
template. Their current generation code runs in the authenticated browser and
uses browser media/canvas APIs before uploading the result. There is no
server-side queue handler, durable stage contract, or shared renderer that MCP
or the scheduler can invoke. The template records are therefore discoverable
and configurable, but they are not automatable generation workflows.

The separately named AI UGC workflow (`kind: "ugc"`) is the MCP-capable product
demo path. It is durable and schedulable, but it is not the same renderer as
the browser-only **UGC Product Demo** template.

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
- Reusable character CRUD or training. The app currently stores actor URLs and
  prompts inside each automation; it has no owner-scoped character resource to
  expose safely through MCP yet.
- Provider-specific faceless-video tools.
- Browser-cookie or session-token import.
- A generic raw FFmpeg/render-command tool.
- Browser-rendered **UGC Product Demo** or greenscreen generation. These need a
  server worker and durable renderer contract before they can be exposed safely.
