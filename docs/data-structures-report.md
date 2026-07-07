# Data Structures Report

Generated on 2026-07-06T14:14:26.163Z from exported TypeScript structures under `lib/`, `app/api/`, and `components/realfarm/`. Test files are excluded. Each data structure has its own table.

## Consolidated Model Notes

| Topic | Current structure | Notes |
| --- | --- | --- |
| Automation center | `Automation` -> `Workflow` -> `AutomationRunRecord` -> `ResultRecord` | Automation is the scheduling/input/output owner. Runs record execution. Results are the canonical persisted outputs. |
| Result persistence | `data/results/results.json` | New slideshow/video outputs are persisted as `ResultRecord` rows. |
| Slideshow compatibility | `SlideshowRecord` | Compatibility view over `ResultRecord.payload.type === "slideshow"`; new writes should not create fresh slideshow DB rows. |
| Draft removal | App output statuses are `succeeded`/`failed` for runs/results and `exported`/`failed` for slideshow compatibility | Remaining `draft` structures are PostFast/social publishing modes, not app draft objects. |
| Result scope | `ResultRecord` | A result belongs to one automation run through `automationId` and `runId`. |

## Automation (lib/automation-domain.ts)

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `type` | `AutomationType` | Yes |  |
| `workflow` | `Workflow` | Yes |  |
| `schedule` | `{ timezone: string; times: string[]; }` | Yes |  |
| `inputs` | `AutomationInputObject[]` | Yes |  |
| `outputs` | `AutomationOutputTarget[]` | Yes |  |

## Workflow

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `type` | `WorkflowType` | Yes |  |
| `templateId` | `string` | No |  |

## AutomationInputObject

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `{ type: "collection"; id: string; } \| { type: "swipe"; id: string; } \| { type: "asset"; id: string; }` | Yes | Union value. |

## AutomationOutputTarget

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `{ type: "account"; id: string; } \| { type: "download"; }` | Yes | Union value. |

## AutomationRunRecord

Source: `lib/automation-runner.ts`
  
Persisted automation execution record. Successful runs can have a corresponding `ResultRecord`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `automationId` | `string` | Yes |  |
| `automationTitle` | `string` | Yes |  |
| `scheduledFor` | `string` | Yes |  |
| `status` | `AutomationRunStatus` | Yes |  |
| `postfastRecordId` | `string` | No |  |
| `slideshowId` | `string` | No |  |
| `videoUrl` | `string` | No |  |
| `thumbnailUrl` | `string` | No |  |
| `outputImages` | `string[]` | No |  |
| `outputDir` | `string` | No |  |
| `socialStatuses` | `AutomationRunSocialStatus[]` | No |  |
| `renderedSlides` | `AutomationRunRenderedSlide[]` | No |  |
| `plan` | `AutomationRunPlan` | Yes |  |
| `createdAt` | `string` | Yes |  |
| `updatedAt` | `string` | Yes |  |
| `error` | `string` | No |  |

## ResultRecord

Source: `lib/results.ts`
  
Canonical persisted output object. Backing data: `data/results/results.json`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `automationId` | `string` | Yes |  |
| `runId` | `string` | Yes |  |
| `workflowType` | `ResultWorkflowType` | Yes |  |
| `title` | `string` | Yes |  |
| `status` | `ResultStatus` | Yes |  |
| `createdAt` | `string` | Yes |  |
| `updatedAt` | `string` | Yes |  |
| `artifacts` | `ResultArtifacts` | Yes |  |
| `payload` | `ResultPayload` | No |  |
| `destinationAccountIds` | `string[]` | Yes |  |

## ResultArtifacts

Source: `lib/results.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `slideshowId` | `string` | No |  |
| `videoUrl` | `string` | No |  |
| `thumbnailUrl` | `string` | No |  |
| `outputImages` | `string[]` | Yes |  |
| `outputDir` | `string` | No |  |

## ResultSlideshowPayload

Source: `lib/results.ts`
  
Slideshow-specific result payload. This replaces persisted slideshow drafts/output rows as the canonical metadata payload.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"slideshow"` | Yes |  |
| `caption` | `string` | Yes |  |
| `hashtags` | `string` | Yes |  |
| `prompt` | `string` | Yes |  |
| `imageCollectionId` | `string` | Yes |  |
| `slideshowType` | `string` | Yes |  |
| `settings` | `SlideshowSettings` | Yes |  |
| `slides` | `SlideshowSlide[]` | Yes |  |

## ResultVideoPayload

Source: `lib/results.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"video"` | Yes |  |
| `sourceUrl` | `string` | No |  |
| `settings` | `Record<string, unknown>` | No |  |

## SlideshowRecord

Source: `lib/slideshows.ts`
  
Compatibility view for existing slideshow UI/API consumers. New writes are backed by `ResultRecord`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `automationId` | `string` | No |  |
| `output_dir` | `string` | No |  |
| `output_images` | `string[]` | Yes |  |
| `video_url` | `string` | No |  |
| `thumbnail_url` | `string` | No |  |
| `title` | `string` | Yes |  |
| `caption` | `string` | Yes |  |
| `hashtags` | `string` | Yes |  |
| `status` | `SlideshowStatus` | Yes |  |
| `prompt` | `string` | Yes |  |
| `image_collection` | `string` | Yes |  |
| `slideshow_type` | `string` | Yes |  |
| `created_at` | `string` | Yes |  |
| `updated_at` | `string` | Yes |  |
| `is_finished` | `boolean` | Yes |  |
| `is_failed` | `boolean` | Yes |  |
| `settings` | `SlideshowSettings` | Yes |  |
| `images` | `SlideshowSlide[]` | Yes |  |

## CreateSlideshowInput

Source: `lib/slideshows.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `rootDir` | `string` | No |  |
| `resultRootDir` | `string` | No |  |
| `runId` | `string` | No |  |
| `automationId` | `string` | No |  |
| `title` | `string` | No |  |
| `caption` | `string` | No |  |
| `hashtags` | `string` | No |  |
| `status` | `SlideshowStatus` | No |  |
| `prompt` | `string` | No |  |
| `image_collection` | `string` | No |  |
| `slideshow_type` | `string` | No |  |
| `settings` | `Partial<SlideshowSettings>` | No |  |
| `images` | `Partial<SlideshowSlide>[]` | No |  |
| `slides` | `Partial<SlideshowSlide>[]` | No |  |
| `video_url` | `string` | No |  |
| `thumbnail_url` | `string` | No |  |
| `is_finished` | `boolean` | No |  |
| `is_failed` | `boolean` | No |  |

## RenderedVideoUpload

Source: `components/realfarm/generated-video-renderer.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `videoUrl` | `string` | Yes |  |
| `thumbnailUrl` | `string` | Yes |  |

## GeneratedVideoExportUpdatePayload

Source: `components/realfarm/generated-video-workflow.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `status` | `GeneratedVideoStatus` | Yes |  |
| `previewUrl` | `string` | No |  |
| `videoUrl` | `string` | No |  |
| `error` | `string` | No |  |

## ViewerImage

Source: `components/realfarm/image-viewer-modal.tsx`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `imageUrl` | `string` | Yes |  |
| `title` | `string` | Yes |  |

## ViewKey

Source: `components/realfarm/navigation.tsx`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"home" \| "swipes" \| "avatars" \| "greenscreen" \| "schedule" \| "analytics" \| "collections" \| "automations"` | Yes | Union value. |

## SocialAccountPublishStatus

Source: `components/realfarm/social-account-status.tsx`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"connected" \| "queued" \| "draft" \| "scheduled" \| "published" \| "failed" \| "disabled"` | Yes | Union value. |

## SocialAccountStatusItem

Source: `components/realfarm/social-account-status.tsx`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `provider` | `PostFastSocialProvider` | Yes |  |
| `integrationId` | `string` | Yes |  |
| `name` | `string` | Yes |  |
| `profile` | `string` | No |  |
| `status` | `SocialAccountPublishStatus` | Yes |  |
| `error` | `string` | No |  |

## SwipeDisplayEntry

Source: `components/realfarm/swipe-display-model.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `label` | `string` | Yes |  |
| `value` | `string` | Yes |  |

