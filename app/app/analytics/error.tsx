"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

export default function AnalyticsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => console.error(error), [error])

  return (
    <main className="grid min-h-svh place-items-center bg-[#f7f7fa] p-6">
      <div className="max-w-md rounded-xl border border-app-panel-border bg-white p-6 text-center">
        <h1 className="text-lg font-semibold">Analytics could not be loaded</h1>
        <p className="mt-2 text-sm text-app-muted-text">
          The route hit an unexpected error. Try loading it again.
        </p>
        <Button className="mt-5" variant="action" onClick={unstable_retry}>
          Try again
        </Button>
      </div>
    </main>
  )
}
