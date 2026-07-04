"use client"

import { useEffect, useRef } from "react"

export function useDismissableLayer<T extends HTMLElement>(
  onDismiss: () => void,
  active = true,
) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!active) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node) || ref.current?.contains(target)) {
        return
      }
      onDismiss()
    }

    document.addEventListener("pointerdown", handlePointerDown, true)
    return () => document.removeEventListener("pointerdown", handlePointerDown, true)
  }, [active, onDismiss])

  return ref
}
