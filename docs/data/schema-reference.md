---
title: "Schema reference"
description: "Field-by-field reference for persisted LumenClip records and API views."
---

This is the canonical human-readable data dictionary for LumenClip. It is
derived from the TypeScript domain types, normalization code, Appwrite store
routing, and provisioning scripts. The linked source file remains the
executable source of truth.

## How to read the tables

- **Required** means the field is present on a normalized domain object. `No`
  means the property may be omitted; it does not mean `null` is accepted.
- `ISO datetime` means an ISO 8601 string. `IANA timezone` means a value such
  as `Asia/Singapore`.
- Values shown as backticked alternatives are the complete accepted enum.
- `Free string` means the application does not enforce a closed enum.
- Appwrite `$id`, `$createdAt`, `$updatedAt`, permissions, database ID, and
  table ID are platform metadata and are not repeated in every physical table.
- Domain fields use `camelCase` unless the compatibility contract intentionally
  uses `snake_case`. Appwrite projections use `snake_case`.

## Physical Appwrite tables

The `data` column stores the complete serialized domain object. Other columns
are query projections and may be absent when they do not apply to that row's
`source_key`.

### `permanent_assets`

Reusable inputs and reference material. Current `source_key` values are
`image_collection`, `uploaded_asset`, `automation_template`,
`automation_template_example`, `word_collection`,
`tiktok_studio_analytics_import`, `tiktok_studio_analytics_batch`,
`tiktok_comment_collection`, `tiktok_captured_comment`,
`tiktok_comment_reply_draft`, `tiktok_comment_reply_approval`,
`tiktok_comment_reply_send_result`, `product_collection`,
`media_library_asset`, `reminder_settings`, `brand_profile`,
`viral_tracker_project`, `viral_tracker_account`, and `viral_tracker_post`.

| Field              | Storage type  | Required | Allowed values / format                      | Meaning                                 |
| ------------------ | ------------- | -------- | -------------------------------------------- | --------------------------------------- |
| `rid`              | string (1024) | No       | Domain identifier                            | Stable logical record ID.               |
| `owner_id`         | string (36)   | No       | Appwrite user ID                             | Omitted only for public reference rows. |
| `source_key`       | string (255)  | No       | Values listed above                          | Polymorphic record discriminator.       |
| `name`             | string (2048) | No       | Free string                                  | Projected label/title.                  |
| `status`           | string (255)  | No       | Depends on `source_key`                      | Projected lifecycle state.              |
| `created_raw`      | string (64)   | No       | ISO datetime                                 | Projected domain creation time.         |
| `data`             | long text     | No       | JSON object string                           | Complete serialized domain object.      |
| `ord`              | integer       | No       | Zero-based integer                           | Stable list order.                      |
| `visibility`       | string (32)   | No       | Domain-specific                              | Projected visibility.                   |
| `asset_type`       | string (255)  | No       | Domain-specific                              | Broad asset subtype.                    |
| `kind`             | string (255)  | No       | Usually `image`, `video`, `audio`, or `text` | Media kind.                             |
| `parent_id`        | string (255)  | No       | Domain ID                                    | Owning collection or parent asset.      |
| `description`      | medium text   | No       | Free string                                  | Projected description.                  |
| `text`             | medium text   | No       | Free string                                  | Searchable body text.                   |
| `tags`             | long text     | No       | JSON string array                            | Search/filter tags.                     |
| `storage_bucket`   | string (255)  | No       | Appwrite bucket ID                           | Stored file bucket.                     |
| `storage_file_id`  | string (255)  | No       | Appwrite file ID                             | Stored file identifier.                 |
| `storage_path`     | medium text   | No       | Data-relative path                           | Compatibility asset path.               |
| `url`              | medium text   | No       | URL/path                                     | Application-facing media URL.           |
| `mime_type`        | string (255)  | No       | MIME type                                    | Stored media content type.              |
| `bytes`            | integer       | No       | Non-negative integer                         | File size in bytes.                     |
| `width`            | integer       | No       | Positive integer                             | Pixel width when known.                 |
| `height`           | integer       | No       | Positive integer                             | Pixel height when known.                |
| `duration_ms`      | integer       | No       | Non-negative integer                         | Audio/video duration.                   |
| `checksum`         | string (255)  | No       | Digest string                                | Content identity/integrity digest.      |
| `source_url`       | medium text   | No       | URL                                          | Original import source.                 |
| `position`         | integer       | No       | Zero-based integer                           | Position inside a parent.               |
| `updated_at`       | string (64)   | No       | ISO datetime                                 | Projected update time.                  |
| `migration_source` | string (255)  | No       | Free string                                  | Legacy migration provenance.            |

### `outputs`

Generated content. Current `source_key` values are `result`,
`generated_video`, `x_automation_run`, and `publication_wrapper`.

| Field                  | Storage type  | Required | Allowed values / format                                                | Meaning                               |
| ---------------------- | ------------- | -------- | ---------------------------------------------------------------------- | ------------------------------------- |
| `rid`                  | string (1024) | No       | Domain identifier                                                      | Stable logical output ID.             |
| `owner_id`             | string (36)   | No       | Appwrite user ID                                                       | Output owner.                         |
| `source_key`           | string (255)  | No       | `result`, `generated_video`, `x_automation_run`, `publication_wrapper` | Output discriminator.                 |
| `name`                 | string (2048) | No       | Free string                                                            | Projected output name.                |
| `status`               | string (255)  | No       | Depends on `source_key`                                                | Generation/content lifecycle.         |
| `created_raw`          | string (64)   | No       | ISO datetime                                                           | Domain creation time.                 |
| `data`                 | long text     | No       | JSON object string                                                     | Complete output object.               |
| `ord`                  | integer       | No       | Zero-based integer                                                     | Stable order.                         |
| `kind`                 | string (255)  | No       | Domain-specific                                                        | Broad content/media kind.             |
| `subtype`              | string (255)  | No       | Domain-specific                                                        | More specific output class.           |
| `storage_class`        | string (64)   | No       | Domain-specific                                                        | Storage policy/category.              |
| `origin`               | string (64)   | No       | Domain-specific                                                        | How the output was created.           |
| `title`                | string (2048) | No       | Free string                                                            | Display title.                        |
| `hook`                 | medium text   | No       | Free string                                                            | Generated hook.                       |
| `caption`              | medium text   | No       | Free string                                                            | Generated/social caption.             |
| `hashtags`             | long text     | No       | String or JSON string array                                            | Hashtag payload.                      |
| `text`                 | medium text   | No       | Free string                                                            | Primary generated text.               |
| `text_data`            | long text     | No       | JSON string                                                            | Structured generated text.            |
| `source_automation_id` | string (255)  | No       | Domain ID                                                              | Originating automation.               |
| `source_run_id`        | string (255)  | No       | Domain ID                                                              | Originating run.                      |
| `source_entity_id`     | string (255)  | No       | Domain ID                                                              | Originating slideshow/content entity. |
| `has_video`            | boolean       | No       | `true` or `false`                                                      | Fast video-output filter.             |
| `publication_status`   | string (64)   | No       | Post status values below                                               | Projected primary publication state.  |
| `scheduled_at`         | string (64)   | No       | ISO datetime                                                           | Projected scheduled time.             |
| `published_at`         | string (64)   | No       | ISO datetime                                                           | Projected publication time.           |
| `primary_post_id`      | string (255)  | No       | Provider post ID                                                       | Primary remote post.                  |
| `primary_release_url`  | medium text   | No       | URL                                                                    | Primary published URL.                |
| `publications`         | long text     | No       | JSON `PostFastPostRecord[]`                                            | All publication attempts/records.     |
| `evaluation`           | long text     | No       | JSON object string                                                     | Quality/evaluation payload.           |
| `error`                | medium text   | No       | Free string                                                            | Output-level failure detail.          |
| `updated_at`           | string (64)   | No       | ISO datetime                                                           | Domain update time.                   |
| `migration_source`     | string (255)  | No       | Free string                                                            | Legacy migration provenance.          |

### `output_media`

Normalized media children of an `outputs` row.

| Field                | Storage type | Required | Allowed values / format           | Meaning                                |
| -------------------- | ------------ | -------- | --------------------------------- | -------------------------------------- |
| `output_id`          | string (36)  | No       | Appwrite output row ID            | Parent output.                         |
| `owner_id`           | string (36)  | No       | Appwrite user ID                  | Parent owner.                          |
| `permanent_asset_id` | string (36)  | No       | Appwrite row ID                   | Reused permanent asset, if any.        |
| `kind`               | string (64)  | No       | `image`, `video`, `audio`, `text` | Media kind.                            |
| `role`               | string (255) | No       | Domain-specific                   | Thumbnail, source, result, slide, etc. |
| `position`           | integer      | No       | Zero-based integer                | Order within the output.               |
| `storage_bucket`     | string (255) | No       | Appwrite bucket ID                | Stored file bucket.                    |
| `storage_file_id`    | string (255) | No       | Appwrite file ID                  | Stored file identifier.                |
| `storage_path`       | medium text  | No       | Data-relative path                | Compatibility path.                    |
| `url`                | medium text  | No       | URL/path                          | Application-facing media URL.          |
| `mime_type`          | string (255) | No       | MIME type                         | Content type.                          |
| `bytes`              | integer      | No       | Non-negative integer              | File size.                             |
| `width`              | integer      | No       | Positive integer                  | Pixel width.                           |
| `height`             | integer      | No       | Positive integer                  | Pixel height.                          |
| `duration_ms`        | integer      | No       | Non-negative integer              | Audio/video duration.                  |
| `checksum`           | string (255) | No       | Digest string                     | Content digest.                        |
| `data`               | long text    | No       | JSON object string                | Extra media metadata.                  |
| `created_at`         | string (64)  | No       | ISO datetime                      | Creation time.                         |

