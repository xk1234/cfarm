# Other social media MCP tools

> Saved X and Threads automation discovery, generation, output inspection, and
> single-post publishing are callable through the common automation/output
> model. LinkedIn remains stateless in the app. There are no direct
> `lumenclip_x_*`, `lumenclip_threads_*`, or `lumenclip_linkedin_*` tools.

## Applicable tools

Complete shared schemas are in
[../shared-contracts.md](../shared-contracts.md):

The primary shared-tool references are
[Automations](../automations/README.md),
[Outputs and operations](../outputs/README.md), and
[Accounts and publishing](../publishing/README.md).

- `lumenclip_workspace_get`
- `lumenclip_accounts_list`
- `lumenclip_templates_list`
- `lumenclip_template_get`
- `lumenclip_automations_list`
- `lumenclip_automation_get`
- `lumenclip_automation_preview`
- `lumenclip_automation_create_from_template`
- `lumenclip_automation_save`
- `lumenclip_automation_update`
- `lumenclip_automation_run`
- `lumenclip_operation_get`
- `lumenclip_outputs_list`
- `lumenclip_output_publish`
- `lumenclip_output_mark_published`

## Platform discovery

Use `lumenclip_automations_list` with `kind: "x"` or `kind: "threads"`.
Account output states capabilities rather than assuming them:

```json
{
  "items": [
    {
      "id": "acct_x_1",
      "provider": "postfast",
      "platform": "x",
      "displayName": "Astrology Daily",
      "connected": true,
      "capabilities": {
        "publishSingle": true,
        "publishGallery": true,
        "publishVideo": true,
        "schedule": true,
        "replyChain": false
      }
    }
  ],
  "hasMore": false
}
```

## Social automation brief

`lumenclip_automation_save` or template overrides may include:

| Field               | Type                       | Description                                                                |
| ------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `platform`          | `x \| threads \| linkedin` | One platform per automation when formatting rules differ.                  |
| `niche`             | string                     | Content domain.                                                            |
| `audience`          | string                     | Intended reader.                                                           |
| `promise`           | string                     | Recurring value proposition.                                               |
| `pillars`           | object[]                   | Label and weight.                                                          |
| `content_types`     | string[]                   | Supported single post, thread/reply chain, article, image, or video forms. |
| `hook_styles`       | string[]                   | Stable public hook families.                                               |
| `voice`             | object                     | Preset and optional user-owned override.                                   |
| `media_policy`      | object                     | None, collection media, or generated media when capability exists.         |
| `schedule`          | object                     | Optional; saved automations default paused.                                |
| `publishing_policy` | object                     | Account IDs and auto-post policy where explicitly supported.               |

Preview output must report unsupported combinations, such as a multi-post reply
chain when the connected account only supports `publish_single`.

## `lumenclip_automation_run` for social drafts

Input:

```json
{
  "automationId": "auto_astrology_threads",
  "topic": "Mercury signs and task processing",
  "requestId": "threads-mercury-001"
}
```

Output is a terminal operation plus an output summary:

```json
{
  "operation": {
    "id": "x-run-123",
    "kind": "automation.run",
    "status": "succeeded",
    "stage": "complete",
    "progress": 100
  },
  "outputs": [
    {
      "id": "x-run-123",
      "outputType": "threads_post",
      "publicationState": "not_published",
      "resourceUri": "lumenclip://outputs/x-run-123"
    }
  ],
  "warnings": []
}
```

The generator must preserve post boundaries, platform length rules, media
attachments, source provenance for reactions/quotes, and unsupported-proof
warnings. It must not collapse a thread into one post.

## Publish a supported social output

`lumenclip_output_publish` input:

```json
{
  "outputId": "out_social_1",
  "targets": [{ "accountId": "acct_threads_1", "mode": "now" }],
  "confirmPublish": true,
  "requestId": "publish-out-social-1"
}
```

The server validates output readiness, platform/account compatibility, post
count, media capabilities, ownership, and confirmation. Unsupported reply
chains remain drafts rather than being silently altered.

Output is a publish operation. Success records provider post IDs and public
URLs; failure preserves the draft and returns a stable error.

## `lumenclip_output_mark_published`

Use this when the user posted manually. Input contains the output ID, platform,
public post URL, publication timestamp, optional account ID, `requestId`, and
`confirmLink: true`. Output updates publication evidence without sending
anything to a social provider.

## Trending-content discovery status

The app has internal X/TikTok/Instagram discovery concepts, but the current MCP
proposal does not define a social-trend search tool. Do not overload
`lumenclip_external_assets_search`: that tool is for approved media sources,
not authenticated social scraping. A future trend tool needs an explicit
source, safe account/session boundary, attribution, selection token, and
reaction/quote policy before it can be documented as public.
