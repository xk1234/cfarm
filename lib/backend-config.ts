import "server-only"

export type DataBackend = "appwrite" | "railway"
export type AssetBackend = "appwrite" | "railway"

function backendValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  variableName: string
): T {
  if (!value) return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new Error(
    `${variableName} must be one of ${allowed.join(", ")}; received ${value}.`
  )
}

/**
 * Railway is the default runtime. Appwrite can only be selected explicitly
 * during the rollback window or by one-time migration tooling.
 */
export function dataBackend(): DataBackend {
  return backendValue(
    process.env.LUMENCLIP_DATA_BACKEND,
    ["appwrite", "railway"] as const,
    "railway",
    "LUMENCLIP_DATA_BACKEND"
  )
}

export function assetBackend(): AssetBackend {
  return backendValue(
    process.env.LUMENCLIP_ASSET_BACKEND,
    ["appwrite", "railway"] as const,
    "railway",
    "LUMENCLIP_ASSET_BACKEND"
  )
}

export function railwayCutoverEnabled(): boolean {
  return dataBackend() === "railway" || assetBackend() === "railway"
}
