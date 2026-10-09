import { readFile } from "node:fs/promises"
import path from "node:path"

import { listFonts } from "@/lib/render/engine"
import { bundledFontDir } from "@/lib/render/node/fonts"

export const runtime = "nodejs"

const MIME: Record<string, string> = { ".otf": "font/otf", ".ttf": "font/ttf" }

/**
 * Serves bundled registry font files to the in-app browser preview
 * (FontFace). Only files named in the registry are served (no paths), and
 * the route sits behind the Clerk session like every non-public API.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const face = listFonts().find((f) => f.file === file)
  const dir = bundledFontDir()
  if (!face || !dir) return new Response("Not found", { status: 404 })
  const bytes = await readFile(path.join(/* turbopackIgnore: true */ dir, face.file))
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": MIME[path.extname(face.file)] ?? "application/octet-stream",
      "cache-control": "private, max-age=31536000, immutable",
    },
  })
}
