import path from "node:path"

/**
 * Resolve a `/api/local-assets/characters/...` URL to an absolute path inside
 * `rootDir`'s data tree, or null if the URL is not a local character asset.
 * Shared by the character image and video generation stores for media cleanup.
 */
export function localCharacterGenerationFilePath(
  rootDir: string,
  assetUrl: string
) {
  const prefix = "/api/local-assets/characters/"
  if (!assetUrl.startsWith(prefix)) {
    return null
  }

  const encodedRelativePath = assetUrl.slice(prefix.length).split(/[?#]/)[0]
  let relativePath = ""
  try {
    relativePath = encodedRelativePath
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join(path.sep)
  } catch {
    return null
  }
  if (!relativePath || path.isAbsolute(relativePath)) {
    return null
  }

  const dataRoot = path.resolve(rootDir)
  const filePath = path.resolve(dataRoot, relativePath)
  return filePath.startsWith(`${dataRoot}${path.sep}`) ? filePath : null
}