### Dedicated JSON-store row

`automations`, `automation_runs`, `x_automations`, `usage_ledger`,
`postfast_metric_snapshots`, and `account_follower_snapshots` use the same
generic row projection. Their serialized `data` shape is documented under the
matching domain object below.

| Field         | Storage type   | Required                        | Allowed values / format | Meaning                  |
| ------------- | -------------- | ------------------------------- | ----------------------- | ------------------------ |
| `rid`         | string         | No                              | Domain identifier       | Logical record ID.       |
| `owner_id`    | string         | No                              | Appwrite user ID        | Record owner.            |
| `name`        | string         | No                              | Free string             | Projected label.         |
| `status`      | string         | No                              | Domain lifecycle enum   | Projected status.        |
| `created_raw` | string         | No                              | ISO datetime            | Projected creation time. |
| `ord`         | integer        | No                              | Zero-based integer      | Stable order.            |
| `data`        | text/long text | Yes in current dedicated stores | JSON object string      | Complete domain object.  |

### `jobs`

| Field          | Storage type | Required | Allowed values / format                               | Meaning                                |
| -------------- | ------------ | -------- | ----------------------------------------------------- | -------------------------------------- |
| `type`         | string       | No       | Registered worker job type                            | Dispatch key.                          |
| `status`       | string       | No       | `queued`, `processing`, `completed`, `failed`, `dead` | Queue lifecycle.                       |
| `priority`     | integer      | No       | Integer; default `0` in app enqueue path              | Higher-priority work is claimed first. |
| `priority_raw` | string       | No       | Legacy numeric string                                 | Compatibility projection.              |
| `available_at` | string       | No       | ISO datetime                                          | Earliest claim time.                   |
| `leased_by`    | string       | No       | Worker ID                                             | Current claimant.                      |
| `leased_until` | string       | No       | ISO datetime                                          | Claim expiry.                          |
| `attempts`     | integer      | No       | Non-negative integer; starts at `0`                   | Attempts already made.                 |
| `max_attempts` | integer      | No       | Positive integer; default `3`                         | Retry ceiling.                         |
| `payload`      | long text    | No       | JSON                                                  | Job input.                             |
| `result`       | long text    | No       | JSON                                                  | Completed output/receipt.              |
| `error`        | string       | No       | Free string                                           | Last failure.                          |
| `dedupe_key`   | string       | No       | Owner-scoped stable key                               | Duplicate-enqueue boundary.            |
| `owner_id`     | string       | No       | Appwrite user ID                                      | Job owner.                             |
| `created_at`   | string       | No       | ISO datetime                                          | Enqueue time.                          |
| `updated_at`   | string       | No       | ISO datetime                                          | Last state transition.                 |

### `workspace_members`

| Field            | Storage type | Required | Allowed values / format | Meaning                   |
| ---------------- | ------------ | -------- | ----------------------- | ------------------------- |
| `owner_id`       | string       | Yes      | Appwrite user ID        | Workspace owner.          |
| `owner_name`     | string       | Yes      | Free string             | Owner display name.       |
| `email`          | string       | Yes      | Normalized email        | Invited member.           |
| `member_user_id` | string       | No       | Appwrite user ID        | Set after acceptance.     |
| `status`         | string       | Yes      | `pending`, `accepted`   | Invitation lifecycle.     |
| `team_id`        | string       | Yes      | Appwrite Team ID        | Workspace team.           |
| `membership_id`  | string       | Yes      | Appwrite membership ID  | Team membership.          |
| `created_at`     | string       | Yes      | ISO datetime            | Invitation creation time. |

### `demos`

| Field          | Storage type | Required | Allowed values / format         | Meaning                     |
| -------------- | ------------ | -------- | ------------------------------- | --------------------------- |
| `owner_id`     | string       | Yes      | Appwrite user ID                | Demo owner.                 |
| `title`        | string       | Yes      | Free string                     | Display title.              |
| `file_id`      | string       | Yes      | Appwrite file ID                | File in the `demos` bucket. |
| `content_type` | string       | Yes      | MIME type; fallback `video/mp4` | Response content type.      |
| `created_at`   | string       | Yes      | ISO datetime                    | Creation time.              |

## Workspace and reusable media

### `RealFarmData`

Source: `lib/realfarm-data.ts`. Runtime aggregate; not persisted as one row.

| Field                     | Type           | Required | Allowed values / format | Meaning                   |
| ------------------------- | -------------- | -------- | ----------------------- | ------------------------- |
| `brand.name`              | string literal | Yes      | `LumenClip`             | Product/brand name.       |
| `brand.owner`             | string         | No       | Free string             | Optional owner label.     |
| `assets.music`            | `LocalAsset[]` | Yes      | Array                   | Music catalog.            |
| `assets.ugcAvatarVideos`  | `LocalAsset[]` | Yes      | Array                   | UGC avatar video catalog. |
| `assets.demoVideos`       | `LocalAsset[]` | Yes      | Array                   | Demo video catalog.       |
| `assets.greenscreenMemes` | `LocalAsset[]` | Yes      | Array                   | Greenscreen catalog.      |
| `assets.ctas`             | `LocalAsset[]` | Yes      | Array                   | CTA text/media catalog.   |

### `LocalAsset`

| Field  | Type        | Required | Allowed values / format    | Meaning                     |
| ------ | ----------- | -------- | -------------------------- | --------------------------- |
| `id`   | string      | Yes      | Stable identifier          | Asset ID.                   |
| `name` | string      | Yes      | Free string                | Display name.               |
| `path` | string      | Yes      | Data-relative path         | Storage compatibility path. |
| `url`  | string      | Yes      | `/api/local-assets/**` URL | Stream URL.                 |
| `kind` | string enum | Yes      | `audio`, `video`, `text`   | Bundled local asset kind.   |
| `text` | string      | No       | Free string                | Text asset contents.        |

### `MediaLibraryAsset`

Persistence: `permanent_assets`, `source_key=media_library_asset`.

| Field        | Type        | Required | Allowed values / format                                                  | Meaning              |
| ------------ | ----------- | -------- | ------------------------------------------------------------------------ | -------------------- |
| `id`         | string      | Yes      | Deterministic path-derived ID                                            | Asset ID.            |
| `name`       | string      | Yes      | Free string                                                              | Display name.        |
| `path`       | string      | Yes      | Data-relative path                                                       | Storage path.        |
| `url`        | string      | Yes      | `/api/local-assets/**` URL                                               | Stream URL.          |
| `kind`       | string enum | Yes      | `audio`, `video`, `text`                                                 | Media kind.          |
| `collection` | string enum | Yes      | `music`, `ugc_avatar_videos`, `demo_videos`, `greenscreen_memes`, `ctas` | Catalog partition.   |
| `text`       | string      | No       | Free string                                                              | Text asset contents. |

## Automation definition

### `AutomationRecord`

Persistence: `automations`.

| Field                | Type               | Required | Allowed values / format     | Meaning                                        |
| -------------------- | ------------------ | -------- | --------------------------- | ---------------------------------------------- |
| `ownerId`            | string             | No       | Appwrite user ID            | Injected record owner.                         |
| `id`                 | string             | Yes      | Stable domain ID            | Automation ID.                                 |
| `sourceAutomationId` | string             | No       | External ID                 | Imported automation identity.                  |
| `sourceUrl`          | string             | No       | URL                         | Import source.                                 |
| `name`               | string             | Yes      | Free string                 | Display name.                                  |
| `status`             | string enum        | Yes      | `live`, `paused`, `unknown` | Lifecycle state; `unknown` covers old records. |
| `favorite`           | boolean            | Yes      | `true`, `false`             | UI favorite state.                             |
| `theme`              | string             | Yes      | Free string                 | UI theme label.                                |
| `importedAt`         | ISO datetime       | No       | ISO 8601                    | Import time.                                   |
| `updatedAt`          | ISO datetime       | Yes      | ISO 8601                    | Last update.                                   |
| `schema`             | `AutomationSchema` | Yes      | See below                   | Editable/runtime definition.                   |
| `raw`                | object             | No       | JSON object                 | Preserved external source payload.             |

### `AutomationSchema`

