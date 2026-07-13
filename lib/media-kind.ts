/**
 * The canonical set of media kinds used across the app. Domain-specific asset
 * types derive their `kind` field from this single source instead of each
 * redeclaring the same string union.
 */
export type MediaKind = "image" | "video" | "audio" | "text"
