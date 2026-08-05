"use client"

import type JSONEditor from "jsoneditor"
import type { JSONEditorMode } from "jsoneditor"
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

import styles from "./pipeline-stage-json-enhancer.module.css"

type StagePanel = {
  id: string
  anchor: HTMLDivElement
  input: unknown
  output: unknown
}

type HiddenSource = {
  anchor: HTMLDivElement
  elements: HTMLElement[]
}

export function PipelineStageJsonEnhancer() {
  const markerRef = useRef<HTMLSpanElement | null>(null)
  const [panels, setPanels] = useState<StagePanel[]>([])

  useEffect(() => {
    const docsBody = markerRef.current?.closest(".docs-body")
    if (!docsBody) return

    const hiddenSources: HiddenSource[] = []
    const nextPanels: StagePanel[] = []
    const headings = Array.from(docsBody.querySelectorAll("h2"))

    for (const [index, heading] of headings.entries()) {
      if (!heading.textContent?.trim().startsWith("Stage ")) continue

      const stageElements = elementsUntilNextHeading(heading)
      const input = labeledJsonBlock(stageElements, "Input")
      const output = labeledJsonBlock(stageElements, "Output")
      if (!input || !output) continue

      const anchor = document.createElement("div")
      anchor.dataset.pipelineStageJson = "true"
      input.label.before(anchor)

      const elements = Array.from(
        new Set([input.label, input.block, output.label, output.block])
      )
      for (const element of elements) element.hidden = true

      hiddenSources.push({ anchor, elements })
      nextPanels.push({
        id: `${heading.id || "pipeline-stage"}-${index}`,
        anchor,
        input: input.value,
        output: output.value,
      })
    }

    setPanels(nextPanels)

    return () => {
      for (const source of hiddenSources) {
        for (const element of source.elements) element.hidden = false
        source.anchor.remove()
      }
    }
  }, [])

  return (
    <>
      <span ref={markerRef} hidden aria-hidden="true" />
      {panels.map((panel) =>
        createPortal(
          <StageJsonComparison input={panel.input} output={panel.output} />,
          panel.anchor,
          panel.id
        )
      )}
    </>
  )
}

function StageJsonComparison({
  input,
  output,
}: {
  input: unknown
  output: unknown
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const [split, setSplit] = useState(50)

  function updateSplit(clientX: number) {
    const bounds = frameRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width === 0) return
    const next = ((clientX - bounds.left) / bounds.width) * 100
    setSplit(Math.min(82, Math.max(18, next)))
  }

  function startDragging(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    updateSplit(event.clientX)
    event.preventDefault()
  }

  function drag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    updateSplit(event.clientX)
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") setSplit((value) => Math.max(18, value - 5))
    else if (event.key === "ArrowRight")
      setSplit((value) => Math.min(82, value + 5))
    else if (event.key === "Home") setSplit(18)
    else if (event.key === "End") setSplit(82)
    else return
    event.preventDefault()
  }

  return (
    <div
      ref={frameRef}
      className={`${styles.comparison} not-prose`}
      style={{ "--pipeline-input-width": `${split}%` } as CSSProperties}
    >
      <JsonPane label="Input" value={input} />
      <div
        className={styles.divider}
        role="separator"
        aria-label="Resize input and output JSON panes"
        aria-orientation="vertical"
        aria-valuemin={18}
        aria-valuemax={82}
        aria-valuenow={Math.round(split)}
        tabIndex={0}
        onPointerDown={startDragging}
        onPointerMove={drag}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={resizeWithKeyboard}
      >
        <span className={styles.dividerLine} />
        <span className={styles.dividerGrip} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <JsonPane label="Output" value={output} />
    </div>
  )
}

function JsonPane({ label, value }: { label: string; value: unknown }) {
  const visibilityRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const element = visibilityRef.current
    if (!element || typeof IntersectionObserver === "undefined") {
      setActive(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setActive(true)
        observer.disconnect()
      },
      { rootMargin: "600px 0px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let editor: JSONEditor | null = null

    async function mountEditor() {
      const container = containerRef.current
      if (!container) return
      const { default: JSONEditorConstructor } = await import("jsoneditor")
      if (cancelled) return

      editor = new JSONEditorConstructor(
        container,
        {
          mode: "code" as JSONEditorMode,
          modes: ["code", "tree", "view"] as JSONEditorMode[],
          mainMenuBar: true,
          navigationBar: false,
          statusBar: true,
          search: true,
          history: true,
        },
        value
      )
    }

    void mountEditor()
    return () => {
      cancelled = true
      editor?.destroy()
    }
  }, [active, value])

  return (
    <section className={styles.pane} aria-label={`${label} JSON`}>
      <div className={styles.paneHeader}>
        <strong>{label}</strong>
        <span>Local editor</span>
      </div>
      <div ref={visibilityRef} className={styles.editor}>
        {active ? (
          <div ref={containerRef} className={styles.editorMount} />
        ) : (
          <pre className={styles.placeholder}>
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
      </div>
    </section>
  )
}

function elementsUntilNextHeading(heading: Element) {
  const elements: HTMLElement[] = []
  let current = heading.nextElementSibling
  while (current && current.tagName !== "H2") {
    if (current instanceof HTMLElement) elements.push(current)
    current = current.nextElementSibling
  }
  return elements
}

function labeledJsonBlock(elements: HTMLElement[], label: string) {
  const labelIndex = elements.findIndex(
    (element) =>
      element.textContent?.trim() === label && element.querySelector("strong")
  )
  if (labelIndex < 0) return null

  for (let index = labelIndex + 1; index < elements.length; index += 1) {
    const element = elements[index]
    const code = element.matches("pre")
      ? (element.querySelector("code") ?? element)
      : (element.querySelector("pre code") ?? element.querySelector("pre"))
    if (!code) continue

    try {
      return {
        label: elements[labelIndex],
        block: element,
        value: JSON.parse(code.textContent ?? ""),
      }
    } catch {
      return null
    }
  }

  return null
}