## SwipeDisplayModel

Source: `components/realfarm/swipe-display-model.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `advertiser` | `string` | Yes |  |
| `platform` | `SwipePlatform` | Yes |  |
| `source` | `string` | Yes |  |
| `sourceUrl` | `string` | Yes |  |
| `title` | `string` | Yes |  |
| `caption` | `string` | Yes |  |
| `format` | `SwipeRecord["format"]` | Yes |  |
| `cta` | `string` | No |  |
| `landingPageUrl` | `string` | No |  |
| `mediaUrl` | `string` | No |  |
| `screenshotPath` | `string` | No |  |
| `landingPageMobileScreenshotPath` | `string` | No |  |
| `landingPageDesktopScreenshotPath` | `string` | No |  |
| `landingPageCaptureError` | `string` | No |  |
| `transcript` | `string` | No |  |
| `processingStatus` | `SwipeRecord["processingStatus"]` | No |  |
| `processingError` | `string` | No |  |
| `swipedAt` | `string` | Yes |  |
| `folder` | `string` | Yes |  |
| `stats` | `SwipeDisplayEntry[]` | Yes |  |
| `metadata` | `SwipeDisplayEntry[]` | Yes |  |
| `ugcSummary` | `SwipeDisplayEntry[]` | Yes |  |

## GeneratedShowcaseRun

Source: `components/realfarm/template-showcase-preview.tsx`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `automationTitle` | `string` | No |  |
| `scheduledFor` | `string` | No |  |
| `status` | `string` | No |  |
| `createdAt` | `string` | No |  |
| `error` | `string` | No |  |
| `plan` | `{ title?: string; hook?: string; publishType?: string; language?: string; slides?: GeneratedShowcaseSlide[]; }` | No |  |

## GeneratedShowcaseSlide

Source: `components/realfarm/template-showcase-preview.tsx`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | No |  |
| `role` | `string` | No |  |
| `section` | `string` | No |  |
| `imageUrl` | `string` | No |  |
| `text` | `string` | No |  |
| `imageCaption` | `string` | No |  |
| `durationSeconds` | `number` | No |  |

## TemplateExampleSlide

Source: `components/realfarm/template-showcase-preview.tsx`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `imageUrl` | `string` | Yes |  |
| `text` | `string` | Yes |  |
| `section` | `"hook" \| "content" \| "cta"` | Yes |  |
| `durationSeconds` | `number` | No |  |

## TemplateExampleSlideshow

Source: `components/realfarm/template-showcase-preview.tsx`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `label` | `string` | Yes |  |
| `title` | `string` | Yes |  |
| `status` | `string` | Yes |  |
| `scheduledFor` | `string` | No |  |
| `createdAt` | `string` | No |  |
| `durationSeconds` | `number` | Yes |  |
| `caption` | `string` | Yes |  |
| `publishType` | `string` | No |  |
| `language` | `string` | No |  |
| `error` | `string` | No |  |
| `slides` | `TemplateExampleSlide[]` | Yes |  |

## AssetCategory

Source: `lib/assets.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"outfit" \| "accessory" \| "background" \| "product" \| "reference" \| "sound" \| "other"` | Yes | Union value. |

## AssetKind

Source: `lib/assets.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"image" \| "video" \| "audio" \| "text"` | Yes | Union value. |

## AssetListFilters

Source: `lib/assets.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `rootDir` | `string` | No |  |
| `scope` | `AssetScope` | No |  |
| `category` | `AssetCategory` | No |  |
| `kind` | `AssetKind` | No |  |

## AssetRecord

Source: `lib/assets.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `kind` | `AssetKind` | Yes |  |
| `source` | `AssetSource` | Yes |  |
| `status` | `AssetStatus` | Yes |  |
| `scope` | `AssetScope` | Yes |  |
| `category` | `AssetCategory` | No |  |
| `name` | `string` | Yes |  |
| `caption` | `string` | Yes |  |
| `prompt` | `string` | No |  |
| `model` | `string` | No |  |
| `mimeType` | `string` | No |  |
| `fileName` | `string` | No |  |
| `fileUrl` | `string` | No |  |
| `thumbnailUrl` | `string` | No |  |
| `createdAt` | `string` | Yes |  |
| `updatedAt` | `string` | Yes |  |
| `metadata` | `Record<string, unknown>` | No |  |
| `error` | `string` | No |  |

## AssetScope

Source: `lib/assets.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"ugc_avatar" \| "ugc_ad" \| "ugc_demo" \| "greenscreen" \| "global"` | Yes | Union value. |

## AssetSource

Source: `lib/assets.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"upload" \| "ai_generated"` | Yes | Union value. |

## AssetStatus

Source: `lib/assets.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"processing" \| "ready" \| "failed"` | Yes | Union value. |

## Account

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `provider` | `string` | Yes |  |
| `handle` | `string` | No |  |

## AutomationType

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"slideshow" \| "video"` | Yes | Union value. |

## Collection

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `title` | `string` | Yes |  |

## Publication

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `resultId` | `string` | Yes |  |
| `accountId` | `string` | Yes |  |
| `status` | `"queued" \| "scheduled" \| "published" \| "failed"` | Yes |  |

## Result

Source: `lib/automation-domain.ts`
  
Alias of `ResultRecord` so the domain has one result shape.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `ResultRecord` | Yes | Alias. |

## RunStatus

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"queued" \| "running" \| "succeeded" \| "failed"` | Yes | Union value. |

## Swipe

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `sourceUrl` | `string` | No |  |
| `createdAt` | `string` | Yes |  |

## Template

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `type` | `AutomationType` | Yes |  |
| `title` | `string` | Yes |  |

## WorkflowType

Source: `lib/automation-domain.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `AutomationType` | Yes | Alias. |

## AutomationRunPlan

Source: `lib/automation-runner.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | Yes |  |
| `caption` | `string` | Yes |  |
| `hashtags` | `string` | Yes |  |
| `hook` | `string` | Yes |  |
| `imageCollectionIds` | `string[]` | Yes |  |
| `slides` | `AutomationRunSlide[]` | Yes |  |
| `slideCount` | `{ mode: string; count?: number; min?: number; max?: number; }` | Yes |  |
| `publishType` | `string` | Yes |  |
| `autoMusic` | `boolean` | Yes |  |
| `autoPost` | `boolean` | Yes |  |
| `hookCandidates` | `string[]` | No |  |
| `textModel` | `string` | No |  |
| `language` | `string` | Yes |  |
| `translationProvider` | `"deepl"` | No |  |
| `debug` | `{ selectedHookIndex?: number; textModelPrompt?: SlideshowTextGenerationResult["promptPayload"]; }` | No |  |

## AutomationRunRenderedSlide

Source: `lib/automation-runner.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `role` | `AutomationRunSlide["role"]` | No |  |
| `imageUrl` | `string` | Yes |  |
| `sourceImageUrl` | `string` | No |  |
| `imageCaption` | `string` | No |  |
| `text` | `string` | Yes |  |
| `durationMs` | `number` | Yes |  |
| `aspectRatio` | `string` | Yes |  |

## AutomationRunResult

Source: `lib/automation-runner.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `created` | `AutomationRunRecord[]` | Yes |  |
| `results` | `ResultRecord[]` | Yes |  |
| `skipped` | `{ automationId: string; reason: "not_live" \| "not_due" \| "already_ran" \| "no_images"; scheduledFor?: string; }[]` | Yes |  |

## AutomationRunSlide

Source: `lib/automation-runner.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `role` | `"hook" \| "content" \| "cta"` | Yes |  |
| `imageUrl` | `string` | Yes |  |
| `imageCaption` | `string` | Yes |  |
| `text` | `string` | Yes |  |
| `textPlacement` | `"top"` | Yes |  |
| `aspectRatio` | `string` | No |  |
| `imageGrid` | `string` | No |  |
| `overlay` | `boolean` | No |  |
| `displayText` | `boolean` | No |  |
| `textItems` | `SlideshowTextItem[]` | No |  |