| Field                     | Type                          | Required | Allowed values / format                      | Meaning                                       |
| ------------------------- | ----------------------------- | -------- | -------------------------------------------- | --------------------------------------------- |
| `automationKind`          | string enum                   | Yes      | `slideshow`, `video`, `ugc`                  | Generation family.                            |
| `aspect_ratio`            | string enum                   | Yes      | `9:16`, `4:5`, `3:4`, `3:2`, `1:1`           | Global output aspect ratio.                   |
| `font`                    | string                        | Yes      | Registered/font-family string                | Global font.                                  |
| `image_fit`               | string enum                   | Yes      | `cover`, `contain`, `fit`                    | Image fit policy.                             |
| `language`                | string                        | Yes      | Language label/code                          | Generation language.                          |
| `created_at`              | Date/ISO on serialization     | Yes      | Valid datetime                               | Definition creation time.                     |
| `social_integrations`     | `PostFastSocialIntegration[]` | Yes      | Array                                        | Publication targets.                          |
| `prompt_formatting`       | `PromptFormatting`            | Yes      | See below                                    | Text-generation direction.                    |
| `hooks`                   | `AutomationHookItem[]`        | Yes      | Array                                        | Canonical hook catalog.                       |
| `image_collection_ids`    | `ImageCollectionConfig`       | Yes      | See below                                    | Media source selection.                       |
| `tone`                    | `AutomationToneSection`       | Yes      | See below                                    | Tone selection/custom direction.              |
| `formatting`              | `AutomationFormatSection[]`   | Yes      | IDs `hook`, `body`, `cta`                    | Slide/text layout.                            |
| `tiktok_post_settings`    | object                        | Yes      | See `TikTokPostSettings`                     | Compatibility publishing policy.              |
| `social_post_settings`    | object                        | Yes      | Provider-keyed controls                      | Provider-specific PostFast controls.          |
| `social_publish_as`       | object                        | Yes      | Provider keys; values `slideshow` or `video` | Per-provider media mode.                      |
| `schedule`                | `AutomationSchedule`          | Yes      | See below                                    | Posting schedule.                             |
| `posting_mode`            | string enum                   | No       | `manual`, `review`, `auto`                   | Publication workflow.                         |
| `generation_lead_minutes` | number                        | No       | Non-negative number                          | Generate before scheduled publication.        |
| `hook_slots`              | object                        | No       | `{ token: collectionId }`                    | Explicit variable-collection overrides.       |
| `hook_no_duplicate_slots` | boolean                       | No       | `true`, `false`                              | Avoid duplicate hook slot selections.         |
| `distinct_variable_draws` | boolean                       | No       | `true`, `false`                              | Draw different values for repeated variables. |
| `web_search_enabled`      | boolean                       | No       | `true`, `false`                              | Allow provider web-search generation.         |
| `reuse_policy`            | `AutomationReusePolicy`       | No       | See below                                    | Recent-content exclusion settings.            |
| `content_strategy`        | `AutomationContentStrategy`   | No       | See below                                    | Route-based content strategy.                 |
| `video_format`            | `AutomationVideoFormat`       | No       | Required by video flows                      | Segment/template configuration.               |
| `ugc`                     | `AutomationUgcConfig`         | No       | Required by UGC flows                        | UGC actor/voice/caption configuration.        |

### `PromptFormatting`

| Field           | Type   | Required | Allowed values / format                            | Meaning                        |
| --------------- | ------ | -------- | -------------------------------------------------- | ------------------------------ |
| `style`         | string | Yes      | Free string                                        | Style direction.               |
| `narrative`     | string | Yes      | Free string                                        | Narrative/writing direction.   |
| `num_of_slides` | number | Yes      | Positive integer                                   | Default slide count.           |
| `hook_case`     | string | No       | Hook-case modes registered in `lib/hook-casing.ts` | Hook capitalization transform. |

### `ImageCollectionConfig`

| Field                         | Type           | Required | Allowed values / format      | Meaning                        |
| ----------------------------- | -------------- | -------- | ---------------------------- | ------------------------------ |
| `first_slide.collection`      | string         | Yes      | Collection ID                | First-slide source collection. |
| `first_slide.mode`            | string enum    | Yes      | `collection`, `single_image` | First-slide selection mode.    |
| `first_slide.single_image`    | string or null | Yes      | Asset/image ID or `null`     | Fixed first image.             |
| `all_slides`                  | string         | Yes      | Collection ID                | Body-slide source.             |
| `cta_slide.check`             | boolean        | Yes      | `true`, `false`              | Enable dedicated CTA media.    |
| `cta_slide.cta_collection_id` | string         | Yes      | Collection ID                | CTA source collection.         |
| `cta_slide.image_id`          | string or null | Yes      | Asset/image ID or `null`     | Fixed CTA image.               |
| `video_demo_asset_id`         | string         | No       | Asset ID                     | Optional demo video.           |

### `AutomationSchedule`

| Field                     | Type     | Required | Allowed values / format                         | Meaning                       |
| ------------------------- | -------- | -------- | ----------------------------------------------- | ----------------------------- |
| `timezone`                | string   | Yes      | IANA timezone                                   | Slot calculation timezone.    |
| `posting_times`           | object[] | Yes      | Array                                           | Schedule entries.             |
| `posting_times[].time`    | string   | Yes      | Local `HH:mm` time                              | Posting time.                 |
| `posting_times[].days`    | string[] | Yes      | `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun` | Active weekdays.              |
| `posting_times[].enabled` | boolean  | No       | `true`, `false`; normalized default applies     | Entry enablement.             |
| `paused`                  | boolean  | No       | `true`, `false`                                 | Schedule-level pause.         |
| `jitter_minutes`          | number   | No       | Non-negative integer                            | Random timing offset ceiling. |

### `AutomationHookItem`

| Field            | Type         | Required | Allowed values / format              | Meaning                    |
| ---------------- | ------------ | -------- | ------------------------------------ | -------------------------- |
| `id`             | string       | Yes      | Stable ID                            | Hook identity.             |
| `text`           | string       | Yes      | Free string with supported variables | Hook template.             |
| `enabled`        | boolean      | Yes      | `true`, `false`                      | Selection eligibility.     |
| `bodySlideCount` | number       | No       | Positive integer                     | Per-hook body slide count. |
| `tone`           | string       | No       | Free string                          | Per-hook tone override.    |
| `createdAt`      | ISO datetime | Yes      | ISO 8601                             | Creation time.             |
| `updatedAt`      | ISO datetime | No       | ISO 8601                             | Last update.               |

### `AutomationFormatSection`

| Field              | Type         | Required | Allowed values / format                   | Meaning                     |
| ------------------ | ------------ | -------- | ----------------------------------------- | --------------------------- |
| `id`               | string enum  | Yes      | `hook`, `body`, `cta`                     | Section identity.           |
| `textItems`        | `TextItem[]` | Yes      | Array                                     | Text boxes.                 |
| `aspect_ratio`     | string enum  | Yes      | `9:16`, `4:5`, `3:4`, `3:2`, `1:1`        | Section ratio.              |
| `imageGrid`        | string enum  | Yes      | `none`, `2x2`, `1x2`, `1x3`, `oval-icons` | Image layout.               |
| `slideCount`       | number       | Yes      | Positive integer                          | Static/default count.       |
| `slideCountMode`   | string enum  | No       | `static`, `varying`                       | Count mode.                 |
| `slideCountMin`    | number       | No       | Positive integer                          | Varying lower bound.        |
| `slideCountMax`    | number       | No       | Positive integer                          | Varying upper bound.        |
| `noText`           | boolean      | Yes      | `true`, `false`                           | Disable text rendering.     |
| `overlay`          | boolean      | Yes      | `true`, `false`                           | Enable overlay rendering.   |
| `aiImageSelection` | boolean      | No       | `true`, `false`                           | Let the model choose media. |
| `overlayImage`     | object       | No       | `{ enabled, collectionId?, padding }`     | Overlay-image policy.       |
| `slideOverrides`   | object[]     | No       | `{ slideIndex, contentDirection }[]`      | Per-slide copy direction.   |
| `imageOverrides`   | object[]     | No       | `{ slideIndex, collectionId }[]`          | Per-slide media source.     |
| `imageMode`        | string enum  | No       | `collection`, `single_image`              | Image selection mode.       |

### `TextItem`

| Field                | Type        | Required | Allowed values / format   | Meaning                        |
| -------------------- | ----------- | -------- | ------------------------- | ------------------------------ |
| `id`                 | string      | Yes      | Stable ID                 | Text-box identity.             |
| `text`               | string      | Yes      | Free string               | Text/prompt content.           |
| `fontSize`           | string      | Yes      | CSS-like size string      | Font size.                     |
| `textStyle`          | string      | Yes      | Registered style          | Text style.                    |
| `font`               | string      | Yes      | Font family               | Font.                          |
| `textPosition`       | string enum | Yes      | `top`, `center`, `bottom` | Vertical placement.            |
| `textItemWidth`      | string      | Yes      | CSS-like width            | Text box width.                |
| `wordLengthMin`      | number      | Yes      | Non-negative integer      | Minimum generated word count.  |
| `wordLengthMax`      | number      | Yes      | Integer ≥ minimum         | Maximum generated word count.  |
| `contentDirection`   | string      | Yes      | Free string               | Generation instruction.        |
| `textMode`           | string enum | Yes      | `prompt`, `static`        | Generated vs fixed text.       |
| `staticText`         | string      | Yes      | Free string               | Fixed text when static.        |
| `textAlign`          | string enum | Yes      | `left`, `center`, `right` | Horizontal alignment.          |
| `textAnchor`         | string enum | Yes      | `padded`, `flush`         | Horizontal safe-area behavior. |
| `textVerticalAnchor` | string enum | No       | `padded`, `flush`         | Vertical safe-area behavior.   |

### `TikTokPostSettings`

