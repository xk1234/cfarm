import "server-only"

import { ID } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

import { RecordQuery as Query } from "@/lib/record-query"
import { getRuntimeStore, RUNTIME_DATABASE_ID } from "@/lib/runtime-store"

const TABLE = "demos"
const BUCKET = "demos"

export type DemoVideo = {
  id: string
  title: string
  createdAt: string
  url: string
}

export async function listDemoVideos(ownerId: string): Promise<DemoVideo[]> {
  const aw = getRuntimeStore()
  const response = await aw.records.listRows(RUNTIME_DATABASE_ID, TABLE, [
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
  const aw = getRuntimeStore()
  const id = ID.unique()
  const bytes = Buffer.from(await input.file.arrayBuffer())
  const stored = await aw.objects.createFile(
    BUCKET,
    id,
    InputFile.fromBuffer(bytes, input.file.name)
  )
  const now = new Date().toISOString()
  await aw.records.createRow(RUNTIME_DATABASE_ID, TABLE, id, {
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
  const aw = getRuntimeStore()
  const row = await aw.records.getRow(RUNTIME_DATABASE_ID, TABLE, id)
  if (row.owner_id !== ownerId) return null
  return {
    bytes: await aw.objects.getFileView(BUCKET, String(row.file_id)),
    contentType: String(row.content_type || "video/mp4"),
  }
}
