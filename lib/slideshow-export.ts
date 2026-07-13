import JSZip from "jszip"

export type ExportableSlideshowSlide = {
  imageUrl: string
}

export async function exportSlideshowAsPngZip(input: {
  title: string
  slides: ExportableSlideshowSlide[]
}) {
  if (input.slides.length === 0) {
    throw new Error("This slideshow has no slides to export.")
  }

  const zip = new JSZip()
  const digits = Math.max(2, String(input.slides.length).length)

  for (const [index, slide] of input.slides.entries()) {
    const png = await slideImageAsPng(slide.imageUrl)
    zip.file(`slide-${String(index + 1).padStart(digits, "0")}.png`, png)
  }

  const archive = await zip.generateAsync({ type: "blob" })
  downloadBlob(archive, `${slideshowExportSlug(input.title)}.zip`)
}

export function slideshowExportSlug(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "lumenclip-slideshow"
}

async function slideImageAsPng(imageUrl: string) {
  const response = await fetch(imageUrl, { credentials: "include" })
  if (!response.ok) {
    throw new Error(`Could not download slide image (${response.status}).`)
  }

  const source = await response.blob()
  const objectUrl = URL.createObjectURL(source)

  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement("canvas")
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    if (!canvas.width || !canvas.height) {
      throw new Error("A slide image has invalid dimensions.")
    }

    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("PNG export is unavailable in this browser.")
    }
    context.drawImage(image, 0, 0)
    return canvasToPng(canvas)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("A slide image could not be decoded."))
    image.src = src
  })
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error("A slide could not be converted to PNG."))
      }
    }, "image/png")
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