| Field                        | Type              | Required | Allowed values / format                                           | Meaning                     |
| ---------------------------- | ----------------- | -------- | ----------------------------------------------------------------- | --------------------------- |
| `caption`                    | `PostTextSetting` | Yes      | `mode`: `prompt` or `static`; `resolution`: `generated` or `hook` | Caption rule.               |
| `description`                | `PostTextSetting` | Yes      | Same contract as caption                                          | Description rule.           |
| `visibility`                 | string enum       | Yes      | `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`, `SELF_ONLY`        | TikTok visibility.          |
| `auto_music`                 | boolean           | Yes      | `true`, `false`                                                   | Automatic music.            |
| `auto_post`                  | boolean           | Yes      | `true`, `false`                                                   | Automatic publication.      |
| `allow_comments`             | boolean           | Yes      | `true`, `false`                                                   | Comments permission.        |
| `allow_duet`                 | boolean           | Yes      | `true`, `false`                                                   | Duet permission.            |
| `allow_stitch`               | boolean           | Yes      | `true`, `false`                                                   | Stitch permission.          |
| `disclose_video_content`     | boolean           | Yes      | `true`, `false`                                                   | AI/content disclosure.      |
| `disclose_brand_organic`     | boolean           | Yes      | `true`, `false`                                                   | Organic brand disclosure.   |
| `disclose_branded_content`   | boolean           | Yes      | `true`, `false`                                                   | Branded-content disclosure. |
| `post_mode`                  | string enum       | Yes      | `MEDIA_UPLOAD`, `DIRECT_POST`                                     | TikTok posting mode.        |
| `publish_type`               | string enum       | No       | `slideshow`, `video`                                              | Published media form.       |
| `slideshow_transition_style` | string            | No       | Free string                                                       | Transition name.            |
| `slideshow_slide_duration`   | number            | No       | Positive seconds                                                  | Per-slide duration.         |
| `slideshow_sound_id`         | string            | No       | Provider ID                                                       | Sound ID.                   |
| `slideshow_sound_name`       | string            | No       | Free string                                                       | Sound name.                 |
| `slideshow_sound_url`        | string            | No       | URL                                                               | Sound preview/source.       |

### `AutomationVideoFormat` and `AutomationVideoSegment`

| Field                              | Type                       | Required | Allowed values / format                                                                                                                                               | Meaning                       |
| ---------------------------------- | -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `template`                         | string enum                | Yes      | `ugc_ad`, `greenscreen_meme`, `react_reveal`, `compilation`, `birdseye_pov`, `screen_record`, `screenshot_pictures`, `aesthetic`, `story_over_broll`, `faceless_reel` | Video template.               |
| `hookPlacement`                    | string enum                | Yes      | `global`, `first_segment`                                                                                                                                             | Hook text location.           |
| `globalTextItems`                  | `TextItem[]`               | Yes      | Array                                                                                                                                                                 | Global overlays.              |
| `segments`                         | `AutomationVideoSegment[]` | Yes      | Array                                                                                                                                                                 | Ordered segment definitions.  |
| `segments[].id`                    | string                     | Yes      | Stable ID                                                                                                                                                             | Segment identity.             |
| `segments[].label`                 | string                     | Yes      | Free string                                                                                                                                                           | Display label.                |
| `segments[].guidance`              | string                     | Yes      | Free string                                                                                                                                                           | Generation/edit guidance.     |
| `segments[].mediaSource`           | string enum                | Yes      | `collection`, `demo_asset`, `slideshow_automation`                                                                                                                    | Source family.                |
| `segments[].mediaKind`             | string enum                | Yes      | `video`, `image`                                                                                                                                                      | Expected media.               |
| `segments[].collectionId`          | string                     | Yes      | Collection ID or normalized empty value                                                                                                                               | Collection source.            |
| `segments[].demoAssetId`           | string                     | Yes      | Asset ID or normalized empty value                                                                                                                                    | Demo source.                  |
| `segments[].slideshowAutomationId` | string                     | No       | Automation ID                                                                                                                                                         | Slideshow source.             |
| `segments[].clipCount`             | number                     | Yes      | Positive integer                                                                                                                                                      | Number of clips.              |
| `segments[].clipDurationMs`        | number                     | Yes      | Positive integer                                                                                                                                                      | Target clip duration.         |
| `segments[].playFullVideo`         | boolean                    | No       | `true`, `false`                                                                                                                                                       | Bypass clipping.              |
| `segments[].transition`            | string enum                | Yes      | `cut`, `fade`                                                                                                                                                         | Transition into next segment. |
| `segments[].textItems`             | `TextItem[]`               | Yes      | Array                                                                                                                                                                 | Segment overlays.             |

### `AutomationUgcConfig`

| Field                    | Type        | Required | Allowed values / format         | Meaning                    |
| ------------------------ | ----------- | -------- | ------------------------------- | -------------------------- |
| `enabled`                | boolean     | Yes      | `true`, `false`                 | Enable UGC flow.           |
| `productUrl`             | string      | No       | URL                             | Product source.            |
| `productBrief`           | string      | No       | Free string                     | Product direction.         |
| `actorSource`            | string enum | Yes      | `generate`, `gallery`, `upload` | Actor source.              |
| `actorAssetUrl`          | string      | No       | URL/path                        | Selected actor media.      |
| `actorPrompt`            | string      | No       | Free string                     | Actor generation prompt.   |
| `voiceId`                | string      | Yes      | Provider voice ID               | Voice selection.           |
| `voiceModel`             | string      | No       | Provider model ID               | Voice model.               |
| `lipSyncTier`            | string enum | Yes      | `standard`, `premium`           | Lip-sync quality tier.     |
| `targetDurationSeconds`  | number      | Yes      | Positive number                 | Target duration.           |
| `brollCount`             | number      | Yes      | Non-negative integer            | B-roll count.              |
| `captions.enabled`       | boolean     | Yes      | `true`, `false`                 | Caption rendering.         |
| `captions.style`         | string      | Yes      | Registered/free style           | Caption style.             |
| `captions.fallback`      | string enum | Yes      | `drawtext`, `png_frames`        | Caption fallback renderer. |
| `hookOverlay.enabled`    | boolean     | Yes      | `true`, `false`                 | Hook overlay.              |
| `hookOverlay.durationMs` | number      | Yes      | Non-negative integer            | Overlay duration.          |
| `hookOverlay.style`      | string      | Yes      | Registered/free style           | Overlay style.             |

## Automation execution and output

### `AutomationRunRecord`

Persistence: `automation_runs`.

| Field                 | Type                           | Required | Allowed values / format          | Meaning                        |
| --------------------- | ------------------------------ | -------- | -------------------------------- | ------------------------------ |
| `id`                  | string                         | Yes      | Stable domain ID                 | Run ID.                        |
| `automationId`        | string                         | Yes      | Automation ID                    | Parent automation.             |
| `automationTitle`     | string                         | Yes      | Free string                      | Snapshot title.                |
| `scheduledFor`        | ISO datetime                   | Yes      | ISO 8601                         | Content slot.                  |
| `generationSource`    | string enum                    | No       | `manual`, `scheduled`            | Initiator.                     |
| `requestId`           | string                         | No       | Idempotency/correlation ID       | Request identity.              |
| `status`              | string enum                    | Yes      | `running`, `succeeded`, `failed` | Run lifecycle.                 |
| `postfastRecordId`    | string                         | No       | Publication ID                   | Associated publication.        |
| `slideshowId`         | string                         | No       | Slideshow ID                     | Generated slideshow.           |
| `videoUrl`            | string                         | No       | URL/path                         | Generated video.               |
| `thumbnailUrl`        | string                         | No       | URL/path                         | Preview image.                 |
| `outputImages`        | string[]                       | No       | URLs/paths                       | Rendered slides.               |
| `outputDir`           | string                         | No       | Storage-relative path            | Render output location.        |
| `socialStatuses`      | `AutomationRunSocialStatus[]`  | No       | Array                            | Per-target publication states. |
| `manuallyPublishedAt` | ISO datetime                   | No       | ISO 8601                         | Manual publication evidence.   |
| `renderedSlides`      | `AutomationRunRenderedSlide[]` | No       | Array                            | Rendered slide snapshot.       |
| `plan`                | `AutomationRunPlan`            | Yes      | See below                        | Reproducible decisions.        |
| `createdAt`           | ISO datetime                   | Yes      | ISO 8601                         | Creation time.                 |
| `updatedAt`           | ISO datetime                   | Yes      | ISO 8601                         | Last update.                   |
| `error`               | string                         | No       | Free string                      | Failure detail.                |

### `AutomationRunPlan`

