import "server-only"

import { randomUUID } from "node:crypto"
import path from "node:path"

import {
  deleteDomainRecord,
  getDomainRecord,
  putDomainRecords,
} from "@/lib/railway/domain-record-store"
import {
  readRailwayObject,
  railwayObjectKey,
  deleteRailwayObject,
  putRailwayObject,
} from "@/lib/railway/object-storage"
import { ownedRowIdFor } from "@/lib/store-identity"

const TABLE = "demos"

export type DemoVideo = {
  id: string
  title: string
  createdAt: string
  url: string
}

type DemoPayload = {
  id: string
  ownerId: string
  title: string
  contentType: string
  storagePath: string
  createdAt: string
}

function demoRowId(ownerId: string, id: string) {
  return ownedRowIdFor(TABLE, ownerId, id, 0)
}

export async function listDemoVideos(ownerId: string): Promise<DemoVideo[]> {
  const rows = await listDemoRecords(ownerId, 100)
  return rows
    .map((row) => row.payload as DemoPayload)
    .map((payload) => ({
      id: payload.id,
      title: payload.title,
      createdAt: payload.createdAt,
      url: `/api/settings/demos/${payload.id}`,
    }))
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

async function listDemoRecords(
  ownerId: string,
  limit: number
): Promise<Array<{ rowId: string; payload: DemoPayload }>> {
  const { listDomainRecords } = await import(
    "@/lib/railway/domain-record-store"
  )
  const records = await listDomainRecords({
    table: TABLE,
    ownerIds: [ownerId],
    limit,
    order: "desc",
  })
  return records.flatMap((record) =>
    isDemoPayload(record.payload)
      ? [{ rowId: record.rowId, payload: record.payload }]
      : []
  )
}

function isDemoPayload(value: unknown): value is DemoPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as DemoPayload).id === "string" &&
      typeof (value as DemoPayload).storagePath === "string"
  )
}

export async function createDemoVideo(input: {
  ownerId: string
  title: string
  file: File
}) {
  const id = `demo-${randomUUID()}`
  const bytes = Buffer.from(await input.file.arrayBuffer())
  const extension = path.extname(input.file.name) || ".mp4"
  const payload: DemoPayload = {
    id,
    ownerId: input.ownerId,
    title: input.title,
    contentType: input.file.type || "video/mp4",
    storagePath: `assets/demos/${input.ownerId}/${id}${extension}`,
    createdAt: new Date().toISOString(),
  }
  await putRailwayObject({
    key: railwayObjectKey("assets", `${input.ownerId}:${id}${extension}`),
    body: bytes,
    contentType: payload.contentType,
  })
  await putDomainRecords([
    {
      table: TABLE,
      rowId: demoRowId(input.ownerId, id),
      ownerId: input.ownerId,
      rid: id,
      name: input.title,
      ord: -Date.now(),
      payload,
    },
  ])
  return {
    id,
    title: input.title,
    createdAt: payload.createdAt,
    url: `/api/settings/demos/${id}`,
  }
}

export async function readDemoVideo(ownerId: string, id: string) {
  const record = await getDomainRecord(TABLE, demoRowId(ownerId, id))
  const payload = record?.payload
  if (!isDemoPayload(payload) || payload.ownerId !== ownerId) return null
  return {
    bytes: await readRailwayObject(
      railwayObjectKey("assets", `${payload.ownerId}:${payload.id}${path.extname(payload.storagePath)}`)
    ),
    contentType: payload.contentType,
  }
}

export async function deleteDemoVideo(ownerId: string, id: string) {
  const record = await getDomainRecord(TABLE, demoRowId(ownerId, id))
  const payload = record?.payload
  if (!isDemoPayload(payload) || payload.ownerId !== ownerId) return false
  await deleteRailwayObject(
    railwayObjectKey(
      "assets",
      `${payload.ownerId}:${payload.id}${path.extname(payload.storagePath)}`
    )
  )
  await deleteDomainRecord(TABLE, demoRowId(ownerId, id))
  return true
}
