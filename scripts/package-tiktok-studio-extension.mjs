import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import JSZip from "jszip"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceDir = path.join(
  root,
  "browser-extension",
  "tiktok-studio-analytics"
)
const outputDir = path.join(root, "public", "downloads")
const outputPath = path.join(outputDir, "lumenclip-tiktok-studio-analytics.zip")
const zip = new JSZip()

await addDirectory(sourceDir, "lumenclip-tiktok-studio-analytics")

await mkdir(outputDir, { recursive: true })
await writeFile(
  outputPath,
  await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  })
)
console.log(path.relative(root, outputPath))

async function addDirectory(directory, zipPath) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const sourcePath = path.join(directory, entry.name)
    const entryPath = `${zipPath}/${entry.name}`
    if (entry.isDirectory()) {
      await addDirectory(sourcePath, entryPath)
    } else if (entry.isFile()) {
      zip.file(entryPath, await readFile(sourcePath))
    }
  }
}