| Field                 | Type                   | Required | Allowed values / format                | Meaning                                        |
| --------------------- | ---------------------- | -------- | -------------------------------------- | ---------------------------------------------- |
| `title`               | string                 | Yes      | Free string                            | Planned title.                                 |
| `caption`             | string                 | Yes      | Free string                            | Planned caption.                               |
| `hashtags`            | string                 | Yes      | Free string                            | Planned hashtag text.                          |
| `hook`                | string                 | Yes      | Free string                            | Resolved hook.                                 |
| `hookId`              | string                 | No       | Hook ID                                | Source hook.                                   |
| `hookTemplate`        | string                 | No       | Free string                            | Pre-substitution hook.                         |
| `hookSubstitutions`   | object                 | No       | `{ token: value }`                     | Variable resolutions.                          |
| `imageCollectionIds`  | string[]               | Yes      | Collection IDs                         | Used collections.                              |
| `violations`          | string[]               | No       | Free strings                           | Policy/quality warnings.                       |
| `slides`              | `AutomationRunSlide[]` | Yes      | Array                                  | Planned slides.                                |
| `slideCount`          | object                 | Yes      | `{ mode, count?, min?, max? }`         | Count decision.                                |
| `publishType`         | string                 | Yes      | Normalized publish type                | Output/publication form.                       |
| `autoMusic`           | boolean                | Yes      | `true`, `false`                        | Music decision.                                |
| `autoPost`            | boolean                | Yes      | `true`, `false`                        | Auto-publication decision.                     |
| `reuseWarnings`       | object[]               | No       | `kind` currently `image`               | Reuse exceptions.                              |
| `hookCandidates`      | string[]               | No       | Free strings                           | Candidate hooks.                               |
| `textModel`           | string                 | No       | Provider model ID                      | Text model used.                               |
| `language`            | string                 | Yes      | Language label/code                    | Generation language.                           |
| `translationProvider` | string literal         | No       | `deepl`                                | Translation provider.                          |
| `contentStrategy`     | object                 | No       | Route ID, content format, CTA strategy | Selected strategy route.                       |
| `debug`               | object                 | No       | Structured diagnostics                 | Generation diagnostics; not presentation data. |

### `ResultRecord`

Persistence: `outputs`, `source_key=result`.

| Field                   | Type                    | Required | Allowed values / format                        | Meaning                                 |
| ----------------------- | ----------------------- | -------- | ---------------------------------------------- | --------------------------------------- |
| `ownerId`               | string                  | No       | Appwrite user ID                               | Output owner.                           |
| `id`                    | string                  | Yes      | Stable domain ID                               | Result ID.                              |
| `automationId`          | string                  | Yes      | Automation ID                                  | Source automation.                      |
| `runId`                 | string                  | Yes      | Run ID                                         | Source run; one current result per run. |
| `workflowType`          | string enum             | Yes      | `slideshow`, `video`                           | Result family.                          |
| `title`                 | string                  | Yes      | Free string                                    | Display title.                          |
| `status`                | string enum             | Yes      | `succeeded`, `failed`                          | Generation result.                      |
| `createdAt`             | ISO datetime            | Yes      | ISO 8601                                       | Creation time.                          |
| `updatedAt`             | ISO datetime            | Yes      | ISO 8601                                       | Last update.                            |
| `artifacts`             | `ResultArtifacts`       | Yes      | See below                                      | Generated media.                        |
| `payload`               | slideshow/video payload | No       | Discriminator `type` is `slideshow` or `video` | Authoring/render payload.               |
| `destinationAccountIds` | string[]                | Yes      | Integration IDs                                | Intended targets.                       |

### `ResultArtifacts`

| Field          | Type     | Required | Allowed values / format  | Meaning                           |
| -------------- | -------- | -------- | ------------------------ | --------------------------------- |
| `slideshowId`  | string   | No       | Domain ID                | Slideshow compatibility identity. |
| `videoUrl`     | string   | No       | URL/path                 | Video output.                     |
| `thumbnailUrl` | string   | No       | URL/path                 | Preview.                          |
| `outputImages` | string[] | Yes      | URLs/paths; may be empty | Rendered image outputs.           |
| `outputDir`    | string   | No       | Storage-relative path    | Render output directory.          |

### `SlideshowRecord`

Compatibility view over `ResultRecord`; no standalone maintained metadata
table.

| Field              | Type                | Required | Allowed values / format | Meaning                    |
| ------------------ | ------------------- | -------- | ----------------------- | -------------------------- |
| `ownerId`          | string              | No       | Appwrite user ID        | Owner.                     |
| `id`               | string              | Yes      | Domain ID               | Slideshow ID.              |
| `runId`            | string              | No       | Run ID                  | Source run.                |
| `automationId`     | string              | No       | Automation ID           | Source automation.         |
| `title`            | string              | Yes      | Free string             | Title.                     |
| `caption`          | string              | Yes      | Free string             | Caption.                   |
| `hashtags`         | string              | Yes      | Free string             | Hashtag text.              |
| `prompt`           | string              | Yes      | Free string             | Generation prompt.         |
| `image_collection` | string              | Yes      | Collection ID           | Primary source collection. |
| `slideshow_type`   | string              | Yes      | Free/normalized string  | Slideshow subtype.         |
| `created_at`       | ISO datetime        | Yes      | ISO 8601                | Creation time.             |
| `updated_at`       | ISO datetime        | Yes      | ISO 8601                | Last update.               |
| `settings`         | `SlideshowSettings` | Yes      | See below               | Global render settings.    |
| `images`           | `SlideshowSlide[]`  | Yes      | Array                   | Slides.                    |
| `status`           | string enum         | Yes      | `exported`, `failed`    | Render status.             |
| `output_dir`       | string              | No       | Storage-relative path   | Render directory.          |
| `output_images`    | string[]            | Yes      | URLs/paths              | Rendered slides.           |
| `video_url`        | string              | No       | URL/path                | Rendered video.            |
| `thumbnail_url`    | string              | No       | URL/path                | Preview image.             |

### `SlideshowSettings`

| Field              | Type    | Required | Allowed values / format               | Meaning              |
| ------------------ | ------- | -------- | ------------------------------------- | -------------------- |
| `duration`         | number  | Yes      | Positive seconds                      | Slide duration.      |
| `aspect_ratio`     | string  | Yes      | Normally automation aspect-ratio enum | Global ratio.        |
| `font`             | string  | Yes      | Font family                           | Global font.         |
| `background_color` | string  | Yes      | CSS color                             | Canvas background.   |
| `transition_style` | string  | Yes      | Registered transition                 | Transition.          |
| `export_as_video`  | boolean | Yes      | `true`, `false`                       | Video render toggle. |
| `sound_id`         | string  | Yes      | Provider ID or empty string           | Sound ID.            |
| `sound_name`       | string  | Yes      | Free string                           | Sound name.          |
| `sound_url`        | string  | Yes      | URL or empty string                   | Sound source.        |

### `GeneratedVideoExport`

Persistence: `outputs`, `source_key=generated_video`.

| Field                 | Type         | Required | Allowed values / format                    | Meaning                      |
| --------------------- | ------------ | -------- | ------------------------------------------ | ---------------------------- |
| `ownerId`             | string       | No       | Appwrite user ID                           | Owner.                       |
| `id`                  | string       | Yes      | Stable domain ID                           | Export ID.                   |
| `type`                | string enum  | Yes      | `greenscreen`, `ugc_ad`, `template_video`  | Export family.               |
| `status`              | string enum  | Yes      | `queued`, `processing`, `ready`, `failed`  | Generation lifecycle.        |
| `createdAt`           | ISO datetime | Yes      | ISO 8601                                   | Creation time.               |
| `updatedAt`           | ISO datetime | Yes      | ISO 8601                                   | Last update.                 |
| `title`               | string       | Yes      | Free string                                | Title.                       |
| `description`         | string       | Yes      | Free string                                | Description/copy.            |
| `hashtags`            | string[]     | Yes      | Array                                      | Hashtags.                    |
| `sourceConfig`        | object       | Yes      | JSON object                                | Generator-specific inputs.   |
| `sourceAutomationId`  | string       | No       | Automation ID                              | Originating automation.      |
| `sourceRunId`         | string       | No       | Run ID                                     | Originating run.             |
| `publication`         | object       | No       | JSON object                                | Publication summary.         |
| `queuePosition`       | number       | No       | Non-negative integer; only pending records | Approximate queue position.  |
| `previewUrl`          | string       | No       | URL/path                                   | Preview.                     |
| `videoUrl`            | string       | No       | URL/path                                   | Final video.                 |
| `error`               | string       | No       | Free string                                | Failure detail.              |
| `manuallyPublishedAt` | ISO datetime | No       | ISO 8601                                   | Manual publication evidence. |
| `deletionBlockedBy`   | string enum  | No       | `published`, `scheduled`                   | Why deletion is blocked.     |

## X and Threads automation

### `XAutomationRecord`

Persistence: `x_automations`.

