import { mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Dev utility: persist a JSON payload from the browser to a local tmp file so
// debugging sessions can hand large blobs to CLI tooling without copy/paste.
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    name?: string
    data?: unknown
  } | null
  const name = (payload?.name ?? "").replace(/[^a-zA-Z0-9_-]/g, "")
  if (!name || payload?.data === undefined) {
    return NextResponse.json(
      { error: "name and data are required" },
      { status: 400 }
    )
  }
  const dir = path.join(os.tmpdir(), "cfarm-debug-dumps")
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${name}.json`)
  await writeFile(filePath, JSON.stringify(payload.data, null, 1))
  return NextResponse.json({ path: filePath })
}
