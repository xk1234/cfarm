import { sleepIfPositive } from "@/lib/guards"

export async function pollUntil<T>(
  fn: (attempt: number) => Promise<T | null> | T | null,
  options: {
    intervalMs: number
    maxAttempts: number
    description: string
    timeoutMessage?: string
  }
) {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const result = await fn(attempt)
    if (result !== null) {
      return result
    }
    if (attempt < options.maxAttempts - 1) {
      await sleepIfPositive(options.intervalMs)
    }
  }

  throw new Error(
    options.timeoutMessage ||
      `Timed out waiting for ${options.description} after ${options.maxAttempts} attempts`
  )
}