| Field                             | Type                          | Required | Allowed values / format                                | Meaning                          |
| --------------------------------- | ----------------------------- | -------- | ------------------------------------------------------ | -------------------------------- |
| `id`                              | string                        | Yes      | Stable domain ID                                       | Automation ID.                   |
| `ownerId`                         | string                        | No       | Appwrite user ID                                       | Owner.                           |
| `platform`                        | string enum                   | Yes      | `x`, `threads`                                         | Target platform.                 |
| `name`                            | string                        | Yes      | Free string                                            | Display name.                    |
| `status`                          | string enum                   | Yes      | `live`, `paused`                                       | Lifecycle.                       |
| `createdAt`                       | ISO datetime                  | Yes      | ISO 8601                                               | Creation time.                   |
| `updatedAt`                       | ISO datetime                  | Yes      | ISO 8601                                               | Last update.                     |
| `niche.label`                     | string                        | Yes      | Free string                                            | Niche label.                     |
| `brief`                           | `XAutomationBrief` or null    | Yes      | Object or `null`                                       | Inferred/editorial brief.        |
| `excludedTopics`                  | string[]                      | Yes      | Array                                                  | Prohibited topics.               |
| `proofBank`                       | `ProofEntry[]`                | Yes      | `kind`: `result`, `testimonial`, `stat`                | Approved proof.                  |
| `output.contentType`              | string enum                   | Yes      | `single`, `thread`, `article`                          | Output form.                     |
| `output.archetype`                | string enum                   | Yes      | See archetypes below                                   | Writing structure.               |
| `output.singleLength`             | string enum                   | Yes      | `short`, `standard`, `long`                            | Single-post length.              |
| `output.maxCharacters`            | number                        | Yes      | Positive integer                                       | Platform character ceiling.      |
| `output.threadPostCount`          | range                         | Yes      | `{ min, max }`                                         | Thread length.                   |
| `output.articleWordCount`         | range                         | Yes      | `{ min, max }`                                         | Article length.                  |
| `generation.model`                | string                        | Yes      | Registered model ID                                    | Text model.                      |
| `generation.autoInferBrief`       | boolean                       | Yes      | `true`, `false`                                        | Infer brief automatically.       |
| `generation.language`             | string                        | Yes      | Language label/code                                    | Language.                        |
| `generation.hookStyles`           | string[]                      | Yes      | Array                                                  | Hook directions.                 |
| `generation.voicePreset`          | string                        | Yes      | Registered/free preset                                 | Voice preset.                    |
| `generation.voiceOverride`        | string                        | Yes      | Free string                                            | Custom voice direction.          |
| `media.mode`                      | string enum                   | Yes      | `none`, `generate`                                     | Image generation policy.         |
| `media.aspectRatio`               | string enum                   | Yes      | `1:1`, `4:5`, `16:9`                                   | Generated-image ratio.           |
| `media.prompt`                    | string                        | Yes      | Free string                                            | Image prompt direction.          |
| `discovery.enabled`               | boolean                       | Yes      | `true`, `false`                                        | Trend discovery.                 |
| `discovery.sources`               | string[]                      | Yes      | `x`, `tiktok`, `instagram`                             | Discovery networks.              |
| `discovery.lookbackHours`         | number                        | Yes      | Positive number                                        | Discovery window.                |
| `discovery.minimumViews`          | number                        | Yes      | Non-negative number                                    | View threshold.                  |
| `discovery.minimumEngagementRate` | number                        | Yes      | Non-negative percentage                                | Engagement threshold.            |
| `discovery.reactionMode`          | string enum                   | Yes      | `none`, `repost`, `quote`                              | Reaction behavior.               |
| `benchmarks`                      | `XAutomationBenchmark[]`      | Yes      | Array                                                  | Reference posts.                 |
| `publishing.integrations`         | `PostFastSocialIntegration[]` | Yes      | Array                                                  | Targets.                         |
| `publishing.autoPost`             | boolean                       | Yes      | `true`, `false`                                        | Auto-publication.                |
| `schedule`                        | `AutomationSchedule`          | Yes      | See earlier table                                      | Schedule.                        |
| `usage`                           | object                        | Yes      | Recent archetypes/hooks/bodies                         | Bounded repetition memory.       |
| `operations`                      | `XAutomationOperation[]`      | Yes      | `kind`: `derive_brief`; status `succeeded` or `failed` | Auditable background operations. |

Allowed `output.archetype` values: `educational_thread`, `data_drop`,
`pattern_drop`, `contrarian_take`, `numbered_list`, `comparison`,
`mistake_breakdown`, `opinion_framework`, `label_take`,
`provocative_polemic`, `audience_callout`, `question_bait`,
`analogy_reframe`, `micro_story`, `credibility_claim`, `win_celebration`, and
`controversial_humor`.

### `XAutomationRun`

Persistence: `outputs`, `source_key=x_automation_run`.

| Field             | Type               | Required | Allowed values / format                                     | Meaning                      |
| ----------------- | ------------------ | -------- | ----------------------------------------------------------- | ---------------------------- |
| `id`              | string             | Yes      | Stable domain ID                                            | Run ID.                      |
| `ownerId`         | string             | No       | Appwrite user ID                                            | Owner.                       |
| `requestId`       | string             | No       | Correlation/idempotency ID                                  | Request identity.            |
| `automationId`    | string             | Yes      | Automation ID                                               | Parent.                      |
| `automationName`  | string             | Yes      | Free string                                                 | Snapshot name.               |
| `topic`           | string             | Yes      | Free string                                                 | Topic.                       |
| `archetype`       | string enum        | No       | X archetypes listed above                                   | Selected archetype.          |
| `inferredBrief`   | object             | No       | `XInferredContentBrief`                                     | Run-specific inferred brief. |
| `contentType`     | string enum        | Yes      | `single`, `thread`, `article`                               | Output form.                 |
| `platform`        | string enum        | Yes      | `x`, `threads`                                              | Target.                      |
| `reactionMode`    | string enum        | Yes      | `none`, `repost`, `quote`                                   | Reaction behavior.           |
| `sourceCandidate` | object             | No       | `XTrendCandidate`                                           | Discovered source.           |
| `hook`            | string             | Yes      | Free string                                                 | Hook stage.                  |
| `setup`           | string             | Yes      | Free string                                                 | Setup stage.                 |
| `content`         | string[]           | Yes      | Array                                                       | Content stages.              |
| `proof`           | string             | Yes      | Free string                                                 | Proof stage.                 |
| `curiosityGap`    | string             | Yes      | Free string                                                 | Curiosity stage.             |
| `cta`             | string             | Yes      | Free string                                                 | CTA stage.                   |
| `posts`           | `XGeneratedPost[]` | Yes      | Roles `hook`, `setup`, `content`, `proof`, `gap`, `cta`     | Final post units.            |
| `articleTitle`    | string             | No       | Free string                                                 | Article title.               |
| `articleBody`     | string             | No       | Free string                                                 | Article body.                |
| `imagePrompt`     | string             | No       | Free string                                                 | Generated-image prompt.      |
| `imageUrls`       | string[]           | Yes      | URLs/paths                                                  | Generated media.             |
| `benchmark`       | object             | Yes      | `XAutomationBenchmarkScore`                                 | Quality score/evaluation.    |
| `status`          | string enum        | Yes      | `draft`, `approved`, `scheduled`, `published`, `failed`     | Run/content lifecycle.       |
| `scheduledFor`    | ISO datetime       | No       | ISO 8601                                                    | Publication time.            |
| `createdAt`       | ISO datetime       | Yes      | ISO 8601                                                    | Creation time.               |
| `updatedAt`       | ISO datetime       | Yes      | ISO 8601                                                    | Last update.                 |
| `error`           | string             | No       | Free string                                                 | Failure detail.              |
| `publishing`      | object             | No       | Attempt time, published/failed counts, optional skip reason | Publication receipt.         |
| `plans`           | object[]           | No       | Platform, archetype, pillar, hook style, review flag        | Multi-plan trace.            |
| `needsReview`     | boolean            | No       | `true`, `false`                                             | Review gate.                 |
| `reviewErrors`    | string[]           | No       | Array                                                       | Review failures.             |

## Collections and assets

### `StoredImageCollection`

Persistence: `permanent_assets`, `source_key=image_collection`.

| Field                   | Type         | Required | Allowed values / format                              | Meaning                                       |
| ----------------------- | ------------ | -------- | ---------------------------------------------------- | --------------------------------------------- |
| `ownerId`               | string       | No       | Appwrite user ID                                     | Owner.                                        |
| `name`                  | string       | Yes      | Non-empty string                                     | Effective upsert identity.                    |
| `created_at`            | ISO datetime | Yes      | ISO 8601                                             | Creation time; paired with name for deletion. |
| `pinned`                | boolean      | No       | `true`, `false`                                      | Pin state.                                    |
| `mediaType`             | string enum  | No       | `image`, `video`                                     | Collection media family.                      |
| `deletedAt`             | ISO datetime | No       | ISO 8601                                             | Soft-deletion time.                           |
| `deletedUntil`          | ISO datetime | No       | ISO 8601                                             | Recovery/purge deadline.                      |
| `images`                | media item[] | Yes      | Array; compatibility field name also used for videos | Collection contents.                          |
| `images[].image_link`   | string       | Yes      | URL/path                                             | Media URL.                                    |
| `images[].caption`      | string       | Yes      | Free string                                          | Search/generation caption.                    |
| `images[].hash`         | string       | No       | Digest                                               | Content identity.                             |
| `images[].last_used_at` | ISO datetime | No       | ISO 8601                                             | Latest confirmed use.                         |

### `WordCollectionRecord`

Persistence: `permanent_assets`, `source_key=word_collection`.

| Field         | Type         | Required | Allowed values / format               | Meaning                  |
| ------------- | ------------ | -------- | ------------------------------------- | ------------------------ |
| `id`          | string       | Yes      | Hook-variable tag; `YEAR` is rejected | Runtime variable ID.     |
| `name`        | string       | Yes      | Non-empty string                      | Display name.            |
| `description` | string       | No       | Free string                           | Description.             |
| `words`       | string[]     | Yes      | Normalized non-empty values           | Candidate substitutions. |
| `source`      | string enum  | Yes      | `manual`, `ai`                        | Creation source.         |
| `created_at`  | ISO datetime | Yes      | ISO 8601                              | Creation time.           |
| `updated_at`  | ISO datetime | Yes      | ISO 8601                              | Last update.             |

