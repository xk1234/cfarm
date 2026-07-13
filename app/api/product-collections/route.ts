import { NextResponse } from "next/server"

import { listProductCollections } from "@/lib/product-collections"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ collections: await listProductCollections() })
}
