"use client"

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { Layer, Rect, Stage, Transformer } from "react-konva"
import type { KonvaEventObject } from "konva/lib/Node"
import type { Rect as KonvaRectNode } from "konva/lib/shapes/Rect"
import type { Transformer as KonvaTransformerNode } from "konva/lib/shapes/Transformer"

import type {
  SlideshowImageBounds,
  SlideshowTextBounds,
} from "@/lib/slideshow-renderer"

export type KonvaLayerTransform = {
  left: number
  top: number
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
}

type Selection =
  { kind: "text"; index: number } | { kind: "image"; index: number } | null

export function KonvaSlideOverlay({
  textBounds,
  imageBounds,
  canvasWidth,
  canvasHeight,
  displayWidth,
  displayHeight,
  selectedTextIndex,
  selectedImageIndex,
  onSelectText,
  onSelectImage,
  onClearSelection,
  onTextTransform,
  onImageTransform,
}: {
  textBounds: SlideshowTextBounds[]
  imageBounds: SlideshowImageBounds[]
  canvasWidth: number
  canvasHeight: number
  displayWidth: number
  displayHeight: number
  selectedTextIndex: number | null
  selectedImageIndex: number | null
  onSelectText: (index: number) => void
  onSelectImage: (index: number) => void
  onClearSelection: () => void
  onTextTransform: (index: number, transform: KonvaLayerTransform) => void
  onImageTransform: (index: number, transform: KonvaLayerTransform) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const transformerRef = useRef<KonvaTransformerNode | null>(null)
  const textRefs = useRef<Array<KonvaRectNode | null>>([])
  const imageRefs = useRef<Array<KonvaRectNode | null>>([])
  const scaleX = displayWidth / canvasWidth
  const scaleY = displayHeight / canvasHeight
  const selection: Selection =
    selectedImageIndex !== null
      ? { kind: "image", index: selectedImageIndex }
      : selectedTextIndex !== null
        ? { kind: "text", index: selectedTextIndex }
        : null

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const selectedShape =
      selectedImageIndex !== null
        ? imageRefs.current[selectedImageIndex]
        : selectedTextIndex !== null
          ? textRefs.current[selectedTextIndex]
          : null
    transformer.nodes(selectedShape ? [selectedShape] : [])
    transformer.enabledAnchors(
      selectedImageIndex !== null
        ? [
            "top-left",
            "top-center",
            "top-right",
            "middle-left",
            "middle-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ]
        : ["middle-left", "middle-right"]
    )
    transformer.getLayer()?.batchDraw()
  }, [
    imageBounds.length,
    selectedImageIndex,
    selectedTextIndex,
    textBounds.length,
  ])

  function clampShape(shape: KonvaRectNode, minimumSize: number) {
    const width = Math.max(minimumSize, shape.width() * shape.scaleX())
    const height = Math.max(minimumSize, shape.height() * shape.scaleY())
    const clampedWidth = Math.min(canvasWidth, width)
    const clampedHeight = Math.min(canvasHeight, height)
    shape.position({
      x: Math.max(0, Math.min(shape.x(), canvasWidth - clampedWidth)),
      y: Math.max(0, Math.min(shape.y(), canvasHeight - clampedHeight)),
    })
    shape.size({ width: clampedWidth, height: clampedHeight })
    shape.scale({ x: 1, y: 1 })
  }

  function emitTransform(
    selected: Exclude<Selection, null>,
    shape: KonvaRectNode
  ) {
    const transform = {
      left: shape.x(),
      top: shape.y(),
      width: shape.width(),
      height: shape.height(),
      canvasWidth,
      canvasHeight,
    }
    if (selected.kind === "image") {
      onImageTransform(selected.index, transform)
    } else {
      onTextTransform(selected.index, transform)
    }
  }

  function nudgeSelected(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!selection || !event.key.startsWith("Arrow")) return
    const shape =
      selection.kind === "image"
        ? imageRefs.current[selection.index]
        : textRefs.current[selection.index]
    if (!shape) return
    event.preventDefault()
    const amount = event.shiftKey ? 10 : 1
    if (event.key === "ArrowLeft") shape.x(shape.x() - amount)
    if (event.key === "ArrowRight") shape.x(shape.x() + amount)
    if (event.key === "ArrowUp") shape.y(shape.y() - amount)
    if (event.key === "ArrowDown") shape.y(shape.y() + amount)
    clampShape(shape, selection.kind === "image" ? 20 : 1)
    emitTransform(selection, shape)
    shape.getLayer()?.batchDraw()
  }

  function selectableRect(
    kind: "text" | "image",
    target: SlideshowTextBounds | SlideshowImageBounds,
    index: number
  ) {
    const selected =
      kind === "image"
        ? selectedImageIndex === index
        : selectedTextIndex === index && selectedImageIndex === null
    const select = () => {
      rootRef.current?.focus()
      if (kind === "image") onSelectImage(index)
      else onSelectText(index)
    }
    return (
      <Rect
        key={`${kind}-${target.id}`}
        ref={(node) => {
          if (kind === "image") imageRefs.current[index] = node
          else textRefs.current[index] = node
        }}
        x={target.left}
        y={target.top}
        width={target.width}
        height={target.height}
        fill="rgba(79,145,255,0.001)"
        stroke={selected ? "#4f91ff" : "rgba(79,145,255,0)"}
        strokeWidth={selected ? 0.8 : 0}
        strokeScaleEnabled={false}
        draggable
        perfectDrawEnabled={false}
        onMouseDown={(event) => {
          event.cancelBubble = true
          select()
        }}
        onTap={(event) => {
          event.cancelBubble = true
          select()
        }}
        onDragMove={(event) =>
          clampShape(event.target as KonvaRectNode, kind === "image" ? 20 : 1)
        }
        onDragEnd={(event) => {
          const shape = event.target as KonvaRectNode
          clampShape(shape, kind === "image" ? 20 : 1)
          emitTransform({ kind, index }, shape)
          select()
        }}
        onTransformEnd={(event) => {
          const shape = event.target as KonvaRectNode
          clampShape(shape, kind === "image" ? 20 : 1)
          emitTransform({ kind, index }, shape)
          select()
        }}
      />
    )
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-10 outline-none focus-visible:ring-2 focus-visible:ring-[#4f91ff] focus-visible:ring-inset"
      tabIndex={0}
      role="application"
      aria-label="Canvas layer editor. Select, drag, resize, or use arrow keys to move image and text layers."
      data-canvas-engine="konva"
      data-slideshow-text-editor="konva-canvas"
      data-slideshow-layer-editor="konva-canvas"
      onKeyDown={nudgeSelected}
    >
      <Stage
        width={displayWidth}
        height={displayHeight}
        scaleX={scaleX}
        scaleY={scaleY}
        onMouseDown={(event: KonvaEventObject<MouseEvent>) => {
          if (event.target === event.target.getStage()) onClearSelection()
        }}
        onTouchStart={(event: KonvaEventObject<TouchEvent>) => {
          if (event.target === event.target.getStage()) onClearSelection()
        }}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      >
        <Layer>
          {imageBounds.map((target, index) =>
            selectableRect("image", target, index)
          )}
          {textBounds.map((target, index) =>
            selectableRect("text", target, index)
          )}
          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            flipEnabled={false}
            borderDash={[4, 3]}
            borderStroke="#4f91ff"
            borderStrokeWidth={0.8}
            anchorFill="#4f91ff"
            anchorStroke="#ffffff"
            anchorStrokeWidth={0.8}
            anchorSize={5}
            anchorCornerRadius={1}
            boundBoxFunc={(oldBox, nextBox) =>
              nextBox.width >= 20 && nextBox.height >= 20 ? nextBox : oldBox
            }
          />
        </Layer>
      </Stage>
    </div>
  )
}
