import { NextResponse } from "next/server"

import {
  benchmarkComparisonForSlideshow,
  listBenchmarkCorpus,
  listGeneratedSlideshowBenchmarks,
} from "@/lib/slideshow-benchmarks"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const slideshowId = url.searchParams.get("slideshowId")?.trim()
  if (slideshowId) {
    return NextResponse.json({
      comparison: await benchmarkComparisonForSlideshow(slideshowId),
    })
  }

  const [corpus, generated] = await Promise.all([
    listBenchmarkCorpus(),
    listGeneratedSlideshowBenchmarks(),
  ])
  return NextResponse.json({ corpus, generated })
}
