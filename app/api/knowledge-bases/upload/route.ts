import path from "node:path"
import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { persistAsset } from "@/lib/asset-storage"
import { fileIdForPath } from "@/lib/appwrite-stores"
import { getKnowledgeBase, upsertKnowledgeBase, type KnowledgeBaseSource } from "@/lib/knowledge-bases"

export const dynamic = "force-dynamic"

const supported = new Set(["application/pdf", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"])

export const POST = withHandler(async (request: Request) => {
  const form = await request.formData()
  const file = form.get("file")
  const knowledgeBaseId = String(form.get("knowledgeBaseId") ?? "").trim()
  if (!(file instanceof File) || !knowledgeBaseId) {
    return NextResponse.json({ error: "Knowledge base and file are required" }, { status: 400 })
  }
  if (!supported.has(file.type) && !/\.(pdf|mp3|wav)$/i.test(file.name)) {
    return NextResponse.json({ error: "Only PDF, MP3, and WAV files are supported" }, { status: 415 })
  }
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be 100 MB or smaller" }, { status: 413 })
  }
  const kb = await getKnowledgeBase(knowledgeBaseId)
  if (!kb) return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 })
  const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "-")
  const sourceId = randomUUID()
  const relPath = `knowledge-base-files/${knowledgeBaseId}/${sourceId}-${safeName}`
  await persistAsset(path.join(process.cwd(), "data", relPath), Buffer.from(await file.arrayBuffer()))
  const source: KnowledgeBaseSource = {
    id: sourceId,
    mode: "research",
    kind: "file",
    label: file.name,
    value: relPath,
    expiry: "1y",
    enabled: true,
    status: "idle",
    storageFileId: fileIdForPath(relPath),
    fileName: file.name,
    mimeType: file.type,
    chunks: [],
  }
  const knowledgeBase = await upsertKnowledgeBase({ ...kb, sources: [...kb.sources, source] })
  return NextResponse.json({ knowledgeBase, source }, { status: 201 })
})
