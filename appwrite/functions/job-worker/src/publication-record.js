// Generated from lib/publication-record.ts. Do not edit by hand.
const contractFixture = {
  "version": 1,
  "requiredKeys": [
    "id",
    "sourceType",
    "sourceId",
    "integrationId",
    "provider",
    "status",
    "linkState",
    "statsSources",
    "content",
    "media",
    "createdAt",
    "updatedAt"
  ],
  "cases": [
    {
      "name": "slideshow scheduled publication",
      "input": {
        "id": "pf-slideshow-1",
        "sourceType": "automation",
        "sourceId": "run-1",
        "postfastPostId": "postfast-slideshow-1",
        "integrationId": "integration-tiktok",
        "provider": "tiktok",
        "status": "scheduled",
        "scheduledAt": "2026-07-30T09:00:00.000Z",
        "content": "Slideshow caption\n\n#slideshow",
        "media": [
          {
            "key": "slides/one.png",
            "type": "IMAGE",
            "sortOrder": 0
          }
        ],
        "createdAt": "2026-07-30T08:00:00.000Z",
        "updatedAt": "2026-07-30T08:00:00.000Z",
        "lastSyncedAt": "2026-07-30T08:00:00.000Z",
        "ownerId": "owner-1"
      },
      "expected": {
        "id": "pf-slideshow-1",
        "sourceType": "automation",
        "sourceId": "run-1",
        "postfastPostId": "postfast-slideshow-1",
        "integrationId": "integration-tiktok",
        "provider": "tiktok",
        "status": "scheduled",
        "scheduledAt": "2026-07-30T09:00:00.000Z",
        "linkState": "unlinked",
        "statsSources": [],
        "content": "Slideshow caption\n\n#slideshow",
        "media": [
          {
            "key": "slides/one.png",
            "type": "IMAGE",
            "sortOrder": 0
          }
        ],
        "createdAt": "2026-07-30T08:00:00.000Z",
        "updatedAt": "2026-07-30T08:00:00.000Z",
        "lastSyncedAt": "2026-07-30T08:00:00.000Z",
        "ownerId": "owner-1"
      }
    },
    {
      "name": "UGC scheduled publication",
      "input": {
        "id": "pf-ugc-1",
        "sourceType": "ugc_ad",
        "sourceId": "ugc-export-1",
        "postfastPostId": "postfast-ugc-1",
        "integrationId": "integration-instagram",
        "provider": "instagram",
        "status": "scheduled",
        "scheduledAt": "2026-07-30T10:00:00.000Z",
        "content": "UGC caption\n\n#useful",
        "media": [
          {
            "key": "ugc/final.mp4",
            "type": "VIDEO",
            "sortOrder": 0
          }
        ],
        "createdAt": "2026-07-30T08:01:00.000Z",
        "updatedAt": "2026-07-30T08:01:00.000Z",
        "lastSyncedAt": "2026-07-30T08:01:00.000Z"
      },
      "expected": {
        "id": "pf-ugc-1",
        "sourceType": "ugc_ad",
        "sourceId": "ugc-export-1",
        "postfastPostId": "postfast-ugc-1",
        "integrationId": "integration-instagram",
        "provider": "instagram",
        "status": "scheduled",
        "scheduledAt": "2026-07-30T10:00:00.000Z",
        "linkState": "unlinked",
        "statsSources": [],
        "content": "UGC caption\n\n#useful",
        "media": [
          {
            "key": "ugc/final.mp4",
            "type": "VIDEO",
            "sortOrder": 0
          }
        ],
        "createdAt": "2026-07-30T08:01:00.000Z",
        "updatedAt": "2026-07-30T08:01:00.000Z",
        "lastSyncedAt": "2026-07-30T08:01:00.000Z"
      }
    },
    {
      "name": "X failed publication",
      "input": {
        "id": "pf-x-1",
        "sourceType": "x_automation",
        "sourceId": "x-run-1",
        "integrationId": "integration-x",
        "provider": "x",
        "status": "failed",
        "scheduledAt": "2026-07-30T08:03:00.000Z",
        "content": "A concise X post",
        "media": [],
        "statsSources": [
          "tiktok_studio",
          "postfast",
          "postfast"
        ],
        "error": "PostFast failed (503)",
        "createdAt": "2026-07-30T08:02:00.000Z",
        "updatedAt": "2026-07-30T08:02:00.000Z",
        "lastSyncedAt": "2026-07-30T08:02:00.000Z"
      },
      "expected": {
        "id": "pf-x-1",
        "sourceType": "x_automation",
        "sourceId": "x-run-1",
        "integrationId": "integration-x",
        "provider": "x",
        "status": "failed",
        "scheduledAt": "2026-07-30T08:03:00.000Z",
        "linkState": "unlinked",
        "statsSources": [
          "postfast",
          "tiktok_studio"
        ],
        "content": "A concise X post",
        "media": [],
        "createdAt": "2026-07-30T08:02:00.000Z",
        "updatedAt": "2026-07-30T08:02:00.000Z",
        "lastSyncedAt": "2026-07-30T08:02:00.000Z",
        "error": "PostFast failed (503)"
      }
    }
  ]
};
const STATUSES = [
    "awaiting_manual_post",
    "ready_for_review",
    "draft",
    "scheduled",
    "published",
    "failed",
];
const SOURCE_TYPES = [
    "automation",
    "x_automation",
    "generated_video",
    "asset",
    "greenscreen",
    "ugc_ad",
    "image",
    "slideshow",
    "manual",
    "external",
];
const LINK_STATES = [
    "postfast_published",
    "manually_linked",
    "unlinked",
];
const STATS_SOURCES = [
    "postfast",
    "tiktok_studio",
];
const ALLOWED_KEYS = new Set([
    "id",
    "sourceType",
    "sourceId",
    "postfastPostId",
    "integrationId",
    "provider",
    "status",
    "scheduledAt",
    "publishedAt",
    "releaseUrl",
    "linkState",
    "statsSources",
    "externalPostId",
    "content",
    "media",
    "createdAt",
    "updatedAt",
    "lastSyncedAt",
    "lastAnalyticsSyncedAt",
    "analytics",
    "error",
    // Slideshow legacy rows already contain this redundant ownership field.
    // Keep accepting it until the legacy publications column is retired.
    "ownerId",
]);
export const publicationRecordContractFixture = contractFixture;
/** Pure constructor for the legacy publication record stored on outputs. */
export function buildPublicationRecord(input) {
    const record = normalizePublicationRecord(input);
    if (!record) {
        throw new Error("A valid publication record is required.");
    }
    return record;
}
/**
 * Normalizes records from old embedded-output writers without using an
 * Appwrite client, repository, clock, or runtime-specific APIs.
 */