## AutomationRunSocialStatus

Source: `lib/automation-runner.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `provider` | `AutomationSchema["social_integrations"][number]["provider"]` | Yes |  |
| `integrationId` | `string` | Yes |  |
| `name` | `string` | Yes |  |
| `profile` | `string` | No |  |
| `status` | `PostFastPostStatus \| "queued" \| "disabled"` | Yes |  |
| `error` | `string` | No |  |

## AutomationRunStatus

Source: `lib/automation-runner.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"succeeded" \| "failed"` | Yes | Union value. |

## AutomationTemplateDefinition

Source: `lib/automation-templates.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `created_at` | `string` | Yes |  |
| `image_collection_ids` | `string` | Yes |  |
| `format` | `AutomationTemplateFormat` | Yes |  |
| `hooks` | `string[]` | Yes |  |

## AutomationTemplateExampleRun

Source: `lib/automation-templates.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `automationId` | `string` | Yes |  |
| `templateId` | `string` | Yes |  |
| `sourceTemplateId` | `string` | No |  |
| `sourceVideoId` | `string` | No |  |
| `createdAt` | `string` | Yes |  |
| `plan` | `{ slides?: { id?: string; imageUrl?: string; text?: string; imageCaption?: string; }[]; }` | No |  |

## AutomationTemplateFormat

Source: `lib/automation-templates.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `hook` | `{ aspect_ratio: AutomationAspectRatio; image_grid: AutomationImageGrid; overlay: boolean; display_text: boolean; text_items: AutomationTemplateTextItem[]; }` | Yes |  |
| `content` | `{ aspect_ratio: AutomationAspectRatio; image_grid: AutomationImageGrid; slide_count_mode: "static" \| "varying"; slide_count?: number; slide_count_min?: number; slide_count_max?: number; overlay: boolean; overlay_image?: { enabled: boolean; collection_id?: string; height: number; }; display_text: boolean; text_items: AutomationTemplateTextItem[]; }` | Yes |  |
| `cta` | `{ enabled: boolean; image_mode: AutomationImageMode; aspect_ratio: AutomationAspectRatio; image_grid: AutomationImageGrid; overlay: boolean; display_text: boolean; text_items: AutomationTemplateTextItem[]; }` | Yes |  |
| `tone` | `AutomationTemplateTone` | No |  |
| `custom_tone` | `string` | Yes |  |

## AutomationTemplateRecord

Source: `lib/automation-templates.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `sourceAutomationId` | `string` | No |  |
| `sourceUrl` | `string` | No |  |
| `name` | `string` | Yes |  |
| `theme` | `string` | Yes |  |
| `createdAt` | `string` | Yes |  |
| `updatedAt` | `string` | Yes |  |
| `template` | `AutomationTemplateDefinition` | Yes |  |

## AutomationTemplateTextItem

Source: `lib/automation-templates.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `font` | `string` | Yes |  |
| `font_size` | `string` | Yes |  |
| `text_style` | `string` | Yes |  |
| `text_position` | `string` | Yes |  |
| `text_item_width` | `string` | Yes |  |
| `word_length_min` | `number` | Yes |  |
| `word_length_max` | `number` | Yes |  |
| `content_direction` | `string` | Yes |  |
| `text_mode` | `"prompt" \| "static"` | Yes |  |
| `static_text` | `string` | Yes |  |
| `text_align` | `string` | Yes |  |
| `text_anchor` | `string` | Yes |  |

## AutomationTemplateTone

Source: `lib/automation-templates.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"Conversational & Relatable" \| "Motivational & Empowering" \| "Educational & Informative" \| "Bold & Provocative" \| "Calm & Reflective" \| "Witty & Humorous" \| "Custom"` | Yes | Union value. |

## AutomationRecord

Source: `lib/automations.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `sourceAutomationId` | `string` | No |  |
| `sourceUrl` | `string` | No |  |
| `name` | `string` | Yes |  |
| `status` | `AutomationRecordStatus` | Yes |  |
| `account` | `string` | Yes |  |
| `handle` | `string` | Yes |  |
| `times` | `string[]` | Yes |  |
| `favorite` | `boolean` | Yes |  |
| `theme` | `string` | Yes |  |
| `importedAt` | `string` | No |  |
| `updatedAt` | `string` | Yes |  |
| `schema` | `AutomationSchema` | Yes |  |
| `raw` | `Record<string, unknown>` | No |  |

## AutomationRecordStatus

Source: `lib/automations.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"live" \| "paused" \| "unknown"` | Yes | Union value. |

## StoredCharacterImageGenerationRecord

Source: `lib/character-image-generations.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `inherits` | `CharacterImageGenerationRecord` | Yes | Intersection member. |
| `characterId` | `number` | No |  |

## Character (lib/character-model.ts)

Source: `lib/character-model.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `string` | Yes |  |
| `age` | `number` | Yes |  |
| `ethnicity` | `string` | Yes |  |
| `gender` | `string` | Yes |  |
| `hair` | `{ length: string; texture: string; color: string; highlights?: string; style: string; part?: string; }` | Yes |  |
| `eyes` | `{ color: string; shape: string; details: string; }` | Yes |  |
| `facial_features` | `{ face_shape: string; forehead: string; jawline: string; chin: string; cheekbones: string; nose: string; lips: string; eyebrows: string; other_distinctive_features?: string; }` | Yes |  |
| `skin` | `{ tone: string; undertone: string; texture: string; visible_details: string; }` | Yes |  |
| `build` | `{ body_type: string; height_impression?: string; }` | Yes |  |
| `clothing` | `{ outfit_description: string; top?: string; bottoms?: string; footwear?: string; makeup?: string; }` | Yes |  |
| `posture_and_mannerisms` | `{ posture: string; body_language: string; gestures: string; }` | Yes |  |
| `emotional_baseline` | `{ primary_emotion: string; demeanor: string; communication_style: string; }` | Yes |  |
| `accessories` | `{ visible_accessories: string[]; no_visible_accessories?: boolean; }` | Yes |  |
| `voice` | `{ tone: string; clarity: string; vocal_quality: string; speech_patterns: string; }` | Yes |  |

## MicroCutSegment

Source: `lib/character-video-postprocess.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `start` | `number` | Yes |  |
| `end` | `number` | Yes |  |

## BedroomSelfieTemplateId

Source: `lib/character-workflows.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"barely_awake_oversized_tee" \| "tank_top_flirty_smile" \| "messy_bun_glasses" \| "sheet_pull_soft_smile_bralette"` | Yes | Union value. |

## ReferenceRecreationAnalysis

Source: `lib/character-workflows.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `composition` | `Record<string, unknown>` | Yes |  |
| `camera` | `Record<string, unknown>` | Yes |  |
| `pose` | `Record<string, unknown>` | Yes |  |
| `facial_expression` | `Record<string, unknown>` | Yes |  |
| `hair` | `Record<string, unknown>` | Yes |  |
| `clothing` | `Record<string, unknown>` | Yes |  |
| `accessories` | `Record<string, unknown>` | Yes |  |
| `environment` | `Record<string, unknown>` | Yes |  |
| `lighting` | `Record<string, unknown>` | Yes |  |
| `recreation_notes` | `Record<string, unknown>` | Yes |  |

## Character (lib/characters.ts)

Source: `lib/characters.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `string` | Yes |  |
| `age` | `number` | Yes |  |
| `ethnicity` | `string` | Yes |  |
| `gender` | `string` | Yes |  |
| `hair` | `{ length: string; texture: string; color: string; highlights?: string; style: string; part?: string; }` | Yes |  |
| `eyes` | `{ color: string; shape: string; details: string; }` | Yes |  |
| `facial_features` | `{ face_shape: string; forehead: string; jawline: string; chin: string; cheekbones: string; nose: string; lips: string; eyebrows: string; other_distinctive_features?: string; }` | Yes |  |
| `skin` | `{ tone: string; undertone: string; texture: string; visible_details: string; }` | Yes |  |
| `build` | `{ body_type: string; height_impression?: string; }` | Yes |  |
| `clothing` | `{ outfit_description: string; top?: string; bottoms?: string; footwear?: string; makeup?: string; }` | Yes |  |
| `posture_and_mannerisms` | `{ posture: string; body_language: string; gestures: string; }` | Yes |  |
| `emotional_baseline` | `{ primary_emotion: string; demeanor: string; communication_style: string; }` | Yes |  |
| `accessories` | `{ visible_accessories: string[]; no_visible_accessories?: boolean; }` | Yes |  |
| `voice` | `{ tone: string; clarity: string; vocal_quality: string; speech_patterns: string; }` | Yes |  |

