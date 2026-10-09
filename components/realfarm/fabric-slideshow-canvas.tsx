"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva"
import type { KonvaEventObject } from "konva/lib/Node"
import type { Rect as KonvaRectNode } from "konva/lib/shapes/Rect"
import type { Transformer as KonvaTransformerNode } from "konva/lib/shapes/Transformer"

import {
  renderedTextItemEditorBounds,
  slideshowFabricScene,
  type SlideshowFabricScene,
  type SlideshowSlide,
} from "@/lib/slideshow-renderer"
import type {
  SlideshowFabricImage,
  SlideshowFabricObject,
  SlideshowTextBounds,
} from "@/lib/slideshow-renderer"

type KonvaTextRect = SlideshowTextBounds

const MAX_PREVIEW_WIDTH = 1080

export function FabricSlideshowCanvas({
  slide,
  sourceUrl,
  overlayUrl,
  aspectRatio,
  font,
  iconUrls,
  label = "Slideshow preview",
  editable = false,
  selectedTextIndex = null,
  onSelectText,
  onClearTextSelection,
  onTextTransform,
}: {
  slide: SlideshowSlide
  sourceUrl: string
  overlayUrl?: string
  aspectRatio?: string
  font?: string
  iconUrls?: string[]
  label?: string
  editable?: boolean
  selectedTextIndex?: number | null
  onSelectText?: (index: number) => void
  onClearTextSelection?: () => void
  onTextTransform?: (
    index: number,
    transform: {
      left: number
      top: number
      width: number
      height: number
      canvasWidth: number
      canvasHeight: number
    }
  ) => void
}) {
  const transformerRef = useRef<KonvaTransformerNode | null>(null)
  const editorShapeRefs = useRef<Array<KonvaRectNode | null>>([])
  const onSelectTextRef = useRef(onSelectText)
  const onClearTextSelectionRef = useRef(onClearTextSelection)
  const onTextTransformRef = useRef(onTextTransform)
  const [failed, setFailed] = useState(false)
  const [loadedImages, setLoadedImages] = useState<
    Record<string, HTMLImageElement>
  >({})
  const imageLoadPromisesRef = useRef<Record<string, Promise<void> | null>>({})

  const sceneJson = JSON.stringify(
    slideshowFabricScene(slide, sourceUrl, overlayUrl, {
      aspectRatio,
      font,
      iconUrls,
    })
  )
  const scene: SlideshowFabricScene = useMemo(
    () => JSON.parse(sceneJson) as SlideshowFabricScene,
    [sceneJson]
  )
  const textItemsJson = JSON.stringify(slide.textItems)
  const textItems = useMemo(
    () => JSON.parse(textItemsJson) as SlideshowSlide["textItems"],
    [textItemsJson]
  )
  const editorBounds = useMemo(
    () => renderedTextItemEditorBounds(textItems, scene.width, scene.height),
    [scene.height, scene.width, textItems]
  )

  useEffect(() => {
    onSelectTextRef.current = onSelectText
    onClearTextSelectionRef.current = onClearTextSelection
    onTextTransformRef.current = onTextTransform
  }, [onClearTextSelection, onSelectText, onTextTransform])

  const imageUrls = useMemo(
    () =>
      Array.from(
        new Set(
          scene.objects
            .filter(
              (object): object is SlideshowFabricImage =>
                object.kind === "image"
            )
            .map((object) => object.src)
        )
      ),
    [scene.objects]
  )

  useEffect(() => {
    let cancelled = false
    const loadImage = (url: string) => {
      if (imageLoadPromisesRef.current[url]) {
        return imageLoadPromisesRef.current[url]
      }
      const load = new Promise<void>((resolve) => {
        if (loadedImages[url]) {
          resolve()
          return
        }
        const image = new Image()
        image.crossOrigin = "anonymous"
        image.onload = () => {
          if (cancelled) return
          setLoadedImages((previous) => {
            if (previous[url]) return previous
            return { ...previous, [url]: image }
          })
          resolve()
        }
        image.onerror = () => {
          resolve()
        }
        image.src = url
      })
      imageLoadPromisesRef.current[url] = load
      return load
    }

    Promise.all(imageUrls.map((url) => loadImage(url))).catch((error) => {
      if (!cancelled) {
        console.error("Konva slideshow preview image failed", error)
        setFailed(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [imageUrls, loadedImages])

  const editorTargets = editorBounds

  useEffect(() => {
    if (!editable) return
    const transformer = transformerRef.current
    if (!transformer) return
    const selectedShape =
      selectedTextIndex === null
        ? null
        : editorShapeRefs.current[selectedTextIndex]
    const target = (selectedShape ? [selectedShape] : []) as KonvaRectNode[]
    transformer.nodes(target)
  }, [
    editable,
    selectedTextIndex,
    editorBounds.length,
    scene.width,
    scene.height,
  ])

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const shapes = editable
      ? (editorShapeRefs.current.filter(Boolean) as KonvaRectNode[])
      : []
    transformer.nodes(shapes)
    transformer.getLayer?.()?.batchDraw()
  }, [editable, editorBounds.length])

  const scale = Math.min(1, MAX_PREVIEW_WIDTH / scene.width)
  const stageWidth = Math.max(1, Math.round(scene.width * scale))
  const stageHeight = Math.max(1, Math.round(scene.height * scale))

  function clampShape(shape: KonvaRectNode) {
    const width = Math.max(1, shape.width() * shape.scaleX())
    const height = Math.max(1, shape.height() * shape.scaleY())
    const clampedWidth = Math.min(scene.width, width)
    const clampedHeight = Math.min(scene.height, height)
    const clampedX = Math.max(
      0,
      Math.min(shape.x(), scene.width - clampedWidth)
    )
    const clampedY = Math.max(
      0,
      Math.min(shape.y(), scene.height - clampedHeight)
    )

    shape.x(clampedX)
    shape.y(clampedY)
    shape.width(clampedWidth)
    shape.height(clampedHeight)
    shape.scaleX(1)
    shape.scaleY(1)
  }

  function emitTransform(index: number, rect: KonvaRectNode) {
    onTextTransformRef.current?.(index, {
      left: rect.x(),
      top: rect.y(),
      width: rect.width(),
      height: rect.height(),
      canvasWidth: scene.width,
      canvasHeight: scene.height,
    })
  }

  function renderSceneObject(object: SlideshowFabricObject) {
    if (object.kind === "rect") {
      return (
        <Rect
          key={`rect-${object.left}-${object.top}-${object.width}-${object.height}`}
          x={object.left}
          y={object.top}
          width={object.width}
          height={object.height}
          fill={object.fill}
          opacity={object.opacity}
          cornerRadius={
            object.rx
              ? Math.max(0, object.rx)
              : object.ry
                ? Math.max(0, object.ry)
                : 0
          }
          stroke={object.stroke}
          strokeWidth={object.strokeWidth}
          listening={false}
        />
      )
    }

    if (object.kind === "ellipse") {
      return (
        <Ellipse
          key={`ellipse-${object.left}-${object.top}-${object.rx}-${object.ry}`}
          x={object.left}
          y={object.top}
          radiusX={object.rx}
          radiusY={object.ry}
          fill={object.fill}
          stroke={object.stroke}
          strokeWidth={object.strokeWidth}
          listening={false}
        />
      )
    }

    if (object.kind === "text") {
      const textAlign =
        object.originX === "left"
          ? "left"
          : object.originX === "right"
            ? "right"
            : "center"
      return (
        <Text
          key={`${object.id}-${object.text}`}
          x={object.left}
          y={object.top - object.fontSize * 0.5}
          text={object.text}
          fontFamily={object.fontFamily}
          fontSize={object.fontSize}
          fontStyle={object.fontWeight >= 700 ? "bold" : "normal"}
          fill={object.fill}
          stroke={object.stroke}
          strokeWidth={object.strokeWidth}
          align={textAlign}
          listening={false}
          lineHeight={1.12}
          perfectDrawEnabled={false}
        />
      )
    }

    const image = loadedImages[object.src]
    if (!image) return null

    const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1)
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1)
    const scaleToFit =
      object.fit === "contain"
        ? Math.min(object.width / sourceWidth, object.height / sourceHeight)
        : Math.max(object.width / sourceWidth, object.height / sourceHeight)
    const imageX =
      object.left + (object.originX === "center" ? 0 : object.width / 2)
    const imageY =
      object.top + (object.originY === "center" ? 0 : object.height / 2)

    const imageNode = (
      <KonvaImage
        key={`image-${object.left}-${object.top}-${object.src}`}
        x={imageX}
        y={imageY}
        offsetX={sourceWidth / 2}
        offsetY={sourceHeight / 2}
        image={image}
        width={sourceWidth}
        height={sourceHeight}
        scaleX={scaleToFit}
        scaleY={scaleToFit}
        rotation={object.angle}
        listening={false}
      />
    )

    if (!object.clip) return imageNode
    return (
      <Group
        key={`clipped-image-${object.left}-${object.top}-${object.src}`}
        clipX={object.clip.left}
        clipY={object.clip.top}
        clipWidth={object.clip.width}
        clipHeight={object.clip.height}
        listening={false}
      >
        {imageNode}
      </Group>
    )
  }

  return (
    <div className="relative h-full w-full bg-[#111]">
      <Stage
        width={stageWidth}
        height={stageHeight}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(event: KonvaEventObject<MouseEvent>) => {
          if (!editable) return
          if (event.target === event.target.getStage()) {
            onClearTextSelectionRef.current?.()
          }
        }}
        onTouchStart={(event: KonvaEventObject<TouchEvent>) => {
          if (!editable) return
          if (event.target === event.target.getStage()) {
            onClearTextSelectionRef.current?.()
          }
        }}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
        }}
        role="img"
        aria-label={label}
        data-slideshow-text-editor={editable ? "fabric-canvas" : undefined}
      >
        <Layer>
          {scene.objects.map((object) => renderSceneObject(object))}
          {editable ? (
            <>
              {editorTargets.map((target: KonvaTextRect, index) => (
                <Rect
                  key={`editor-target-${index}`}
                  ref={(node) => {
                    editorShapeRefs.current[index] = node
                  }}
                  x={target.left}
                  y={target.top}
                  width={target.width}
                  height={target.height}
                  fill="rgba(79, 145, 255, 0.001)"
                  stroke={
                    selectedTextIndex === index
                      ? "#4f91ff"
                      : "rgba(79,145,255,0)"
                  }
                  strokeWidth={selectedTextIndex === index ? 2 : 0}
                  draggable={editable}
                  perfectDrawEnabled={false}
                  onPointerDown={(event) => {
                    if (!editable) return
                    event.cancelBubble = true
                    onSelectTextRef.current?.(index)
                  }}
                  onDragMove={(event: KonvaEventObject<MouseEvent>) => {
                    if (!editable) return
                    clampShape(event.target as KonvaRectNode)
                  }}
                  onDragEnd={(event: KonvaEventObject<MouseEvent>) => {
                    if (!editable) return
                    const node = event.target as KonvaRectNode
                    clampShape(node)
                    emitTransform(index, node)
                    onSelectTextRef.current?.(index)
                  }}
                  onTransformEnd={(event: KonvaEventObject<Event>) => {
                    if (!editable) return
                    const node = event.target as KonvaRectNode
                    const width = node.width() * node.scaleX()
                    node.width(Math.max(1, Math.min(scene.width, width)))
                    node.scaleX(1)
                    node.scaleY(1)
                    clampShape(node)
                    emitTransform(index, node)
                  }}
                />
              ))}
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                rotateAnchorOffset={0}
                enabledAnchors={["middle-left", "middle-right"]}
                borderDash={[6, 4]}
                borderStroke="#4f91ff"
                borderStrokeWidth={1}
                anchorFill="#4f91ff"
                anchorStroke="#ffffff"
                anchorSize={12}
                anchorCornerRadius={2}
                boundBoxFunc={(_, newBox) => ({
                  ...newBox,
                  height: newBox.height,
                })}
              />
            </>
          ) : null}
        </Layer>
      </Stage>
      {failed ? (
        <div className="absolute inset-0 grid place-items-center px-3 text-center text-[10px] font-semibold text-white/70">
          Preview unavailable
        </div>
      ) : null}
    </div>
  )
}
