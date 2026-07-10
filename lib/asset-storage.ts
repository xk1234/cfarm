// Central helper for persisting binary assets: writes to the local `data/` tree
// (many pipelines read these back as working files) AND mirrors to Appwrite
// Storage at the deterministic id the read route derives, so newly generated
// assets are served from Appwrite instead of the filesystem fallback.
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { InputFile } from "node-appwrite/file"

import { getAppwrite } from "@/lib/appwrite"
import { bucketForPath, dataRoot, fileIdForPath } from "@/lib/appwrite-stores"

type Bytes = Buffer | Uint8Array | ArrayBuffer | string

function toBuffer(bytes: Bytes): Buffer {
  if (typeof bytes === "string") return Buffer.from(bytes)
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes)
  return Buffer.from(bytes)
}

/** Data-relative POSIX path (e.g. "assets/files/x.png") for an absolute path, or null if outside data/. */
function relForAppwrite(absPath: string): string | null {
  const rel = path.relative(dataRoot(), path.resolve(absPath))
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join("/")
}

/** Upload (or replace) a data-tree file in Appwrite Storage. No-op if Appwrite is unconfigured. */
export async function mirrorAssetToAppwrite(absPath: string, bytes?: Bytes): Promise<void> {
  const aw = getAppwrite()
  if (!aw) return
  const relPath = relForAppwrite(absPath)
  if (!relPath) return
  const bucket = bucketForPath(relPath)
  const fileId = fileIdForPath(relPath)
  const buf = bytes != null ? toBuffer(bytes) : await readFile(absPath)
  const input = InputFile.fromBuffer(buf, path.basename(relPath))
  try {
    await aw.storage.createFile(bucket, fileId, input, [])
  } catch (error) {
    const code = (error as { code?: number }).code
    if (code === 409) {
      // Same path re-generated with new content: replace it.
      await aw.storage.deleteFile(bucket, fileId).catch(() => undefined)
      await aw.storage.createFile(bucket, fileId, input, [])
      return
    }
    throw error
  }
}

/** Delete a data-tree file from Appwrite Storage (best-effort). No-op if unconfigured/outside data/. */
export async function deleteAssetFromAppwrite(absPath: string): Promise<void> {
  const aw = getAppwrite()
  if (!aw) return
  const relPath = relForAppwrite(absPath)
  if (!relPath) return
  await aw.storage
    .deleteFile(bucketForPath(relPath), fileIdForPath(relPath))
    .catch(() => undefined)
}

/** Write a binary asset to the local data tree and mirror it to Appwrite Storage. */
export async function persistAsset(absPath: string, bytes: Bytes): Promise<void> {
  await mkdir(path.dirname(absPath), { recursive: true })
  await writeFile(absPath, typeof bytes === "string" ? bytes : toBuffer(bytes))
  await mirrorAssetToAppwrite(absPath, bytes)
}