## CharacterPayload

Source: `lib/characters.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `number` | No |  |
| `name` | `string` | Yes |  |
| `attributes` | `Character` | Yes |  |
| `preview_url` | `string` | No |  |

## CharacterRecord

Source: `lib/characters.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `number` | Yes |  |
| `user_id` | `string` | Yes |  |
| `name` | `string` | Yes |  |
| `attributes` | `Character` | Yes |  |
| `collection_id` | `string \| null` | Yes |  |
| `created_at` | `string` | Yes |  |
| `updated_at` | `string` | Yes |  |
| `preview_url` | `string` | Yes |  |

## FetchJsonOptions

Source: `lib/client-api.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `inherits` | `RequestInit` | Yes | Intersection member. |
| `timeoutMs` | `number` | No |  |
| `toastOnError` | `boolean` | No |  |

## GeneratedVideoCreatePayload

Source: `lib/generated-video-types.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `GeneratedVideoType` | Yes |  |
| `status` | `GeneratedVideoStatus` | No |  |
| `title` | `string` | No |  |
| `caption` | `string` | No |  |
| `sourceConfig` | `Record<string, unknown>` | No |  |
| `previewUrl` | `string` | No |  |
| `videoUrl` | `string` | No |  |

## GeneratedVideoExport

Source: `lib/generated-video-types.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `type` | `GeneratedVideoType` | Yes |  |
| `status` | `GeneratedVideoStatus` | Yes |  |
| `createdAt` | `string` | Yes |  |
| `updatedAt` | `string` | Yes |  |
| `title` | `string` | Yes |  |
| `caption` | `string` | Yes |  |
| `sourceConfig` | `Record<string, unknown>` | Yes |  |
| `queuePosition` | `number` | No |  |
| `previewUrl` | `string` | No |  |
| `videoUrl` | `string` | No |  |
| `error` | `string` | No |  |

## GeneratedVideoStatus

Source: `lib/generated-video-types.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"queued" \| "processing" \| "ready" \| "failed"` | Yes | Union value. |

## GeneratedVideoType

Source: `lib/generated-video-types.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"greenscreen" \| "ugc_ad"` | Yes | Union value. |

## GeneratedVideoListFilters

Source: `lib/generated-videos.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `rootDir` | `string` | No |  |
| `type` | `GeneratedVideoType` | No |  |

## ImageCollectionDeleteInput

Source: `lib/image-collections.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `Pick<StoredImageCollection, "name" \| "created_at">` | Yes | Utility type alias. |

## StoredImageCollection (lib/image-collections.ts)

Source: `lib/image-collections.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `string` | Yes |  |
| `created_at` | `string` | Yes |  |
| `images` | `{ image_link: string; caption: string; }[]` | Yes |  |

## KieImageActionResult

Source: `lib/kie-image.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `taskId` | `string` | Yes |  |
| `imageUrl` | `string` | Yes |  |

## KieImageMode

Source: `lib/kie-image.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"edit" \| "upscale"` | Yes | Union value. |

## OpenRouterModelSummary

Source: `lib/openrouter-models.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `name` | `string` | Yes |  |
| `contextLength` | `number \| null` | Yes |  |
| `promptPrice` | `string` | Yes |  |
| `completionPrice` | `string` | Yes |  |
| `supportsResponseFormat` | `boolean` | Yes |  |
| `supportsStructuredOutputs` | `boolean` | Yes |  |

## PinterestActorInput

Source: `lib/pinterest-search.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `queries` | `string[]` | No |  |
| `startUrls` | `string[]` | No |  |
| `type` | `"all-pins"` | Yes |  |
| `limit` | `number` | Yes |  |
| `content_analysis` | `false` | Yes |  |
| `sentinent_analysis` | `false` | Yes |  |
| `proxyConfiguration` | `{ useApifyProxy: true; apifyProxyGroups: [ "RESIDENTIAL" ]; }` | Yes |  |

## PinterestSearchResult

Source: `lib/pinterest-search.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `title` | `string` | Yes |  |
| `description` | `string` | Yes |  |
| `imageUrl` | `string` | Yes |  |
| `sourceUrl` | `string` | Yes |  |
| `dominantColor` | `string` | Yes |  |
| `width` | `number` | No |  |
| `height` | `number` | No |  |

## PostFastCreatePostInput

Source: `lib/postfast-client.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `PostFastCreatePostType` | No |  |
| `date` | `string` | No |  |
| `integrationId` | `string` | Yes |  |
| `provider` | `string` | Yes |  |
| `content` | `string` | Yes |  |
| `media` | `PostFastMedia[]` | No |  |
| `controls` | `Record<string, unknown>` | No |  |

## PostFastCreatePostPayload

Source: `lib/postfast-client.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `status` | `"DRAFT" \| "SCHEDULED"` | Yes |  |
| `posts` | `{ content: string; mediaItems?: { key: string; type: PostFastMediaType; sortOrder: number; }[]; scheduledAt?: string; socialMediaId: string; status: "DRAFT" \| "SCHEDULED"; }[]` | Yes |  |
| `controls` | `Record<string, unknown>` | No |  |

## PostFastCreatePostType

Source: `lib/postfast-client.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"draft" \| "schedule" \| "now"` | Yes | Union value. |

## PostFastFetch

Source: `lib/postfast-client.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `(url: string \| URL \| Request, init?: RequestInit) => Promise<Response>` | Yes | Alias. |

## PostFastMedia

Source: `lib/postfast-client.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `key` | `string` | Yes |  |
| `type` | `PostFastMediaType` | Yes |  |
| `sortOrder` | `number` | No |  |

## PostFastMediaType

Source: `lib/postfast-client.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"IMAGE" \| "VIDEO"` | Yes | Union value. |

## PostFastRequestOptions

Source: `lib/postfast-client.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `apiKey` | `string` | No |  |
| `baseUrl` | `string` | No |  |
| `fetcher` | `PostFastFetch` | No |  |
| `method` | `string` | No |  |
| `query` | `Record<string, string \| number \| boolean \| undefined>` | No |  |
| `body` | `unknown` | No |  |
| `headers` | `Record<string, string>` | No |  |

## PostFastSocialIntegration

Source: `lib/postfast-client.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `provider` | `PostFastSocialProvider` | Yes |  |
| `integration_id` | `string` | Yes |  |
| `name` | `string` | Yes |  |
| `profile` | `string` | No |  |
| `picture` | `string` | No |  |
| `disabled` | `boolean` | No |  |

## PostFastSocialProvider

Source: `lib/postfast-client.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"tiktok" \| "tiktok-creative" \| "tiktok-seller" \| "youtube" \| "instagram" \| "facebook" \| "x" \| "twitter" \| "linkedin" \| "threads" \| "pinterest" \| "bluesky" \| "telegram" \| "google" \| "google-business-profile"` | Yes | Union value. |

## PostFastAnalyticsMetric

