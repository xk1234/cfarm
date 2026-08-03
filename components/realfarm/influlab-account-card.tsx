"use client"

import { useState } from "react"
import {
  IconCheck,
  IconExternalLink,
  IconPlugConnected,
  IconTrash,
} from "@tabler/icons-react"
import useSWR from "swr"

import { Button } from "@/components/ui/button"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { clientSWRFetcher } from "@/lib/client-swr"

type ConnectionStatus = {
  connected: boolean
  healthy?: boolean
  baseUrl?: string
  defaultBaseUrl?: string
  accountEmail?: string
  connectedAt?: string
  collectionCount?: number
  error?: string
}

export function InfluLabAccountCard() {
  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useSWR<ConnectionStatus>("/api/integrations/influlab", clientSWRFetcher)
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const resolvedBaseUrl = baseUrl ?? data?.defaultBaseUrl ?? ""

  async function connect() {
    setPending(true)
    setError("")
    try {
      const result = await fetchJsonWithTimeout<ConnectionStatus>(
        "/api/integrations/influlab",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl: resolvedBaseUrl, accessToken }),
          toastOnError: false,
        }
      )
      setAccessToken("")
      await mutate(result, false)
      window.dispatchEvent(new Event("lumenclip:collections-changed"))
    } catch (connectError) {
      setError(getApiErrorMessage(connectError, "Could not attach InfluLab."))
    } finally {
      setPending(false)
    }
  }

  async function disconnect() {
    setPending(true)
    setError("")
    try {
      await fetchJsonWithTimeout("/api/integrations/influlab", {
        method: "DELETE",
        toastOnError: false,
      })
      await mutate(
        { connected: false, defaultBaseUrl: data?.defaultBaseUrl },
        false
      )
      window.dispatchEvent(new Event("lumenclip:collections-changed"))
    } catch (disconnectError) {
      setError(
        getApiErrorMessage(disconnectError, "Could not disconnect InfluLab.")
      )
    } finally {
      setPending(false)
    }
  }

  const settingsUrl = safeSettingsUrl(resolvedBaseUrl)

  return (
    <section className="mb-8 rounded-[14px] border-2 border-violet-300 bg-violet-50/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-violet-600 text-white">
            <IconPlugConnected className="size-5" />
          </span>
          <h3 className="text-base font-semibold">InfluLab collections</h3>
        </div>
        {data?.connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <IconCheck className="size-4" />
            {data.healthy === false ? "Needs attention" : "Connected"}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-5 h-14 animate-pulse rounded-lg bg-white/80" />
      ) : data?.connected ? (
        <div className="mt-5 space-y-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-app-text-faint">
                Account
              </dt>
              <dd className="mt-1 font-semibold">
                {data.accountEmail || "InfluLab account"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-app-text-faint">
                Collections
              </dt>
              <dd className="mt-1 font-semibold">
                {data.collectionCount ?? 0} available
              </dd>
            </div>
          </dl>
          {data.error ? (
            <p className="text-sm font-medium text-destructive">{data.error}</p>
          ) : null}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void disconnect()}
          >
            <IconTrash className="size-4" />
            {pending ? "Disconnecting..." : "Disconnect InfluLab"}
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold">
            InfluLab URL
            <input
              value={resolvedBaseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://influlab.example.com"
              className="mt-2 h-10 w-full rounded-lg border border-app-panel-border bg-white px-3 text-sm outline-none focus:border-app-action focus:ring-2 focus:ring-app-action/15"
            />
          </label>
          <label className="block text-sm font-semibold">
            Access token
            <input
              type="password"
              autoComplete="off"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="Paste the token from InfluLab settings"
              className="mt-2 h-10 w-full rounded-lg border border-app-panel-border bg-white px-3 text-sm outline-none focus:border-app-action focus:ring-2 focus:ring-app-action/15"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="action"
              disabled={
                pending || !resolvedBaseUrl.trim() || !accessToken.trim()
              }
              onClick={() => void connect()}
            >
              <IconPlugConnected className="size-4" />
              {pending ? "Attaching..." : "Attach InfluLab"}
            </Button>
            {settingsUrl ? (
              <Button asChild variant="outline">
                <a href={settingsUrl} target="_blank" rel="noreferrer">
                  <IconExternalLink className="size-4" />
                  Get token in InfluLab
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {loadError || error ? (
        <p className="mt-4 text-sm font-medium text-destructive">
          {error || "Could not load the InfluLab connection."}
        </p>
      ) : null}
    </section>
  )
}

function safeSettingsUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return ""
    url.pathname = "/settings"
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return ""
  }
}
