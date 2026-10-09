"use client"

import { useMemo, useState, type CSSProperties } from "react"
import { IconBraces, IconCheck, IconCopy } from "@tabler/icons-react"
import JsonView from "@uiw/react-json-view"

import { cn } from "@/lib/utils"

import styles from "./json-viewer.module.css"

export function JsonViewer({
  value,
  label = "JSON",
  compact = false,
  className,
}: {
  value: unknown
  label?: string
  compact?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const json = useMemo(() => JSON.stringify(value, null, 2), [value])
  const height = viewerHeight(value, compact)
  const treeValue = useMemo(
    () =>
      value !== null && typeof value === "object"
        ? (value as object)
        : { value },
    [value]
  )

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section
      className={cn(styles.viewer, compact && styles.compact, className)}
      aria-label={`${label} JSON viewer`}
    >
      <div className={styles.toolbar}>
        <span className={styles.formatLabel}>
          <IconBraces className="size-4" aria-hidden /> JSON
        </span>
        <button
          type="button"
          className={styles.copyButton}
          onClick={() => void copyJson()}
          aria-label={`Copy ${label} JSON`}
        >
          {copied ? (
            <IconCheck className="size-3.5" aria-hidden />
          ) : (
            <IconCopy className="size-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className={styles.editorShell} style={{ height }}>
        <JsonView
          value={treeValue}
          className={styles.editor}
          displayDataTypes={false}
          displayObjectSize
          enableClipboard={false}
          highlightUpdates={false}
          collapsed={compact ? 2 : false}
          shortenTextAfterLength={compact ? 72 : 120}
          style={jsonTheme}
        />
      </div>
    </section>
  )
}

const jsonTheme = {
  "--w-rjv-font-family": "var(--font-mono), ui-monospace, monospace",
  "--w-rjv-color": "var(--app-text)",
  "--w-rjv-background-color": "transparent",
  "--w-rjv-line-color": "var(--app-panel-border)",
  "--w-rjv-arrow-color": "var(--app-text-faint)",
  "--w-rjv-info-color": "var(--app-text-faint)",
  "--w-rjv-key-string": "var(--app-text)",
  "--w-rjv-type-string-color": "var(--app-success)",
  "--w-rjv-type-int-color": "var(--app-action)",
  "--w-rjv-type-float-color": "var(--app-action)",
  "--w-rjv-type-boolean-color": "var(--app-danger)",
  "--w-rjv-type-null-color": "var(--app-danger)",
} as CSSProperties

function viewerHeight(value: unknown, compact: boolean) {
  const rows = estimatedRows(value)
  const maximum = compact ? 240 : 360
  return Math.min(maximum, Math.max(132, rows * 24 + 24))
}

function estimatedRows(value: unknown, depth = 0): number {
  if (depth > 5 || value === null || typeof value !== "object") return 1
  const entries = Array.isArray(value) ? value : Object.values(value)
  return Math.min(
    18,
    1 +
      entries.reduce((total, item) => total + estimatedRows(item, depth + 1), 0)
  )
}