Source: `lib/postfast-posts.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `label` | `string` | Yes |  |
| `data` | `PostFastAnalyticsPoint[]` | Yes |  |
| `percentageChange` | `number` | No |  |

## PostFastAnalyticsPoint

Source: `lib/postfast-posts.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `date` | `string` | Yes |  |
| `total` | `string \| number` | Yes |  |

## PostFastPostRecord

Source: `lib/postfast-posts.ts`
  
External/social publishing record. Its `draft` status is a publishing mode, not an app draft object.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `sourceType` | `PostFastSourceType` | Yes |  |
| `sourceId` | `string` | Yes |  |
| `postfastPostId` | `string` | No |  |
| `integrationId` | `string` | Yes |  |
| `provider` | `string` | Yes |  |
| `status` | `PostFastPostStatus` | Yes |  |
| `scheduledAt` | `string` | No |  |
| `releaseUrl` | `string` | No |  |
| `content` | `string` | Yes |  |
| `media` | `PostFastMedia[]` | Yes |  |
| `createdAt` | `string` | Yes |  |
| `updatedAt` | `string` | Yes |  |
| `lastSyncedAt` | `string` | No |  |
| `lastAnalyticsSyncedAt` | `string` | No |  |
| `analytics` | `PostFastAnalyticsMetric[]` | No |  |
| `error` | `string` | No |  |

## PostFastPostStatus

Source: `lib/postfast-posts.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"draft" \| "scheduled" \| "published" \| "failed"` | Yes | Union value. |

## PostFastSourceType

Source: `lib/postfast-posts.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"automation" \| "generated_video" \| "asset" \| "greenscreen" \| "ugc_ad" \| "image" \| "swipe" \| "slideshow" \| "manual"` | Yes | Union value. |

## PostFastFacebookControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `facebookContentType` | `"POST" \| "REEL" \| "STORY"` | Yes |  |

## PostFastGoogleBusinessControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `gbpLocationId` | `string` | Yes |  |
| `gbpPostType` | `"STANDARD" \| "EVENT" \| "OFFER"` | Yes |  |
| `gbpEventStartDate` | `string` | Yes |  |
| `gbpEventEndDate` | `string` | Yes |  |

## PostFastInstagramControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `instagramPublishType` | `"TIMELINE" \| "REEL" \| "STORY"` | Yes |  |
| `instagramPostToGrid` | `boolean` | Yes |  |

## PostFastKnownProvider

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `keyof PostFastProviderControlsByProvider` | Yes | Alias. |

## PostFastKnownProviderControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `PostFastProviderControlsByProvider[PostFastKnownProvider]` | Yes | Alias. |

## PostFastLinkedInControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `linkedinAttachmentKey` | `string` | Yes |  |
| `linkedinVisibility` | `"PUBLIC" \| "CONNECTIONS"` | Yes |  |

## PostFastNoExtraPlatformControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `Record<string, never>` | Yes | Utility type alias. |

## PostFastPinterestControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `pinterestBoardId` | `string` | Yes |  |
| `pinterestLink` | `string` | Yes |  |

## PostFastProvider

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"x" \| "tiktok" \| "tiktok-creative" \| "tiktok-seller" \| "facebook" \| "instagram" \| "youtube" \| "linkedin" \| "threads" \| "pinterest" \| "bluesky" \| "telegram" \| "google" \| "google-business-profile" \| string` | Yes | Union value. |

## PostFastProviderControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `inherits` | `Partial<PostFastTikTokControls & PostFastInstagramControls & PostFastFacebookControls & PostFastYouTubeControls & PostFastXControls & PostFastLinkedInControls & PostFastPinterestControls & PostFastGoogleBusinessControls>` | Yes | Intersection member. |
| `inherits` | `Record<string, PostFastProviderControlValue>` | Yes | Intersection member. |

## PostFastProviderControlsByProvider

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `tiktok` | `PostFastTikTokControls` | Yes |  |
| `tiktok-creative` | `PostFastNoExtraPlatformControls` | Yes |  |
| `tiktok-seller` | `PostFastNoExtraPlatformControls` | Yes |  |
| `facebook` | `PostFastFacebookControls` | Yes |  |
| `instagram` | `PostFastInstagramControls` | Yes |  |
| `youtube` | `PostFastYouTubeControls` | Yes |  |
| `x` | `PostFastXControls` | Yes |  |
| `twitter` | `PostFastXControls` | Yes |  |
| `linkedin` | `PostFastLinkedInControls` | Yes |  |
| `threads` | `PostFastNoExtraPlatformControls` | Yes |  |
| `pinterest` | `PostFastPinterestControls` | Yes |  |
| `bluesky` | `PostFastNoExtraPlatformControls` | Yes |  |
| `telegram` | `PostFastNoExtraPlatformControls` | Yes |  |
| `google` | `PostFastGoogleBusinessControls` | Yes |  |
| `google-business-profile` | `PostFastGoogleBusinessControls` | Yes |  |

## PostFastProviderControlValue

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `string \| number \| boolean \| null \| string[]` | Yes | Union value. |

## PostFastTikTokControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `tiktokTitle` | `string` | Yes |  |
| `tiktokIsDraft` | `boolean` | Yes |  |
| `tiktokAllowComments` | `boolean` | Yes |  |
| `tiktokAllowDuet` | `boolean` | Yes |  |
| `tiktokAllowStitch` | `boolean` | Yes |  |
| `tiktokBrandOrganic` | `boolean` | Yes |  |
| `tiktokBrandContent` | `boolean` | Yes |  |
| `tiktokAutoAddMusic` | `boolean` | Yes |  |
| `tiktokIsAigc` | `boolean` | Yes |  |

## PostFastXControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `xRetweetUrl` | `string` | Yes |  |

## PostFastYouTubeControls

Source: `lib/postfast-provider-controls.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `youtubeTitle` | `string` | Yes |  |
| `youtubePrivacy` | `"PUBLIC" \| "UNLISTED" \| "PRIVATE"` | Yes |  |
| `youtubeIsShort` | `boolean` | Yes |  |
| `youtubeMadeForKids` | `boolean` | Yes |  |
| `youtubeTags` | `string[]` | Yes |  |

## AssetTab

Source: `lib/realfarm-asset-ui-config.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `(typeof assetTabs)[number]` | Yes | Derived from a runtime constant. |

## AutomationAspectRatio

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"fit" \| "9:16" \| "4:5" \| "3:4" \| "3:2" \| "1:1"` | Yes | Union value. |

## AutomationDay

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"Mon" \| "Tue" \| "Wed" \| "Thu" \| "Fri" \| "Sat" \| "Sun"` | Yes | Union value. |

## AutomationFormatSection

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `AutomationFormatSectionId` | Yes |  |
| `image_url` | `string` | Yes |  |
| `textItems` | `AutomationTextItem[]` | Yes |  |
| `aspect_ratio` | `AutomationAspectRatio` | Yes |  |
| `imageGrid` | `AutomationImageGrid` | Yes |  |
| `slideCount` | `number` | Yes |  |
| `noText` | `boolean` | Yes |  |
| `overlay` | `boolean` | Yes |  |
| `overlayOpacity` | `number` | Yes |  |
| `overlayImage` | `{ enabled: boolean; collectionId?: string; padding: number; }` | No |  |
| `ctaLocation` | `"last" \| "static"` | No |  |
| `ctaStaticPosition` | `string` | No |  |
| `imageMode` | `AutomationImageMode` | No |  |

## AutomationFormatSectionId

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"hook" \| "body" \| "cta"` | Yes | Union value. |

## AutomationFormattingItem

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `AutomationFormatSection \| AutomationToneSection` | Yes | Union value. |

## AutomationImageGrid

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"none" \| "2x2" \| "1x2" \| "1x3"` | Yes | Union value. |

## AutomationImageMode

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"collection" \| "single_image"` | Yes | Union value. |

## AutomationSchedule

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `timezone` | `string` | Yes |  |
| `posting_times` | `{ time: Time; days: AutomationDay[]; }[]` | Yes |  |

