/**
 * Best-effort nudge to the worker after enqueueing work, so it does not wait
 * out its idle poll interval. Uses Railway private networking
 * (`WORKER_WAKE_URL`, e.g. http://worker.railway.internal:8080/wake). No secret
 * is involved: waking only shortens the worker's sleep.
 */
export async function wakeWorker(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const url = env.WORKER_WAKE_URL?.trim()
  if (!url) return false
  try {
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(1_000) })
    return res.ok
  } catch {
    return false
  }
}
