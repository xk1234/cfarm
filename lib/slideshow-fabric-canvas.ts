import type {
  SlideshowFabricImage,
  SlideshowFabricObject,
  SlideshowFabricScene,
} from "@/lib/slideshow-renderer"

type FabricObjectLike = {
  width?: number
  height?: number
  clipPath?: FabricObjectLike
  set(options: Record<string, unknown>): unknown
}

type FabricCanvasLike = {
  backgroundColor: unknown
  add(...objects: FabricObjectLike[]): unknown
  renderAll(): unknown
}

type FabricObjectConstructor = new (
  options: Record<string, unknown>
) => FabricObjectLike

type FabricTextConstructor = new (
  text: string,
  options: Record<string, unknown>
) => FabricObjectLike

export type SlideshowFabricRuntime = {
  Rect: FabricObjectConstructor
  Ellipse: FabricObjectConstructor
  FabricText: FabricTextConstructor
  FabricImage: {
    fromURL(
      url: string,
      loadOptions?: Record<string, unknown>,
      imageOptions?: Record<string, unknown>
    ): Promise<FabricObjectLike>
  }
}

export async function populateSlideshowFabricCanvas(
  runtime: SlideshowFabricRuntime,
  canvas: FabricCanvasLike,
  scene: SlideshowFabricScene
) {
  canvas.backgroundColor = scene.backgroundColor

  for (const layer of scene.objects) {
    const object = await fabricObjectFromLayer(runtime, layer)
    canvas.add(object)
  }

  canvas.renderAll()
}

async function fabricObjectFromLayer(
  runtime: SlideshowFabricRuntime,
  layer: SlideshowFabricObject
): Promise<FabricObjectLike> {
  const shared = {
    selectable: false,
    evented: false,
    objectCaching: false,
    excludeFromExport: false,
  }

  if (layer.kind === "rect") {
    return new runtime.Rect({
      ...shared,
      name: layer.id,
      left: layer.left,
      top: layer.top,
      width: layer.width,
      height: layer.height,
      fill: layer.fill,
      opacity: layer.opacity ?? 1,
      rx: layer.rx ?? 0,
      ry: layer.ry ?? layer.rx ?? 0,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth ?? 0,
      angle: layer.angle ?? 0,
      originX: layer.originX ?? "left",
      originY: layer.originY ?? "top",
    })
  }

  if (layer.kind === "ellipse") {
    return new runtime.Ellipse({
      ...shared,
      left: layer.left,
      top: layer.top,
      rx: layer.rx,
      ry: layer.ry,
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth ?? 0,
      originX: layer.originX ?? "left",
      originY: layer.originY ?? "top",
    })
  }

  if (layer.kind === "text") {
    return new runtime.FabricText(layer.text, {
      ...shared,
      name: layer.id,
      left: layer.left,
      top: layer.top,
      originX: layer.originX,
      originY: layer.originY,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      fill: layer.fill,
      stroke: layer.stroke,
      strokeWidth: layer.strokeWidth ?? 0,
      paintFirst: layer.stroke ? "stroke" : "fill",
      strokeUniform: true,
    })
  }

  return fabricImageFromLayer(runtime, layer, shared)
}

async function fabricImageFromLayer(
  runtime: SlideshowFabricRuntime,
  layer: SlideshowFabricImage,
  shared: Record<string, unknown>
) {
  const image = await runtime.FabricImage.fromURL(
    layer.src,
    { crossOrigin: "anonymous" },
    { ...shared }
  )
  const sourceWidth = Math.max(1, image.width ?? 1)
  const sourceHeight = Math.max(1, image.height ?? 1)
  const scale =
    layer.fit === "contain"
      ? Math.min(layer.width / sourceWidth, layer.height / sourceHeight)
      : Math.max(layer.width / sourceWidth, layer.height / sourceHeight)

  image.set({
    ...shared,
    left: layer.left + (layer.originX === "center" ? 0 : layer.width / 2),
    top: layer.top + (layer.originY === "center" ? 0 : layer.height / 2),
    originX: "center",
    originY: "center",
    scaleX: scale,
    scaleY: scale,
    angle: layer.angle ?? 0,
  })

  if (layer.clip) {
    image.clipPath = new runtime.Rect({
      left: layer.clip.left,
      top: layer.clip.top,
      width: layer.clip.width,
      height: layer.clip.height,
      absolutePositioned: true,
      originX: "left",
      originY: "top",
    })
  }

  return image
}