## AutomationSchema

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `created_at` | `Date` | Yes |  |
| `title` | `string` | Yes |  |
| `status` | `AutomationStatus` | Yes |  |
| `social_integrations` | `AutomationSocialIntegration[]` | Yes |  |
| `prompt_formatting` | `PromptFormatting` | Yes |  |
| `image_collection_ids` | `ImageCollectionConfig` | Yes |  |
| `formatting` | `AutomationFormattingItem[]` | Yes |  |
| `tiktok_post_settings` | `{ caption: PostTextSetting; description: PostTextSetting; visibility: TikTokVisibility; auto_music: boolean; auto_post: boolean; allow_comments: boolean; allow_duet: boolean; allow_stitch: boolean; disclose_video_content: boolean; disclose_brand_organic: boolean; disclose_branded_content: boolean; post_mode: TikTokPostMode; publish_type?: TikTokPublishType; slideshow_transition_style?: string; slideshow_slide_duration?: number; slideshow_sound_id?: string; slideshow_sound_name?: string; slideshow_sound_url?: string; }` | Yes |  |
| `social_post_settings` | `AutomationSocialPostSettings` | Yes |  |
| `social_publish_as` | `AutomationSocialPublishAs` | Yes |  |
| `schedule` | `AutomationSchedule` | Yes |  |

## AutomationSocialIntegration

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `PostFastSocialIntegration` | Yes | Alias. |

## AutomationSocialPostSettings

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `Partial<{ [Provider in AutomationSocialProvider]: Provider extends keyof PostFastProviderControlsByProvider ? PostFastProviderControlsByProvider[Provider] : PostFastProviderControls; }>` | Yes | Utility type alias. |

## AutomationSocialProvider

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `PostFastSocialProvider` | Yes | Alias. |

## AutomationSocialPublishAs

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `Partial<Record<AutomationSocialProvider, TikTokPublishType>>` | Yes | Utility type alias. |

## AutomationStatus

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"paused" \| "live"` | Yes | Union value. |

## AutomationTemplate

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `inherits` | `Pick<AutomationSchema, "prompt_formatting" \| "formatting" \| "tiktok_post_settings" \| "image_collection_ids">` | Yes | Intersection member. |
| `social_post_settings` | `AutomationSocialPostSettings` | No |  |
| `social_publish_as` | `AutomationSocialPublishAs` | No |  |

## AutomationTextAlign

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"left" \| "center" \| "right"` | Yes | Union value. |

## AutomationTextAnchor

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"padded" \| "flush"` | Yes | Union value. |

## AutomationTextItem

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `text` | `string` | Yes |  |
| `fontSize` | `string` | Yes |  |
| `textStyle` | `string` | Yes |  |
| `font` | `string` | Yes |  |
| `textPosition` | `AutomationTextPosition` | Yes |  |
| `textItemWidth` | `string` | Yes |  |
| `wordLengthMin` | `number` | Yes |  |
| `wordLengthMax` | `number` | Yes |  |
| `contentDirection` | `string` | Yes |  |
| `textMode` | `"prompt" \| "static"` | Yes |  |
| `staticText` | `string` | Yes |  |
| `textAlign` | `AutomationTextAlign` | Yes |  |
| `textAnchor` | `AutomationTextAnchor` | Yes |  |

## AutomationTextPosition

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"top" \| "center" \| "bottom"` | Yes | Union value. |

## AutomationToneSection

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `"_tone"` | Yes |  |
| `value` | `string` | Yes |  |
| `preset` | `string` | Yes |  |

## ImageCollectionConfig

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `first_slide` | `{ collection: string; mode: AutomationImageMode; single_image: string \| null; }` | Yes |  |
| `all_slides` | `string` | Yes |  |
| `aspect_ratio` | `AutomationAspectRatio` | No |  |
| `is_bg_overlay_on` | `boolean` | No |  |
| `cta_slide` | `{ check: boolean; cta_collection_check: boolean; cta_collection_id: string; image_id: string \| null; cta_location: "last_slide" \| string; }` | Yes |  |
| `keepOriginalAspectRatio` | `boolean` | No |  |
| `background_opacity` | `number` | No |  |
| `is_bg_overlay_on_hook_image` | `boolean` | No |  |
| `textOnFirstSlideOnly` | `boolean` | No |  |
| `noTextOnSlides` | `boolean` | No |  |
| `autoPullImagesNotCollections` | `boolean` | No |  |
| `autoImagesNoTextOnImages` | `boolean` | No |  |
| `disableAutoImageForFirstSlide` | `boolean` | No |  |
| `language` | `string` | No |  |

## PostTextSetting

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `mode` | `"prompt" \| "static"` | Yes |  |
| `static_text` | `string` | Yes |  |
| `prompt_text` | `string` | Yes |  |

## PromptFormatting

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `style` | `string` | Yes |  |
| `narrative` | `string` | Yes |  |
| `num_of_slides` | `number` | Yes |  |

## TikTokPostMode

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"MEDIA_UPLOAD" \| "DIRECT_POST"` | Yes | Union value. |

## TikTokPublishType

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"slideshow" \| "video"` | Yes | Union value. |

## TikTokVisibility

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"PUBLIC_TO_EVERYONE" \| "MUTUAL_FOLLOW_FRIENDS" \| "SELF_ONLY"` | Yes | Union value. |

## Time

Source: `lib/realfarm-automation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `string` | Yes | Alias. |

## CharacterAssetCategoryByTab

Source: `lib/realfarm-character-ui-config.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `Record<CharacterAssetTab, AssetCategory>` | Yes | Utility type alias. |

## CharacterAssetTab

Source: `lib/realfarm-character-ui-config.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"outfits" \| "accessories" \| "background" \| "products"` | Yes | Union value. |

## CharacterEditorTabConfig

Source: `lib/realfarm-character-ui-config.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `(typeof characterEditorTabsConfig)[number]` | Yes | Derived from a runtime constant. |

## CharacterAttributes

Source: `lib/realfarm-character-ui.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `Character` | Yes | Alias. |

## CharacterEditorTab

Source: `lib/realfarm-character-ui.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `(typeof characterEditorTabs)[number]` | Yes | Derived from a runtime constant. |

## CharacterImageGenerationRecord

Source: `lib/realfarm-character-ui.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `prompt` | `string` | Yes |  |
| `model` | `string` | Yes |  |
| `createdAt` | `string` | Yes |  |
| `attachments` | `CharacterPromptAttachment[]` | Yes |  |
| `aspectRatio` | `string` | Yes |  |
| `status` | `"processing" \| "ready" \| "failed"` | Yes |  |
| `imageUrl` | `string` | No |  |
| `error` | `string` | No |  |
| `progress` | `number` | No |  |
| `videoUrl` | `string` | No |  |
| `videoModel` | `string` | No |  |
| `videoStatus` | `"idle" \| "processing" \| "ready" \| "failed"` | No |  |
| `videoError` | `string` | No |  |
| `videoProgress` | `number` | No |  |
| `workflow` | `CharacterWorkflowKey` | No |  |
| `workflowLabel` | `string` | No |  |
| `workflowMetadata` | `CharacterWorkflowMetadata` | No |  |

## CharacterPromptAttachment

Source: `lib/realfarm-character-ui.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `label` | `string` | Yes |  |
| `url` | `string` | Yes |  |
| `kind` | `"character_headshot" \| "asset"` | Yes |  |

## CharacterWorkflowKey

Source: `lib/realfarm-character-ui.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"free_generate" \| "recreate_reference" \| "build_modules" \| "batch_photo_dump" \| "tiktok_slideshow" \| "product_ugc" \| "animate_image" \| "motion_control" \| "seedream_bedroom_selfie" \| "outfit_transfer" \| "pose_variation_cut_video"` | Yes | Union value. |

## CharacterWorkflowMetadata

