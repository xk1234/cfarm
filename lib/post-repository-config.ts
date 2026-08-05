export const POST_REPOSITORY_READ_MODE_ENV = "POST_REPOSITORY_READ_MODE"
export const POST_REPOSITORY_WRITE_MODE_ENV = "POST_REPOSITORY_WRITE_MODE"

export type PostRepositoryReadMode =
  | "legacy"
  | "union-shadow"
  | "canonical"

export type PostRepositoryWriteMode = "legacy" | "dual" | "canonical"

export function postRepositoryReadMode(): PostRepositoryReadMode {
  const value = process.env[POST_REPOSITORY_READ_MODE_ENV]?.trim().toLowerCase()
  return value === "union-shadow" || value === "canonical" ? value : "legacy"
}

export function postRepositoryWriteMode(): PostRepositoryWriteMode {
  const value = process.env[POST_REPOSITORY_WRITE_MODE_ENV]
    ?.trim()
    .toLowerCase()
  return value === "dual" || value === "canonical" ? value : "legacy"
}
