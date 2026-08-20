// Central helper for persisting binary assets in Railway object storage.
// Pipelines that need a real local file stage it back out via stageAssetToTmp.
import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { bucketForPath, dataRoot, fileIdForPath } from "@/lib/appwrite-stores"
import {
  deleteRailwayObject,
  putRailwayObject,
  railwayObjectExists,
  railwayObjectKey,
  readRailwayObject,
} from "@/lib/railway/object-storage"

type Bytes = Buffer | Uint8Array | ArrayBuffer | string

function toBuffer(bytes: Bytes): Buffer {
  if (typeof bytes === "string") return Buffer.from(bytes)
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes)
  return Buffer.from(bytes)
}

/** Data-relative POSIX path (e.g. "assets/files/x.png") for an absolute path, or null if outside data/. */
function relativeAssetPath(absPath: string): string | null {
  const rel = path.relative(dataRoot(), path.resolve(absPath))
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join("/")
}

/** Upload or replace a data-tree file in Railway object storage. */
export async function writeAsset(
  absPath: string,
  bytes?: Bytes
): Promise<void> {
  const relPath = relativeAssetPath(absPath)
  if (!relPath) {
    throw new Error(`Asset path is outside the data tree: ${absPath}`)
  }
  const bucket = bucketForPath(relPath)
  const fileId = fileIdForPath(relPath)
  const buf = bytes != null ? toBuffer(bytes) : await readFile(absPath)
  await putRailwayObject({
    key: railwayObjectKey(bucket, fileId),
    body: buf,
  })
}

/** Read a data-tree asset's bytes from Railway object storage. */
export async function readAssetBytes(absPath: string): Promise<Buffer> {
  const relPath = relativeAssetPath(absPath)
  if (!relPath) {
    throw new Error(`Asset path is outside the data tree: ${absPath}`)
  }
  const bucket = bucketForPath(relPath)
  const fileId = fileIdForPath(relPath)
  return readRailwayObject(railwayObjectKey(bucket, fileId))
}

/** Delete a data-tree file. Missing objects are already deleted. */
export async function deleteAsset(absPath: string): Promise<void> {
  const relPath = relativeAssetPath(absPath)
  if (!relPath) {
    throw new Error(`Asset path is outside the data tree: ${absPath}`)
  }
  const bucket = bucketForPath(relPath)
  const fileId = fileIdForPath(relPath)
  await deleteRailwayObject(railwayObjectKey(bucket, fileId))
}

/** Persist a binary asset without a local write. */
export async function persistAsset(
  absPath: string,
  bytes: Bytes
): Promise<void> {
  await writeAsset(absPath, bytes)
}

/** Create one deterministic storage object with exactly one Appwrite request. */
export async function createAssetOnce(
  absPath: string,
  bytes: Bytes
): Promise<void> {
  const relPath = relativeAssetPath(absPath)
  if (!relPath) {
    throw new Error(`Asset path is outside the data tree: ${absPath}`)
  }
  const buffer = toBuffer(bytes)
  const bucket = bucketForPath(relPath)
  const fileId = fileIdForPath(relPath)
  const key = railwayObjectKey(bucket, fileId)
  if (await railwayObjectExists(key)) {
    throw Object.assign(new Error(`Asset already exists: ${relPath}`), {
      code: 409,
    })
  }
  await putRailwayObject({ key, body: buffer })
}

/** Upload a scratch tree to a logical data-tree destination. */
export async function persistAssetDirectory(
  dir: string,
  targetDir = dir
): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    const target = path.join(targetDir, entry.name)
    if (entry.isDirectory()) await persistAssetDirectory(abs, target)
    else if (entry.isFile()) await writeAsset(target, await readFile(abs))
  }
}

// Temporary compatibility aliases for call sites and rollback-oriented tests.
// New runtime code should use the backend-neutral names above.
export const mirrorAssetToAppwrite = writeAsset
export const deleteAssetFromAppwrite = deleteAsset
export const mirrorDirToAppwrite = persistAssetDirectory

/** Download a data-tree asset from Storage into a fresh tmp file; returns its path. */
export async function stageAssetToTmp(absPath: string): Promise<string> {
  const bytes = await readAssetBytes(absPath)
  const tmpDir = path.join(os.tmpdir(), `cfarm-stage-${randomUUID()}`)
  await mkdir(tmpDir, { recursive: true })
  const tmpPath = path.join(tmpDir, path.basename(absPath))
  await writeFile(tmpPath, bytes)
  return tmpPath
}