Source: `lib/realfarm-character-ui.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `workflow` | `CharacterWorkflowKey` | Yes |  |
| `workflowLabel` | `string` | Yes |  |
| `recipe` | `Record<string, unknown>` | No |  |
| `note` | `string` | No |  |

## CharacterWorkflowOption

Source: `lib/realfarm-character-ui.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `key` | `CharacterWorkflowKey` | Yes |  |
| `label` | `string` | Yes |  |
| `description` | `string` | Yes |  |
| `placeholder` | `string` | Yes |  |

## ImportedCharacterPayload

Source: `lib/realfarm-character-ui.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `string` | No |  |
| `attributes` | `CharacterAttributes` | Yes |  |
| `previewUrl` | `string` | No |  |
| `sourceImageDataUrl` | `string` | No |  |

## CreatedImageCollection

Source: `lib/realfarm-collections.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `title` | `string` | Yes |  |
| `images` | `PinterestSearchResult[]` | Yes |  |
| `createdAt` | `string` | Yes |  |
| `source` | `"pinterest" \| "pexels" \| "upload" \| "virtual" \| "fallback" \| "pexels-fallback" \| "empty"` | Yes |  |
| `virtual` | `boolean` | No |  |
| `payload` | `PinterestCollectionCreatePayload` | No |  |

## PinterestCollectionCreatePayload

Source: `lib/realfarm-collections.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `image_urls` | `string[]` | Yes |  |
| `user_id` | `string` | Yes |  |
| `collection_name` | `string` | Yes |  |
| `auto_caption` | `boolean` | Yes |  |

## StoredImageCollection (lib/realfarm-collections.ts)

Source: `lib/realfarm-collections.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | `string` | Yes |  |
| `created_at` | `string` | Yes |  |
| `images` | `{ image_link: string; caption: string; }[]` | Yes |  |

## Automation (lib/realfarm-data.ts)

Source: `lib/realfarm-data.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `name` | `string` | Yes |  |
| `status` | `string` | Yes |  |
| `account` | `string` | Yes |  |
| `handle` | `string` | Yes |  |
| `times` | `string[]` | Yes |  |
| `timezone` | `string` | No |  |
| `favorite` | `boolean` | Yes |  |
| `theme` | `string` | Yes |  |
| `socialIntegrations` | `PostFastSocialIntegration[]` | Yes |  |
| `created_at` | `string` | No |  |

## ImageCollection

Source: `lib/realfarm-data.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `RealFarmData["imageCollections"][number]` | Yes | Alias. |

## LocalAsset

Source: `lib/realfarm-data.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `name` | `string` | Yes |  |
| `path` | `string` | Yes |  |
| `url` | `string` | Yes |  |
| `kind` | `LocalAssetKind` | Yes |  |
| `text` | `string` | No |  |

## Project

Source: `lib/realfarm-data.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `title` | `string` | Yes |  |
| `status` | `string` | Yes |  |
| `age` | `string` | Yes |  |
| `slides` | `string[]` | Yes |  |

## RealFarmData

Source: `lib/realfarm-data.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `inherits` | `RealFarmJson` | Yes | Intersection member. |
| `assets` | `{ music: LocalAsset[]; ugcAvatarVideos: LocalAsset[]; greenscreenMemes: LocalAsset[]; ctas: LocalAsset[]; }` | Yes |  |

## Video

Source: `lib/realfarm-data.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `RealFarmData["videos"][number]` | Yes | Alias. |

## CharacterImageActionModel

Source: `lib/realfarm-generation-model-registry.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `label` | `string` | Yes |  |
| `model` | `string` | Yes |  |

## CharacterImageGenerationModel

Source: `lib/realfarm-generation-model-registry.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `label` | `string` | Yes |  |
| `url` | `string` | Yes |  |

## CharacterImageToVideoModel

Source: `lib/realfarm-generation-model-registry.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `label` | `string` | Yes |  |
| `model` | `string` | Yes |  |
| `provider` | `"kie"` | Yes |  |

## OpenRouterModelUseCase

Source: `lib/realfarm-generation-model-registry.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"slideshowText" \| "automationHooks" \| "imageCaptioning" \| "characterAttributes" \| "swipeAnalysis" \| "swipeTranscription"` | Yes | Union value. |

## RendiStoredFile

Source: `lib/rendi-ffmpeg.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file_id` | `string` | Yes |  |
| `status` | `string \| null` | No |  |
| `storage_url` | `string \| null` | No |  |
| `duration` | `number \| null` | No |  |
| `error_status` | `string \| null` | No |  |
| `external_error_message` | `string \| null` | No |  |

## CreateResultInput

Source: `lib/results.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `rootDir` | `string` | No |  |
| `id` | `string` | No |  |
| `automationId` | `string` | Yes |  |
| `runId` | `string` | Yes |  |
| `workflowType` | `ResultWorkflowType` | Yes |  |
| `title` | `string` | Yes |  |
| `status` | `ResultStatus` | No |  |
| `artifacts` | `Partial<ResultArtifacts>` | No |  |
| `payload` | `ResultPayload` | No |  |
| `destinationAccountIds` | `string[]` | No |  |
| `createdAt` | `string` | No |  |
| `updatedAt` | `string` | No |  |

## ResultPayload

Source: `lib/results.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `ResultSlideshowPayload \| ResultVideoPayload` | Yes | Union value. |

## ResultStatus

Source: `lib/results.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"succeeded" \| "failed"` | Yes | Union value. |

## ResultWorkflowType

Source: `lib/results.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"slideshow" \| "video"` | Yes | Union value. |

## AutomationLanguage

Source: `lib/slideshow-publishing-config.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `(typeof automationLanguageOptions)[number]` | Yes | Derived from a runtime constant. |

## SlideshowTransitionValue

Source: `lib/slideshow-publishing-config.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `(typeof slideshowTransitionOptions)[number]["value"]` | Yes | Derived from a runtime constant. |

## SlideshowSocialProvider

Source: `lib/slideshow-social-platforms.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `(typeof slideshowSocialProviders)[number]` | Yes | Derived from a runtime constant. |

## SlideshowTextGenerationResult

Source: `lib/slideshow-text-generation.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | `string` | Yes |  |
| `selectedHook` | `string` | Yes |  |
| `result` | `TempSlideStructuredOutput` | Yes |  |
| `skippedOpenRouter` | `boolean` | Yes |  |
| `promptPayload` | `ReturnType<typeof slideshowTextGenerationPayload>` | No |  |

## SlideshowSettings

Source: `lib/slideshows.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `duration` | `number` | Yes |  |
| `background_color` | `string` | Yes |  |
| `is_bg_overlay_on` | `boolean` | Yes |  |
| `transition_style` | `string` | Yes |  |
| `background_opacity` | `number` | Yes |  |
| `is_bg_overlay_on_hook_image` | `boolean` | Yes |  |
| `export_as_video` | `boolean` | Yes |  |
| `sound_id` | `string` | Yes |  |
| `sound_name` | `string` | Yes |  |
| `sound_url` | `string` | Yes |  |

## SlideshowSlide

Source: `lib/slideshows.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `image_url` | `string` | Yes |  |
| `source_image_url` | `string` | No |  |
| `textItems` | `SlideshowTextItem[]` | Yes |  |
| `aspect_ratio` | `string` | Yes |  |
| `time_length_ms` | `number` | Yes |  |

## SlideshowStatus

Source: `lib/slideshows.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"exported" \| "failed"` | Yes | Union value. |

## SlideshowTextItem

Source: `lib/slideshows.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `text` | `string` | Yes |  |
| `font` | `string` | Yes |  |
| `fontSize` | `string` | Yes |  |
| `textSize` | `{ width: number; height: number; }` | Yes |  |
| `textStyle` | `string` | Yes |  |
| `textAlign` | `string` | No |  |
| `textAnchor` | `string` | No |  |
| `textPosition` | `{ x: number; y: number; }` | Yes |  |

## BudgetLevel

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"low" \| "medium" \| "high" \| "unknown"` | Yes | Union value. |

## ConfidenceLevel

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"low" \| "medium" \| "high"` | Yes | Union value. |

