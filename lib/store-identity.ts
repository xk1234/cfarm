import crypto from "node:crypto"

export type StoreRoute = {
  table: string
  sourceKey: string
  public: boolean
  shareable?: boolean
}

const RAW_STORE_ROUTES: Record<string, StoreRoute | string> = {
  "image-collections.json": {
    table: "permanent_assets",
    sourceKey: "image_collection",
    public: false,
  },
  "assets/assets.json": {
    table: "permanent_assets",
    sourceKey: "uploaded_asset",
    public: false,
  },
  "automations/automations.json": "automations",
  "automations/runs.json": "automation_runs",
  "x-automations/automations.json": "x_automations",
  "x-automations/runs.json": {
    table: "outputs",
    sourceKey: "x_automation_run",
    public: false,
    shareable: true,
  },
  "automation-templates/templates.json": {
    table: "permanent_assets",
    sourceKey: "automation_template",
    public: true,
  },
  "automation-templates/example-runs.json": {
    table: "permanent_assets",
    sourceKey: "automation_template_example",
    public: true,
  },
  "results/results.json": {
    table: "outputs",
    sourceKey: "result",
    public: false,
    shareable: true,
  },
  "usage-ledger.json": "usage_ledger",
  "word-collections/word-collections.json": {
    table: "permanent_assets",
    sourceKey: "word_collection",
    public: false,
  },
  "postfast-metric-snapshots.json": "postfast_metric_snapshots",
  "tiktok-studio-analytics/imports.json": {
    table: "permanent_assets",
    sourceKey: "tiktok_studio_analytics_import",
    public: false,
  },
  "tiktok-studio-analytics/batches.json": {
    table: "permanent_assets",
    sourceKey: "tiktok_studio_analytics_batch",
    public: false,
  },
  "tiktok-comments/collections.json": {
    table: "permanent_assets",
    sourceKey: "tiktok_comment_collection",
    public: false,
  },
  "tiktok-comments/comments.json": {
    table: "permanent_assets",
    sourceKey: "tiktok_captured_comment",
    public: false,
  },
  "tiktok-comments/drafts.json": {
    table: "permanent_assets",
    sourceKey: "tiktok_comment_reply_draft",
    public: false,
  },
  "tiktok-comments/approvals.json": {
    table: "permanent_assets",
    sourceKey: "tiktok_comment_reply_approval",
    public: false,
  },
  "tiktok-comments/send-results.json": {
    table: "permanent_assets",
    sourceKey: "tiktok_comment_reply_send_result",
    public: false,
  },
  "account-follower-snapshots.json": "account_follower_snapshots",
  "generated-videos/exports.json": {
    table: "outputs",
    sourceKey: "generated_video",
    public: false,
    shareable: true,
  },
  "product-collections/product-collections.json": {
    table: "permanent_assets",
    sourceKey: "product_collection",
    public: false,
  },
  "media-library/assets.json": {
    table: "permanent_assets",
    sourceKey: "media_library_asset",
    public: true,
  },
  "settings/reminders.json": {
    table: "permanent_assets",
    sourceKey: "reminder_settings",
    public: false,
  },
  "settings/generation-models.json": {
    table: "permanent_assets",
    sourceKey: "generation_model_settings",
    public: false,
  },
  "brand-profile/brand-profile.json": {
    table: "permanent_assets",
    sourceKey: "brand_profile",
    public: false,
  },
}

export const STORE_ROUTES: Record<string, StoreRoute> = Object.fromEntries(
  Object.entries(RAW_STORE_ROUTES).map(([pathKey, value]) => [
    pathKey,
    typeof value === "string"
      ? {
          table: value,
          sourceKey: pathKey.replace(/\.json$/, "").replaceAll("/", "_"),
          public: false,
        }
      : value,
  ])
)

export const STORE_TABLES: Record<string, string> = Object.fromEntries(
  Object.entries(STORE_ROUTES).map(([key, route]) => [key, route.table])
)

export const PUBLIC_STORE_TABLES = new Set<string>()

import path from "node:path"

export function dataRoot(): string {
  return path.join(process.cwd(), "data")
}

export function routeForStore(rootDir: string, fileName: string) {
  const relative = relativeStorePath(rootDir, fileName)
  return STORE_ROUTES[relative] ?? null
}

export function tableForStore(rootDir: string, fileName: string) {
  const relative = relativeStorePath(rootDir, fileName)
  return STORE_TABLES[relative] ?? null
}

function relativeStorePath(rootDir: string, fileName: string) {
  const absolute = path.resolve(rootDir, fileName)
  return path.relative(dataRoot(), absolute).split(path.sep).join("/")
}

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/

export function rowIdFor(table: string, rid: string | null, index: number) {
  if (rid && ID_PATTERN.test(rid)) return rid
  const basis = `${table}:${rid ?? `idx-${index}`}`
  return `r${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)}`
}

export function ownedRowIdFor(
  table: string,
  ownerId: string,
  rid: string | null,
  index: number
) {
  const basis = `${table}:${ownerId}:${rid ?? `idx-${index}`}`
  return `u${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)}`
}

export function pickField(record: unknown, keys: string[]): string | null {
  if (!record || typeof record !== "object") return null
  for (const key of keys) {
    const value = (record as Record<string, unknown>)[key]
    if (value != null && value !== "") return String(value)
  }
  return null
}

export const ID_KEYS = ["id", "$id", "uuid", "slug", "key"]
export const NAME_KEYS = ["name", "title", "label", "prompt", "slug"]
export const STATUS_KEYS = ["status", "state"]
export const CREATED_KEYS = [
  "createdAt",
  "created_at",
  "capturedAt",
  "$createdAt",
  "created",
  "timestamp",
]

export function bucketForPath(relativePath: string): string {
  switch (relativePath.split("/")[0]) {
    case "music":
      return "music"
    case "image-collections":
      return "image_collections"
    case "greenscreen_memes":
      return "greenscreen"
    case "slideshows":
      return "slideshows"
    case "ugc_avatar_videos":
      return "ugc_videos"
    case "backgrounds":
      return "backgrounds"
    case "assets":
      return "assets"
    case "product-collections":
      return "product_images"
    default:
      return "misc"
  }
}

export function fileIdForPath(relativePath: string): string {
  return crypto.createHash("sha256").update(relativePath).digest("hex").slice(0, 36)
}
