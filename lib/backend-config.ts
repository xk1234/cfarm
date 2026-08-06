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
 * Runtime cutover switches. Appwrite remains the default until the Railway
 * migration audit reports row and object parity.
 */
export function dataBackend(): DataBackend {
  return backendValue(
    process.env.LUMENCLIP_DATA_BACKEND,
    ["appwrite", "railway"] as const,
    "appwrite",
    "LUMENCLIP_DATA_BACKEND"
  )
}

export function assetBackend(): AssetBackend {
  return backendValue(
    process.env.LUMENCLIP_ASSET_BACKEND,
    ["appwrite", "railway"] as const,
    "appwrite",
    "LUMENCLIP_ASSET_BACKEND"
  )
}

export function railwayCutoverEnabled(): boolean {
  return dataBackend() === "railway" || assetBackend() === "railway"
}
