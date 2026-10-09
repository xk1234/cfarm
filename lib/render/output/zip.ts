/**
 * ZIP of rendered slides (server download route, render jobs, client export).
 * Isomorphic: JSZip only.
 */
import JSZip from "jszip"

import type { RenderedSlide } from "../engine"

const EXTENSION_BY_MIME: Record<RenderedSlide["mime"], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

/** `"Sleep habits #12"` → `"sleep-habits-12"`; empty titles get a stable default. */
export function exportSlug(title: string | undefined, fallback = "lumenclip-slideshow"): string {
  const slug = (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug.slice(0, 80).replace(/-+$/g, "") || fallback
}

/** `slide-01.png`, `slide-02.png`, … (at least two digits, in slide order). */
export function slideFileName(position: number, count: number, mime: RenderedSlide["mime"]): string {
  const digits = Math.max(2, String(count).length)
  return `slide-${String(position + 1).padStart(digits, "0")}.${EXTENSION_BY_MIME[mime]}`
}

/** Zips slides (sorted by index) into one archive; entries carry a fixed date so bytes are stable. */
export async function zipRenderedSlides(
  slides: readonly Pick<RenderedSlide, "index" | "mime" | "bytes">[]
): Promise<Uint8Array> {
  if (slides.length === 0) throw new Error("There are no slides to zip.")
  const zip = new JSZip()
  const ordered = [...slides].sort((a, b) => a.index - b.index)
  const date = new Date(Date.UTC(2020, 0, 1))
  ordered.forEach((slide, position) => {
    zip.file(slideFileName(position, ordered.length, slide.mime), slide.bytes, { date, binary: true })
  })
  return zip.generateAsync({ type: "uint8array", compression: "STORE" })
}
