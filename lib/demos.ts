import "server-only"

import { ID, Query } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"

const TABLE = "demos"
const BUCKET = "demos"

export type DemoVideo = {
  id: string
  title: string
  createdAt: string
  url: string
}

export async function listDemoVideos(ownerId: string): Promise<DemoVideo[]> {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured")
  const response = await aw.tables.listRows(APPWRITE_DATABASE_ID, TABLE, [
    Query.equal("owner_id", [ownerId]),
    Query.limit(100),
  ])
  return response.rows
    .map((row) => ({
      id: String(row.$id),
      title: String(row.title),
      createdAt: String(row.created_at),
      url: `/api/settings/demos/${row.$id}`,
    }))
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export async function createDemoVideo(input: {
  ownerId: string
  title: string
  file: File
}) {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured")
  const id = ID.unique()
  const bytes = Buffer.from(await input.file.arrayBuffer())
  const stored = await aw.storage.createFile(
    BUCKET,
    id,
    InputFile.fromBuffer(bytes, input.file.name)
  )
  const now = new Date().toISOString()
  await aw.tables.createRow(APPWRITE_DATABASE_ID, TABLE, id, {
    owner_id: input.ownerId,
    title: input.title,
    file_id: stored.$id,
    content_type: input.file.type || "video/mp4",
    created_at: now,
  })
  return {
    id,
    title: input.title,
    createdAt: now,
    url: `/api/settings/demos/${id}`,
  }
}

export async function readDemoVideo(ownerId: string, id: string) {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured")
  const row = await aw.tables.getRow(APPWRITE_DATABASE_ID, TABLE, id)
  if (row.owner_id !== ownerId) return null
  return {
    bytes: await aw.storage.getFileView(BUCKET, String(row.file_id)),
    contentType: String(row.content_type || "video/mp4"),
  }
}
