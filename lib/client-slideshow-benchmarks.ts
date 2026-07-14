import {
  fetchJsonWithTimeout,
  getApiErrorMessage,
} from "@/lib/client-api"
import type { SlideshowBenchmarkComparison } from "@/lib/slideshow-benchmarks"

export async function generateSlideshowBenchmark(slideshowId: string) {
  const payload = await fetchJsonWithTimeout<{
    comparison?: SlideshowBenchmarkComparison | null
  }>("/api/benchmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slideshowId }),
    timeoutMs: 2 * 60_000,
    toastOnError: false,
  })

  if (!payload.comparison) {
    throw new Error(
      "Benchmark generation returned without scores for this slideshow."
    )
  }
  return payload.comparison
}

export function benchmarkErrorMessage(error: unknown) {
  return getApiErrorMessage(
    error,
    "The benchmark model failed without returning an error message."
  )
}
