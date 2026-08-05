export const MIN_SLIDE_ZOOM = 0.5
export const MAX_SLIDE_ZOOM = 5

export type SlideViewportSize = {
  width: number
  height: number
}

export type SlideViewportTransform = {
  zoom: number
  x: number
  y: number
}

export type SlideViewportPoint = {
  x: number
  y: number
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function fitSlideToViewport(
  viewport: SlideViewportSize,
  image: SlideViewportSize
): SlideViewportSize {
  const viewportWidth = finitePositive(viewport.width, 1)
  const viewportHeight = finitePositive(viewport.height, 1)
  const imageWidth = finitePositive(image.width, 4)
  const imageHeight = finitePositive(image.height, 5)
  const scale = Math.min(
    viewportWidth / imageWidth,
    viewportHeight / imageHeight
  )

  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
  }
}

export function clampSlideZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return MIN_SLIDE_ZOOM
  return Math.min(MAX_SLIDE_ZOOM, Math.max(MIN_SLIDE_ZOOM, zoom))
}

export function clampSlideTransform(
  transform: SlideViewportTransform,
  stage: SlideViewportSize
): SlideViewportTransform {
  const zoom = clampSlideZoom(transform.zoom)
  const maxX = Math.max(0, (stage.width * (zoom - 1)) / 2)
  const maxY = Math.max(0, (stage.height * (zoom - 1)) / 2)

  return {
    zoom,
    x: maxX === 0 ? 0 : Math.min(maxX, Math.max(-maxX, transform.x)),
    y: maxY === 0 ? 0 : Math.min(maxY, Math.max(-maxY, transform.y)),
  }
}

export function zoomSlideAroundPoint(
  transform: SlideViewportTransform,
  nextZoom: number,
  point: SlideViewportPoint,
  stage: SlideViewportSize
): SlideViewportTransform {
  const zoom = clampSlideZoom(nextZoom)
  const ratio = zoom / transform.zoom

  return clampSlideTransform(
    {
      zoom,
      x: point.x - (point.x - transform.x) * ratio,
      y: point.y - (point.y - transform.y) * ratio,
    },
    stage
  )
}