### `ProductCollection`

Persistence: `permanent_assets`, `source_key=product_collection`.

| Field                  | Type                      | Required | Allowed values / format | Meaning              |
| ---------------------- | ------------------------- | -------- | ----------------------- | -------------------- |
| `ownerId`              | string                    | No       | Appwrite user ID        | Owner.               |
| `id`                   | string                    | Yes      | Stable domain ID        | Collection ID.       |
| `name`                 | string                    | Yes      | Non-empty string        | Display name.        |
| `description`          | string                    | Yes      | Free string             | Description.         |
| `items`                | `ProductCollectionItem[]` | Yes      | Array                   | Products.            |
| `createdAt`            | ISO datetime              | Yes      | ISO 8601                | Creation time.       |
| `updatedAt`            | ISO datetime              | Yes      | ISO 8601                | Last update.         |
| `commissionDisclaimer` | string                    | Yes      | Free string             | Required disclosure. |
| `commissionSourceUrl`  | string                    | No       | URL                     | Commission source.   |

### `ProductCollectionItem`

| Field                 | Type           | Required | Allowed values / format | Meaning                    |
| --------------------- | -------------- | -------- | ----------------------- | -------------------------- |
| `id`                  | string         | Yes      | Stable domain ID        | Product ID.                |
| `marketplace`         | string enum    | Yes      | `amazon`, `shopee`      | Marketplace.               |
| `marketplaceUrl`      | string         | Yes      | URL                     | Product URL.               |
| `name`                | string         | Yes      | Free string             | Product name.              |
| `currency`            | string literal | Yes      | `SGD`                   | Currency.                  |
| `price`               | number         | Yes      | Non-negative            | Numeric price.             |
| `priceLabel`          | string         | Yes      | Free string             | Display price.             |
| `commissionRate`      | number         | Yes      | Numeric rate            | Commission rate.           |
| `estimatedCommission` | number         | Yes      | Non-negative            | Estimated amount.          |
| `storeImageUrl`       | string         | Yes      | URL/path                | Marketplace image.         |
| `generatedImageUrl`   | string         | Yes      | URL/path                | Generated lifestyle image. |
| `useCase`             | string         | Yes      | Free string             | Creative use case.         |
| `sourcedAt`           | ISO datetime   | Yes      | ISO 8601                | Source time.               |

### `AssetRecord`

Persistence: `permanent_assets`, `source_key=uploaded_asset`.

| Field          | Type         | Required | Allowed values / format                                                       | Meaning                    |
| -------------- | ------------ | -------- | ----------------------------------------------------------------------------- | -------------------------- |
| `ownerId`      | string       | No       | Appwrite user ID                                                              | Owner.                     |
| `id`           | string       | Yes      | Stable domain ID                                                              | Asset ID.                  |
| `kind`         | string enum  | Yes      | `image`, `video`, `audio`, `text`                                             | Media kind.                |
| `source`       | string enum  | Yes      | `upload`, `ai_generated`                                                      | Creation source.           |
| `status`       | string enum  | Yes      | `processing`, `ready`, `failed`                                               | Asset lifecycle.           |
| `scope`        | string enum  | Yes      | `ugc_ad`, `ugc_demo`, `greenscreen`, `global`                                 | Feature scope.             |
| `category`     | string enum  | No       | `outfit`, `accessory`, `background`, `product`, `reference`, `sound`, `other` | Semantic category.         |
| `name`         | string       | Yes      | Free string                                                                   | Display name.              |
| `caption`      | string       | Yes      | Free string                                                                   | Search/generation caption. |
| `prompt`       | string       | No       | Free string                                                                   | Generation prompt.         |
| `model`        | string       | No       | Provider model ID                                                             | Generation model.          |
| `mimeType`     | string       | No       | MIME type                                                                     | Content type.              |
| `fileName`     | string       | No       | File name                                                                     | Original/stored name.      |
| `fileUrl`      | string       | No       | URL/path                                                                      | Media URL.                 |
| `thumbnailUrl` | string       | No       | URL/path                                                                      | Preview.                   |
| `createdAt`    | ISO datetime | Yes      | ISO 8601                                                                      | Creation time.             |
| `updatedAt`    | ISO datetime | Yes      | ISO 8601                                                                      | Last update.               |
| `metadata`     | object       | No       | JSON object                                                                   | Provider/feature metadata. |
| `error`        | string       | No       | Free string                                                                   | Failure detail.            |

## Publishing, calendar, and analytics

### `PostFastSocialIntegration`

| Field            | Type        | Required | Allowed values / format                                                                                                                                                                          | Meaning                |
| ---------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `provider`       | string enum | Yes      | `tiktok`, `tiktok-creative`, `tiktok-seller`, `youtube`, `instagram`, `facebook`, `x`, `twitter`, `linkedin`, `threads`, `pinterest`, `bluesky`, `telegram`, `google`, `google-business-profile` | Network/provider.      |
| `integration_id` | string      | Yes      | Provider integration ID                                                                                                                                                                          | Connected account.     |
| `name`           | string      | Yes      | Free string                                                                                                                                                                                      | Account name.          |
| `profile`        | string      | No       | Handle/profile string                                                                                                                                                                            | Public identity.       |
| `picture`        | string      | No       | URL                                                                                                                                                                                              | Avatar.                |
| `disabled`       | boolean     | No       | `true`, `false`                                                                                                                                                                                  | Target disabled state. |

### `PostFastPostRecord`

Persistence: embedded in `outputs.publications`.

| Field                   | Type              | Required | Allowed values / format                                                                                                       | Meaning                      |
| ----------------------- | ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `id`                    | string            | Yes      | Stable domain ID                                                                                                              | Publication record ID.       |
| `sourceType`            | string enum       | Yes      | `automation`, `x_automation`, `generated_video`, `asset`, `greenscreen`, `ugc_ad`, `image`, `slideshow`, `manual`, `external` | Origin type.                 |
| `sourceId`              | string            | Yes      | Domain ID                                                                                                                     | Origin record.               |
| `postfastPostId`        | string            | No       | PostFast ID                                                                                                                   | Remote post.                 |
| `integrationId`         | string            | Yes      | Integration ID                                                                                                                | Destination account.         |
| `provider`              | string            | Yes      | Provider string                                                                                                               | Destination network.         |
| `status`                | string enum       | Yes      | `awaiting_manual_post`, `ready_for_review`, `draft`, `scheduled`, `published`, `failed`                                       | Publication lifecycle.       |
| `scheduledAt`           | ISO datetime      | No       | ISO 8601                                                                                                                      | Scheduled time.              |
| `publishedAt`           | ISO datetime      | No       | ISO 8601                                                                                                                      | Publication time.            |
| `releaseUrl`            | string            | No       | URL                                                                                                                           | Published post.              |
| `linkState`             | string enum       | Yes      | `postfast_published`, `manually_linked`, `unlinked`                                                                           | Attribution/link state.      |
| `statsSources`          | string[]          | Yes      | `postfast`, `tiktok_studio`                                                                                                   | Available analytics sources. |
| `externalPostId`        | string            | No       | Provider post ID                                                                                                              | Manually linked post.        |
| `content`               | string            | Yes      | Free string                                                                                                                   | Published copy.              |
| `media`                 | `PostFastMedia[]` | Yes      | `type`: `IMAGE` or `VIDEO`; optional `sortOrder`                                                                              | Uploaded media references.   |
| `createdAt`             | ISO datetime      | Yes      | ISO 8601                                                                                                                      | Creation time.               |
| `updatedAt`             | ISO datetime      | Yes      | ISO 8601                                                                                                                      | Last update.                 |
| `lastSyncedAt`          | ISO datetime      | No       | ISO 8601                                                                                                                      | Publication sync time.       |
| `lastAnalyticsSyncedAt` | ISO datetime      | No       | ISO 8601                                                                                                                      | Analytics sync time.         |
| `analytics`             | metric series[]   | No       | Label + dated totals                                                                                                          | Provider analytics history.  |
| `error`                 | string            | No       | Free string                                                                                                                   | Publication failure.         |

### `CalendarItem`

Computed API view; not persisted.

