// Central helper for persisting binary assets. Both backends use the same
// deterministic bucket/file identity so cutover does not change public paths.
// Pipelines that need a real local file stage it back out via stageAssetToTmp.
import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { bucketForPath, dataRoot, fileIdForPath } from "@/lib/store-identity"
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

function relativeDataPath(absPath: string): string | null {
  const rel = path.relative(dataRoot(), path.resolve(absPath))
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join("/")
}

/** Upload (or replace) a data-tree file in Railway Storage. */
export async function persistStoredAsset(
  absPath: string,
  bytes?: Bytes
): Promise<void> {
  const relPath = relativeDataPath(absPath)
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

/** Read a private object by its stable data-tree path. */
export async function readAssetBytes(absPath: string): Promise<Buffer> {
  const relPath = relativeDataPath(absPath)
  if (!relPath) {
    throw new Error(`Asset path is outside the data tree: ${absPath}`)
  }
  const bucket = bucketForPath(relPath)
  const fileId = fileIdForPath(relPath)
  return readRailwayObject(railwayObjectKey(bucket, fileId))
}

/** Delete a private object; missing objects are already deleted. */
export async function deleteStoredAsset(absPath: string): Promise<void> {
  const relPath = relativeDataPath(absPath)
  if (!relPath) {
    throw new Error(`Asset path is outside the data tree: ${absPath}`)
  }
  const bucket = bucketForPath(relPath)
  const fileId = fileIdForPath(relPath)
  await deleteRailwayObject(railwayObjectKey(bucket, fileId))
}

/** Persist a binary asset without creating a local copy. */
export async function persistAsset(
  absPath: string,
  bytes: Bytes
): Promise<void> {
  await persistStoredAsset(absPath, bytes)
}

/** Create one deterministic storage object with exactly one Railway request. */
export async function createAssetOnce(
  absPath: string,
  bytes: Bytes
): Promise<void> {
  const relPath = relativeDataPath(absPath)
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

export async function persistStoredAssetsInDir(
  dir: string,
  targetDir = dir
): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    const target = path.join(targetDir, entry.name)
    if (entry.isDirectory()) await persistStoredAssetsInDir(abs, target)
    else if (entry.isFile())
      await persistStoredAsset(target, await readFile(abs))
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