export function normalizePublicationRecord(value) {
    if (!isObject(value))
        return null;
    const id = clean(value.id);
    const sourceType = clean(value.sourceType);
    const sourceId = clean(value.sourceId);
    const integrationId = clean(value.integrationId);
    const provider = clean(value.provider);
    const createdAt = clean(value.createdAt);
    const updatedAt = clean(value.updatedAt) || createdAt;
    if (!id ||
        !isSourceType(sourceType) ||
        !sourceId ||
        !integrationId ||
        !provider ||
        !createdAt ||
        !updatedAt) {
        return null;
    }
    return {
        id,
        sourceType,
        sourceId,
        postfastPostId: optionalString(value.postfastPostId),
        integrationId,
        provider,
        status: isStatus(value.status) ? value.status : "draft",
        scheduledAt: optionalString(value.scheduledAt),
        publishedAt: optionalString(value.publishedAt),
        releaseUrl: optionalString(value.releaseUrl),
        linkState: isLinkState(value.linkState) ? value.linkState : "unlinked",
        statsSources: normalizeStatsSources(value.statsSources),
        externalPostId: optionalString(value.externalPostId),
        content: typeof value.content === "string" ? value.content : "",
        media: Array.isArray(value.media) ? value.media : [],
        createdAt,
        updatedAt,
        lastSyncedAt: optionalString(value.lastSyncedAt),
        lastAnalyticsSyncedAt: optionalString(value.lastAnalyticsSyncedAt),
        analytics: Array.isArray(value.analytics)
            ? value.analytics
            : undefined,
        error: optionalString(value.error),
        ownerId: optionalString(value.ownerId),
    };
}
export function validatePublicationRecord(value) {
    if (!isObject(value))
        return ["record must be an object"];
    const errors = [];
    for (const key of contractFixture.requiredKeys) {
        if (!(key in value))
            errors.push(`missing required field: ${key}`);
    }
    for (const key of Object.keys(value)) {
        if (!ALLOWED_KEYS.has(key))
            errors.push(`unknown field: ${key}`);
    }
    if (!clean(value.id))
        errors.push("id must be a non-empty string");
    if (!isSourceType(value.sourceType))
        errors.push("sourceType is invalid");
    if (!clean(value.sourceId)) {
        errors.push("sourceId must be a non-empty string");
    }
    if (!clean(value.integrationId)) {
        errors.push("integrationId must be a non-empty string");
    }
    if (!clean(value.provider)) {
        errors.push("provider must be a non-empty string");
    }
    if (!isStatus(value.status))
        errors.push("status is invalid");
    if (!isLinkState(value.linkState))
        errors.push("linkState is invalid");
    if (!Array.isArray(value.statsSources)) {
        errors.push("statsSources must be an array");
    }
    else if (value.statsSources.some((source) => !isStatsSource(source))) {
        errors.push("statsSources contains an invalid value");
    }
    if (typeof value.content !== "string")
        errors.push("content must be a string");
    if (!Array.isArray(value.media))
        errors.push("media must be an array");
    if (!clean(value.createdAt))
        errors.push("createdAt must be a string");
    if (!clean(value.updatedAt))
        errors.push("updatedAt must be a string");
    return errors;
}
export function publicationRecordSummary(records) {
    const rank = [
        "published",
        "scheduled",
        "ready_for_review",
        "awaiting_manual_post",
        "failed",
        "draft",
    ];
    const primary = rank
        .flatMap((status) => records.filter((record) => record.status === status))
        .at(0);
    return {
        status: primary?.status ?? null,
        scheduledAt: records.find((record) => record.scheduledAt)?.scheduledAt ?? null,
        publishedAt: records.find((record) => record.publishedAt)?.publishedAt ?? null,
        postId: records.find((record) => record.postfastPostId)?.postfastPostId ?? null,
        releaseUrl: records.find((record) => record.releaseUrl)?.releaseUrl ?? null,
    };
}
function normalizeStatsSources(value) {
    const sources = new Set(Array.isArray(value) ? value : []);
    return STATS_SOURCES.filter((source) => sources.has(source));
}
function clean(value) {
    return typeof value === "string" ? value.trim() : "";
}
function optionalString(value) {
    return clean(value) || undefined;
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStatus(value) {
    return STATUSES.includes(value);
}
function isSourceType(value) {
    return SOURCE_TYPES.includes(value);
}
function isLinkState(value) {
    return LINK_STATES.includes(value);
}
function isStatsSource(value) {
    return STATS_SOURCES.includes(value);
}
