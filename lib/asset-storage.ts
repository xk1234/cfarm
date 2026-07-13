// Central helper for persisting binary assets. Appwrite Storage is the only
// backend: assets are uploaded to the deterministic id the read route derives.
// Pipelines that need a real local file stage it back out via stageAssetToTmp.
import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import os from "node:os"
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

/** Read a data-tree asset's bytes from Appwrite Storage. Throws if unconfigured, outside data/, or missing. */
export async function readAssetBytes(absPath: string): Promise<Buffer> {
  const aw = getAppwrite()
  if (!aw) {
    throw new Error("Appwrite is not configured; cannot read asset bytes.")
  }
  const relPath = relForAppwrite(absPath)
  if (!relPath) {
    throw new Error(`Asset path is outside the data tree: ${absPath}`)
  }
  const view = await aw.storage.getFileView(
    bucketForPath(relPath),
    fileIdForPath(relPath)
  )
  return Buffer.from(view as ArrayBuffer)
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

/** Persist a binary asset to Appwrite Storage (no local write). */
export async function persistAsset(absPath: string, bytes: Bytes): Promise<void> {
  await mirrorAssetToAppwrite(absPath, bytes)
}

/** Recursively upload every file under a (data-relative) scratch dir to Storage. */
export async function mirrorDirToAppwrite(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) await mirrorDirToAppwrite(abs)
    else if (entry.isFile()) await mirrorAssetToAppwrite(abs)
  }
}

/** Download a data-tree asset from Storage into a fresh tmp file; returns its path. */
export async function stageAssetToTmp(absPath: string): Promise<string> {
  const bytes = await readAssetBytes(absPath)
  const tmpDir = path.join(os.tmpdir(), `cfarm-stage-${randomUUID()}`)
  await mkdir(tmpDir, { recursive: true })
  const tmpPath = path.join(tmpDir, path.basename(absPath))
  await writeFile(tmpPath, bytes)
  return tmpPath
}
