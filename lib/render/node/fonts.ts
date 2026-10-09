/**
 * Server font setup: fontconfig + node-canvas registration of every bundled
 * face under its registry family name (successor of lib/font-config.ts).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { serverFontFiles, type ServerFontFile } from "../fonts"

const PROBE_FILE = "Inter-Variable.ttf"

/**
 * Locates `assets/fonts`. `process.cwd()` is not reliable (renders can run
 * from other working directories), so fall back to paths relative to this
 * module, then to `LUMENCLIP_FONT_DIR`.
 */
export function bundledFontDir(): string | null {
  const here = (() => {
    try {
      return path.dirname(fileURLToPath(import.meta.url))
    } catch {
      return null
    }
  })()
  const candidates = [
    process.env.LUMENCLIP_FONT_DIR,
    path.join(/* turbopackIgnore: true */ process.cwd(), "assets", "fonts"),
    here ? path.resolve(/* turbopackIgnore: true */ here, "..", "..", "..", "assets", "fonts") : null,
  ].filter((d): d is string => !!d)
  return candidates.find((dir) => existsSync(/* turbopackIgnore: true */ path.join(dir, PROBE_FILE))) ?? null
}

/**
 * Points fontconfig at the bundled directory (hosts like the Railway Alpine
 * image ship no usable default config). Idempotent; must run before
 * node-canvas loads. Returns false when the font directory is missing.
 */
export function configureFontconfig(fontDir: string | null = bundledFontDir()): boolean {
  if (!fontDir) return false
  const absoluteDir = path.resolve(/* turbopackIgnore: true */ fontDir)
  const cacheDir = path.join(/* turbopackIgnore: true */ os.tmpdir(), "lumenclip-fontconfig")
  try {
    mkdirSync(/* turbopackIgnore: true */ cacheDir, { recursive: true })
  } catch {
    /* already present */
  }
  const confPath = path.join(/* turbopackIgnore: true */ cacheDir, "fonts.conf")
  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${absoluteDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`
  try {
    if (!existsSync(/* turbopackIgnore: true */ confPath) || readFileSync(/* turbopackIgnore: true */ confPath, "utf8") !== conf) {
      writeFileSync(/* turbopackIgnore: true */ confPath, conf)
    }
  } catch {
    return false
  }
  if (!process.env.FONTCONFIG_FILE) process.env.FONTCONFIG_FILE = confPath
  return true
}

export class FontSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FontSetupError"
  }
}

type RegisterFont = (file: string, options: { family: string; weight?: string; style?: string }) => void

let registeredFiles: ServerFontFile[] | null = null

/**
 * Registers every bundled face with node-canvas exactly once. Throws when the
 * font directory or a face file is missing: rendering with host fallback
 * fonts would silently change output.
 */
export function registerServerFonts(registerFont: RegisterFont, fontDir: string | null = bundledFontDir()): ServerFontFile[] {
  if (registeredFiles) return registeredFiles
  if (!fontDir) throw new FontSetupError("Bundled font directory assets/fonts was not found (set LUMENCLIP_FONT_DIR).")
  const files = serverFontFiles()
  for (const f of files) {
    const file = path.join(/* turbopackIgnore: true */ fontDir, f.file)
    if (!existsSync(/* turbopackIgnore: true */ file)) throw new FontSetupError(`Bundled font file is missing: ${f.file}`)
  }
  for (const f of files) {
    registerFont(path.join(/* turbopackIgnore: true */ fontDir, f.file), { family: f.family, weight: String(f.weight), style: "normal" })
  }
  registeredFiles = files
  return files
}