## CoreUgcAestheticAnalysis

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `implied_device_and_capture` | `{ inferred_device: string; confidence: ConfidenceLevel; justification: { aspect_ratio: string; lens_distortion: string; dynamic_range: string; visible_artifacts: string[]; }; }` | Yes |  |
| `social_context_and_scenario` | `{ scenario: string; real_world_activity: string; setting: string; filming_context: string; }` | Yes |  |
| `visual_authenticity_cues` | `{ framing_and_composition: string[]; camera_motion: string[]; lighting: string[]; editing: string[]; visual_noise: string[]; }` | Yes |  |
| `audio_authenticity_cues` | `{ background_sound: string[]; dialogue_quality: string[]; microphone_characteristics: string; }` | Yes |  |
| `subject_and_performance` | `{ appearance: { general_age_range: string; style: string; notable_features: string[]; }; delivery_and_kinesics: { speaking_style: string; tone: string; filler_words?: string[]; eye_contact: string; gestures: string[]; body_language: string; }; }` | Yes |  |

## EmotionalToneNote

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `time` | `number` | No |  |
| `note` | `string` | Yes |  |

## FullScriptTranscription

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `speakers` | `SpeakerTranscript[]` | Yes |  |
| `full_text` | `string` | Yes |  |
| `pause_notes` | `PauseNote[]` | Yes |  |
| `emotional_tone_notes` | `EmotionalToneNote[]` | Yes |  |

## IndustryBenchmark

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `metric` | `string` | Yes |  |
| `rank` | `string` | Yes |  |
| `comparison` | `string` | Yes |  |

## PauseNote

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `time` | `number` | No |  |
| `note` | `string` | Yes |  |

## SavedSwipeMedia

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `publicUrl` | `string` | Yes |  |
| `filePath` | `string` | Yes |  |
| `format` | `string` | Yes |  |

## SpeakerTranscript

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `speaker` | `string` | Yes |  |
| `start` | `number` | No |  |
| `end` | `number` | No |  |
| `text` | `string` | Yes |  |

## SwipeFormat

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"image" \| "video" \| "carousel" \| "unknown"` | Yes | Union value. |

## SwipePayload

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `inherits` | `Partial<Omit<SwipeRecord, "id" \| "swipedAt" \| "screenshotPath">>` | Yes | Intersection member. |
| `analyticsText` | `string` | No |  |
| `screenshotDataUrl` | `string` | No |  |
| `landingPageMobileScreenshotDataUrl` | `string` | No |  |
| `landingPageDesktopScreenshotDataUrl` | `string` | No |  |

## SwipePlatform

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"facebook" \| "tiktok" \| "tiktok-creative" \| "tiktok-seller" \| "google" \| "twitter" \| "unknown"` | Yes | Union value. |

## SwipeProcessingStatus

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"processing" \| "complete" \| "failed"` | Yes | Union value. |

## SwipeRecord

Source: `lib/swipes.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `advertiser` | `string` | Yes |  |
| `platform` | `SwipePlatform` | Yes |  |
| `source` | `string` | Yes |  |
| `sourceUrl` | `string` | Yes |  |
| `title` | `string` | Yes |  |
| `caption` | `string` | Yes |  |
| `format` | `SwipeFormat` | Yes |  |
| `cta` | `string` | No |  |
| `landingPageUrl` | `string` | No |  |
| `mediaUrl` | `string` | No |  |
| `mediaUrls` | `string[]` | No |  |
| `source_video_url` | `string` | No |  |
| `uploaded_at` | `string` | No |  |
| `time` | `number` | No |  |
| `likes` | `number` | No |  |
| `comments` | `number` | No |  |
| `shares` | `number` | No |  |
| `ctr_rank` | `string` | No |  |
| `cvr_rank` | `string` | No |  |
| `clicks_rank` | `string` | No |  |
| `conversion_rank` | `string` | No |  |
| `remain_rank` | `string` | No |  |
| `budget_level` | `BudgetLevel` | No |  |
| `industry_benchmark` | `IndustryBenchmark` | No |  |
| `full_script_transcription` | `FullScriptTranscription` | No |  |
| `core_ugc_aesthetic_analysis` | `CoreUgcAestheticAnalysis` | No |  |
| `screenshotPath` | `string` | No |  |
| `landingPageMobileScreenshotPath` | `string` | No |  |
| `landingPageDesktopScreenshotPath` | `string` | No |  |
| `landingPageCapturedAt` | `string` | No |  |
| `landingPageCaptureError` | `string` | No |  |
| `processingStatus` | `SwipeProcessingStatus` | No |  |
| `processingStartedAt` | `string` | No |  |
| `processingCompletedAt` | `string` | No |  |
| `processingError` | `string` | No |  |
| `swipedAt` | `string` | Yes |  |
| `metadata` | `Record<string, string>` | Yes |  |
| `stats` | `Record<string, string>` | Yes |  |
| `folder` | `string` | Yes |  |

## TempSlideImage

Source: `lib/temp-slide-testing.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `imageUrl` | `string` | Yes |  |
| `description` | `string` | Yes |  |

## TempSlideImageCollection

Source: `lib/temp-slide-testing.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `aliases` | `string[]` | Yes |  |
| `title` | `string` | Yes |  |
| `images` | `TempSlideImage[]` | Yes |  |

## TempSlidePromptInput

Source: `lib/temp-slide-testing.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `automationName` | `string` | Yes |  |
| `hook` | `string` | Yes |  |
| `tone` | `string` | Yes |  |
| `style` | `string` | Yes |  |
| `promptInstructions` | `string` | Yes |  |
| `placeholders` | `TempSlideTextPlaceholder[]` | Yes |  |

## TempSlideSectionId

Source: `lib/temp-slide-testing.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `"hook" \| "content" \| "cta"` | Yes | Union value. |

## TempSlideSpec

Source: `lib/temp-slide-testing.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `index` | `number` | Yes |  |
| `section` | `TempSlideSectionId` | Yes |  |
| `title` | `string` | Yes |  |
| `aspectRatio` | `string` | Yes |  |
| `imageGrid` | `string` | Yes |  |
| `overlay` | `boolean` | Yes |  |
| `displayText` | `boolean` | Yes |  |
| `collectionId` | `string` | Yes |  |
| `overlayImage` | `{ enabled: boolean; collectionId: string; height: number; }` | No |  |
| `textItems` | `TempSlideTextPlaceholder[]` | Yes |  |

## TempSlideStructuredOutput

Source: `lib/temp-slide-testing.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | Yes |  |
| `caption` | `string` | Yes |  |
| `hashtags` | `string` | Yes |  |
| `text` | `Record<string, string>` | Yes |  |

## TempSlideTestingAutomation

Source: `lib/temp-slide-testing.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `name` | `string` | Yes |  |
| `theme` | `string` | Yes |  |
| `hooks` | `string[]` | Yes |  |
| `tone` | `string` | Yes |  |
| `style` | `string` | Yes |  |
| `imageCollectionIds` | `{ hook: string; content: string; cta: string; }` | Yes |  |
| `slides` | `TempSlideSpec[]` | Yes |  |

## TempSlideTextPlaceholder

Source: `lib/temp-slide-testing.ts`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |
| `itemId` | `string` | Yes |  |
| `section` | `TempSlideSectionId` | Yes |  |
| `slideId` | `string` | Yes |  |
| `label` | `string` | Yes |  |
| `contentDirection` | `string` | Yes |  |
| `wordLengthMin` | `number` | Yes |  |
| `wordLengthMax` | `number` | Yes |  |
| `textMode` | `"prompt" \| "static"` | Yes |  |
| `staticText` | `string` | Yes |  |
| `font` | `string` | Yes |  |
| `fontSize` | `string` | Yes |  |
| `textStyle` | `string` | Yes |  |
| `textPosition` | `string` | Yes |  |
| `textItemWidth` | `string` | Yes |  |
| `textAlign` | `string` | Yes |  |
| `textAnchor` | `string` | Yes |  |
