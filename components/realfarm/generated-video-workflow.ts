"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type {
  GeneratedVideoCreatePayload,
  GeneratedVideoExport,
  GeneratedVideoStatus,
  GeneratedVideoType,
} from "@/lib/generated-video-types"

export type GeneratedVideoExportUpdatePayload = {
  status: GeneratedVideoStatus
  previewUrl?: string
  videoUrl?: string
  error?: string
}

export function useGeneratedVideoExports(type: GeneratedVideoType, loadErrorMessage: string) {
  const [exports, setExports] = useState<GeneratedVideoExport[]>([])

  useEffect(() => {
    let active = true
    void fetchJsonWithTimeout<{ exports?: GeneratedVideoExport[] }>(`/api/generated-videos?type=${type}`, {
      timeoutMs: 12_000,
      toastOnError: false,
    })
      .then((payload: { exports?: GeneratedVideoExport[] } | null) => {
        if (active && payload?.exports) {
          setExports(payload.exports)
        }
      })
      .catch((loadError) => {
        if (active) {
          toast.error(getApiErrorMessage(loadError, loadErrorMessage))
        }
      })

    return () => {
      active = false
    }
  }, [loadErrorMessage, type])

  return [exports, setExports] as const
}

export async function createGeneratedVideoExportRecord(input: GeneratedVideoCreatePayload, errorMessage: string) {
  const payload = await fetchJsonWithTimeout<{ export?: GeneratedVideoExport }>("/api/generated-videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeoutMs: 12_000,
    toastOnError: false,
    body: JSON.stringify(input),
  })

  if (!payload.export) {
    throw new Error(errorMessage)
  }

  return payload.export
}

export async function updateGeneratedVideoExportRecord(
  id: string,
  update: GeneratedVideoExportUpdatePayload,
  errorMessage: string,
) {
  const payload = await fetchJsonWithTimeout<{ export?: GeneratedVideoExport }>("/api/generated-videos", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    timeoutMs: 12_000,
    toastOnError: false,
    body: JSON.stringify({
      id,
      ...update,
    }),
  })

  if (!payload.export) {
    throw new Error(errorMessage)
  }

  return payload.export
}