| Field            | Type               | Required | Allowed values / format                                                                                   | Meaning                  |
| ---------------- | ------------------ | -------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| `id`             | string             | Yes      | Stable computed/source ID                                                                                 | Calendar identity.       |
| `status`         | string enum        | Yes      | `planned`, `generating`, `generation_failed`, `needs_action`, `draft`, `failed`, `scheduled`, `published` | Unified lifecycle.       |
| `datetime`       | ISO datetime       | Yes      | ISO 8601                                                                                                  | Primary display time.    |
| `slot`           | ISO datetime       | No       | Exact automation slot                                                                                     | Queue dedupe slot.       |
| `timezone`       | string             | Yes      | IANA timezone                                                                                             | Display/scheduling zone. |
| `automationId`   | string             | No       | Automation ID                                                                                             | Associated automation.   |
| `automationName` | string             | No       | Free string                                                                                               | Automation label.        |
| `targets`        | `CalendarTarget[]` | Yes      | Per-target provider/status                                                                                | Destinations.            |
| `source`         | string enum        | Yes      | `projection`, `job`, `local_post`, `postfast`                                                             | Materialization source.  |
| `sourceType`     | string             | Yes      | Domain source type                                                                                        | Origin category.         |
| `sourceId`       | string             | Yes      | Domain source ID                                                                                          | Origin record.           |
| `title`          | string             | Yes      | Free string                                                                                               | Display title.           |
| `excerpt`        | string             | No       | Free string                                                                                               | Preview text.            |
| `previewUrl`     | string             | No       | URL/path                                                                                                  | Preview media.           |
| `paused`         | boolean            | No       | `true`, `false`                                                                                           | Automation pause state.  |
| `error`          | string             | No       | Free string                                                                                               | Lifecycle failure.       |
| `links`          | object             | Yes      | Optional `content`, `automation`, `live`, `cancel`, `reschedule`, `retry` URLs                            | Available actions.       |
| `timestamps`     | object             | Yes      | Optional created/updated/scheduled/published/generated/expected times                                     | Timeline.                |

### `PostFastMetricSnapshot`

Persistence: `postfast_metric_snapshots`.

| Field            | Type                    | Required | Allowed values / format                                                                                                               | Meaning                  |
| ---------------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `id`             | string                  | Yes      | Deterministic post/time ID                                                                                                            | Snapshot ID.             |
| `postId`         | string                  | Yes      | Publication ID                                                                                                                        | Parent post.             |
| `platformPostId` | string                  | No       | Provider ID                                                                                                                           | Native post.             |
| `integrationId`  | string                  | Yes      | Integration ID                                                                                                                        | Account.                 |
| `provider`       | string                  | Yes      | Provider string                                                                                                                       | Network.                 |
| `capturedAt`     | ISO datetime            | Yes      | ISO 8601                                                                                                                              | Capture time.            |
| `publishedAt`    | ISO datetime            | No       | ISO 8601                                                                                                                              | Publication time.        |
| `content`        | string                  | No       | Free string                                                                                                                           | Post copy snapshot.      |
| `thumbnailUrl`   | string                  | No       | URL                                                                                                                                   | Preview.                 |
| `releaseUrl`     | string                  | No       | URL                                                                                                                                   | Published post.          |
| `sourceType`     | string                  | No       | Domain source type                                                                                                                    | Origin category.         |
| `sourceId`       | string                  | No       | Domain ID                                                                                                                             | Origin record.           |
| `contentType`    | string enum             | No       | `slideshow`, `video`, `image`, `text`, `external`                                                                                     | Normalized post form.    |
| `mediaCount`     | number                  | No       | Non-negative integer                                                                                                                  | Attached media count.    |
| `metrics`        | metric map              | Yes      | Keys `views`, `impressions`, `reach`, `likes`, `comments`, `shares`, `saves`, `clicks`, `followers`, `interactions`, `engagementRate` | Canonical metrics.       |
| `latestMetric`   | object                  | Yes      | JSON object                                                                                                                           | Latest provider payload. |
| `rawMetrics`     | number map              | Yes      | Provider metric keys                                                                                                                  | Raw numeric metrics.     |
| `observedKeys`   | string[]                | Yes      | Array                                                                                                                                 | Provider keys seen.      |
| `source`         | string enum             | No       | `postfast`, `tiktok_studio`                                                                                                           | Capture source.          |
| `tiktokStudio`   | `TikTokStudioAnalytics` | No       | See below                                                                                                                             | Studio-only detail.      |

### `TikTokStudioAnalytics`

| Field              | Type           | Required | Allowed values / format                                   | Meaning               |
| ------------------ | -------------- | -------- | --------------------------------------------------------- | --------------------- |
| `schemaVersion`    | number literal | Yes      | `1`                                                       | Payload version.      |
| `studioUrl`        | string         | Yes      | TikTok Studio URL                                         | Capture source.       |
| `capturedSections` | string[]       | Yes      | `overview`, `viewers`, `engagement`                       | Captured panels.      |
| `overview`         | object         | No       | Optional author/caption/time/photo and KPI fields         | Overview panel.       |
| `slides`           | object[]       | Yes      | Index, optional retention/like percentages and peak flags | Slide analytics.      |
| `trafficSources`   | number map     | Yes      | `{ source: percent }`                                     | Traffic distribution. |
| `searchTerms`      | object[]       | Yes      | `{ term, percent }`                                       | Search traffic.       |
| `audience`         | object         | No       | Viewer/follower percentages and age/gender/country maps   | Audience breakdown.   |

### `AccountFollowerSnapshot`

Persistence: `account_follower_snapshots`.

| Field           | Type         | Required | Allowed values / format | Meaning                     |
| --------------- | ------------ | -------- | ----------------------- | --------------------------- |
| `id`            | string       | Yes      | Stable deterministic ID | Snapshot ID.                |
| `integrationId` | string       | Yes      | Integration ID          | Account.                    |
| `provider`      | string       | Yes      | Provider string         | Network.                    |
| `capturedAt`    | ISO datetime | Yes      | ISO 8601                | Capture time.               |
| `followers`     | number       | Yes      | Non-negative integer    | Follower count.             |
| `netChange`     | number       | No       | Signed integer          | Change from prior snapshot. |

## Operations and access

### `Job`

Domain view over the `jobs` table.

| Field         | Type                 | Required | Allowed values / format                               | Meaning              |
| ------------- | -------------------- | -------- | ----------------------------------------------------- | -------------------- |
| `id`          | string               | Yes      | Deterministic Appwrite row ID                         | Job ID.              |
| `type`        | string               | Yes      | Registered worker job type                            | Dispatch key.        |
| `status`      | string enum          | Yes      | `queued`, `processing`, `completed`, `failed`, `dead` | Lifecycle.           |
| `payload`     | unknown              | Yes      | Parsed JSON/value                                     | Worker input.        |
| `result`      | unknown              | Yes      | Parsed JSON/value                                     | Worker result.       |
| `error`       | string or null       | Yes      | Free string or `null`                                 | Last failure.        |
| `attempts`    | number               | Yes      | Non-negative integer                                  | Attempts made.       |
| `maxAttempts` | number               | Yes      | Positive integer                                      | Retry ceiling.       |
| `availableAt` | ISO datetime or null | Yes      | ISO 8601 or `null`                                    | Earliest claim time. |
| `createdAt`   | ISO datetime or null | Yes      | ISO 8601 or `null`                                    | Creation time.       |
| `updatedAt`   | ISO datetime or null | Yes      | ISO 8601 or `null`                                    | Last update.         |
| `ownerId`     | string               | Yes      | Appwrite user ID                                      | Owner.               |

### `UsageRecord`

Persistence: `usage_ledger`.

| Field           | Type         | Required | Allowed values / format                                                    | Meaning                     |
| --------------- | ------------ | -------- | -------------------------------------------------------------------------- | --------------------------- |
| `id`            | string       | No       | Deterministic/generated ID                                                 | Ledger row.                 |
| `automation_id` | string       | Yes      | Automation ID                                                              | Scope.                      |
| `account_key`   | string       | No       | Stable account key                                                         | Destination-specific scope. |
| `hook_id`       | string       | No       | Hook ID                                                                    | Hook attribution.           |
| `kind`          | string enum  | Yes      | `hook_published`, `hook_combination_published`, `image`, `text`, `heading` | Reuse category.             |
| `key`           | string       | Yes      | Stable content/media key                                                   | Reuse identity.             |
| `run_id`        | string       | Yes      | Run ID                                                                     | Producing run.              |
| `used_at`       | ISO datetime | Yes      | ISO 8601                                                                   | Confirmed usage time.       |

### `WorkspaceMember`

Domain view over `workspace_members` plus Appwrite Teams.

| Field          | Type         | Required | Allowed values / format | Meaning            |
| -------------- | ------------ | -------- | ----------------------- | ------------------ |
| `id`           | string       | Yes      | Appwrite row ID         | Membership record. |
| `email`        | string       | Yes      | Email                   | Invited member.    |
| `status`       | string enum  | Yes      | `pending`, `accepted`   | Invitation state.  |
| `memberUserId` | string       | No       | Appwrite user ID        | Accepted user.     |
| `createdAt`    | ISO datetime | Yes      | ISO 8601                | Invitation time.   |

### `DemoVideo`

Domain view over `demos`; bytes live in the private `demos` bucket.

| Field       | Type         | Required | Allowed values / format    | Meaning                   |
| ----------- | ------------ | -------- | -------------------------- | ------------------------- |
| `id`        | string       | Yes      | Appwrite row/file ID       | Demo ID.                  |
| `title`     | string       | Yes      | Free string                | Display title.            |
| `createdAt` | ISO datetime | Yes      | ISO 8601                   | Creation time.            |
| `url`       | string       | Yes      | `/api/settings/demos/{id}` | Authenticated stream URL. |

## Maintenance rule

When a persisted type changes, update this page in the same change as its
TypeScript type and provisioning/migration code. Add new enum values explicitly;
do not replace a closed set with “string.” Legacy tables visible in a deployed
Appwrite project are not active contracts unless they appear in
`lib/appwrite-stores.ts` or a current direct store module.
