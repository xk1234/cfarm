/**
 * Render test helpers: deterministic synthetic photos, a fixture asset loader,
 * and a tolerant golden-image comparison (node-canvas pixel diff).
 *
 * Regenerate goldens with `UPDATE_GOLDEN=1 pnpm vitest run test/render`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { createCanvas, loadImage } from "canvas"

import { createMemoryAssetLoader } from "@/lib/render/assets"
import { imageSourceKey } from "@/lib/render/display-list"
import type { AssetLoader, LoadedAsset } from "@/lib/render/engine"
import type { ResolvedLayer, ResolvedSpec } from "@/lib/render/spec"

const PALETTES: [string, string, string][] = [
  ["#1d3557", "#457b9d", "#f1faee"],
  ["#3d405b", "#e07a5f", "#f2cc8f"],
  ["#264653", "#2a9d8f", "#e9c46a"],
  ["#5f0f40", "#9a031e", "#fb8b24"],
  ["#22223b", "#4a4e69", "#c9ada7"],
  ["#283618", "#606c38", "#fefae0"],
  ["#03045e", "#0077b6", "#90e0ef"],
  ["#2b2d42", "#8d99ae", "#edf2f4"],
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** A deterministic "photo": gradient sky, sun, hills and a label, as PNG bytes. */
export function syntheticPhoto(seed: string, width = 900, height = 1200): Uint8Array {
  const [a, b, c] = PALETTES[hash(seed) % PALETTES.length]
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")
  const g = ctx.createLinearGradient(0, 0, 0, height)
  g.addColorStop(0, a)
  g.addColorStop(1, b)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
  const h = hash(seed + "sun")
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.arc(width * (0.25 + (h % 50) / 100), height * 0.3, Math.min(width, height) * 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "rgba(0,0,0,0.35)"
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x <= width; x += width / 8) ctx.lineTo(x, height * (0.62 + 0.08 * Math.sin((x / width) * 6 + (h % 7))))
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()
  // A grid of markers makes crops and focal points visible in goldens.
  ctx.fillStyle = "rgba(255,255,255,0.5)"
  for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) ctx.fillRect((x * width) / 4 - 6, (y * height) / 4 - 6, 12, 12)
  return new Uint8Array(canvas.toBuffer("image/png"))
}

/** A loader that serves a synthetic photo for every image source in `resolved`. */
export function syntheticAssetLoader(resolved: ResolvedSpec, size?: { width: number; height: number }): AssetLoader {
  const entries = new Map<string, LoadedAsset>()
  const visit = (layers: ResolvedLayer[]) => {
    for (const layer of layers) {
      if (layer.type === "image") {
        const key = imageSourceKey(layer.src)
        if (!entries.has(key)) entries.set(key, { bytes: syntheticPhoto(key, size?.width, size?.height), mime: "image/png" })
      }
      if (layer.type === "group") visit(layer.children)
    }
  }
  for (const slide of resolved.slides) visit(slide.layers)
  return createMemoryAssetLoader(entries)
}

export const GOLDEN_DIR = path.join(process.cwd(), "test", "render", "golden")

export type DiffResult = { ratio: number; differing: number; total: number; sizeMismatch: boolean }

async function pixels(png: Uint8Array) {
  const img = await loadImage(Buffer.from(png))
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext("2d")
  ctx.drawImage(img, 0, 0)
  return { width: img.width, height: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data }
}

/** Pixels whose max channel difference exceeds `threshold`, as a ratio of all pixels. */
export async function diffPng(actual: Uint8Array, expected: Uint8Array, threshold = 40): Promise<DiffResult> {
  const a = await pixels(actual)
  const e = await pixels(expected)
  if (a.width !== e.width || a.height !== e.height) return { ratio: 1, differing: -1, total: 0, sizeMismatch: true }
  let differing = 0
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i] - e.data[i]),
      Math.abs(a.data[i + 1] - e.data[i + 1]),
      Math.abs(a.data[i + 2] - e.data[i + 2]),
      Math.abs(a.data[i + 3] - e.data[i + 3])
    )
    if (d > threshold) differing++
  }
  const total = a.width * a.height
  return { ratio: differing / total, differing, total, sizeMismatch: false }
}

/**
 * Compares `png` with `test/render/golden/<name>.png`. Text rasterization
 * differs slightly between Pango builds (macOS vs Linux), hence the tolerance:
 * at most `maxRatio` of pixels may differ by more than the channel threshold.
 */
export async function expectGolden(name: string, png: Uint8Array, maxRatio = 0.01): Promise<DiffResult> {
  const file = path.join(GOLDEN_DIR, `${name}.png`)
  if (process.env.UPDATE_GOLDEN === "1") {
    mkdirSync(GOLDEN_DIR, { recursive: true })
    writeFileSync(file, png)
    return { ratio: 0, differing: 0, total: 0, sizeMismatch: false }
  }
  if (!existsSync(file)) throw new Error(`Missing golden ${file}; run UPDATE_GOLDEN=1 pnpm vitest run test/render`)
  const result = await diffPng(png, new Uint8Array(readFileSync(file)))
  if (result.sizeMismatch || result.ratio > maxRatio) {
    const outDir = path.join(os.tmpdir(), "lumenclip-golden-failures")
    mkdirSync(outDir, { recursive: true })
    writeFileSync(path.join(outDir, `${name}.actual.png`), png)
    throw new Error(
      `Golden "${name}" differs: ${result.sizeMismatch ? "size mismatch" : `${(result.ratio * 100).toFixed(2)}% pixels`} (max ${(maxRatio * 100).toFixed(2)}%). Actual written to ${outDir}.`
    )
  }
  return result
}
