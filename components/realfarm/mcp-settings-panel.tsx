"use client"

import { useMemo, useState } from "react"
import { IconSearch } from "@tabler/icons-react"

import { SwitchPillButton } from "@/components/ui/form-controls"
import { ListSkeleton } from "@/components/ui/loading-skeleton"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { clientQueryFetcher } from "@/lib/client-fetcher"
import { useAppQuery } from "@/lib/client-query"

type McpTool = {
  name: string
  category: string
  enabled: boolean
}

type McpToolsResponse = { tools: McpTool[] }

const categoryLabels: Record<string, string> = {
  workflows: "Workflows",
  automations: "Templates",
  slideshows: "Slideshows",
  videos: "Videos",
  collections: "Collections",
  outputs: "Outputs",
  publishing: "Publishing",
  scheduling: "Scheduling",
  analytics: "Analytics",
}

export function McpSettingsPanel() {
  const {
    data,
    error: loadError,
    isLoading,
    mutate,
  } = useAppQuery<McpToolsResponse>("/api/settings/mcp", clientQueryFetcher)
  const [query, setQuery] = useState("")
  const [pendingTool, setPendingTool] = useState("")
  const [error, setError] = useState("")
  const tools = useMemo(() => data?.tools ?? [], [data])
  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = normalizedQuery
      ? tools.filter((tool) =>
          `${tool.name} ${tool.category} ${toolLabel(tool.name)}`
            .toLowerCase()
            .includes(normalizedQuery)
        )
      : tools
    return Object.entries(
      Object.groupBy(filtered, (tool) => tool.category)
    ).filter((entry): entry is [string, McpTool[]] => Boolean(entry[1]?.length))
  }, [query, tools])

  async function toggle(tool: McpTool) {
    if (pendingTool) return
    setPendingTool(tool.name)
    setError("")
    try {
      const response = await fetchJsonWithTimeout<McpToolsResponse>(
        "/api/settings/mcp",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolName: tool.name, enabled: !tool.enabled }),
          toastOnError: false,
        }
      )
      await mutate(response, false)
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not update this MCP API."))
    } finally {
      setPendingTool("")
    }
  }

  return (
    <div>
      <div className="mb-7 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-[-0.035em]">MCP APIs</h2>
        {tools.length > 0 ? (
          <span className="rounded-full bg-app-surface-subtle px-2.5 py-1 text-xs font-semibold text-app-muted-text">
            {tools.filter((tool) => tool.enabled).length} enabled
          </span>
        ) : null}
      </div>

      <label className="relative block">
        <span className="sr-only">Search MCP APIs</span>
        <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-app-text-faint" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search APIs"
          className="lc-focus-ring h-10 w-full rounded-app-control border border-app-panel-border bg-app-surface pr-3 pl-9 text-sm outline-none placeholder:text-app-text-faint"
        />
      </label>

      {error || loadError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error || "Could not load MCP APIs."}
        </p>
      ) : null}

      {isLoading ? (
        <div className="mt-6">
          <ListSkeleton count={6} />
        </div>
      ) : groups.length > 0 ? (
        <div className="mt-6 space-y-7">
          {groups.map(([category, categoryTools]) => (
            <section key={category}>
              <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-app-text-faint uppercase">
                {categoryLabels[category] ?? category}
              </h3>
              <div className="divide-y divide-app-panel-border border-y border-app-panel-border">
                {categoryTools.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex min-h-16 items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-app-text">
                        {toolLabel(tool.name)}
                      </p>
                      <code className="block truncate text-xs text-app-text-faint">
                        {tool.name}
                      </code>
                    </div>
                    <SwitchPillButton
                      enabled={tool.enabled}
                      disabled={Boolean(pendingTool)}
                      onClick={() => void toggle(tool)}
                      aria-label={`${tool.enabled ? "Disable" : "Enable"} ${toolLabel(tool.name)}`}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-app-muted-text">
          No MCP APIs match your search.
        </p>
      )}
    </div>
  )
}

function toolLabel(name: string) {
  return name
    .replace(/^lumenclip_/, "")
    .split("_")
    .map((word) => {
      const uppercase: Record<string, string> = {
        ai: "AI",
        api: "API",
        mcp: "MCP",
        tiktok: "TikTok",
        ugc: "UGC",
      }
      return (
        uppercase[word] ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`
      )
    })
    .join(" ")
}
