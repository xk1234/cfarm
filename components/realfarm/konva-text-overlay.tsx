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

import type { SlideshowTextBounds } from "@/lib/slideshow-renderer"

export type KonvaTextTransform = {
  left: number
  top: number
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
}

export function KonvaTextOverlay({
  bounds,
  canvasWidth,
  canvasHeight,
  displayWidth,
  displayHeight,
  selectedTextIndex,
  onSelectText,
  onClearTextSelection,
  onTextTransform,
}: {
  bounds: SlideshowTextBounds[]
  canvasWidth: number
  canvasHeight: number
  displayWidth: number
  displayHeight: number
  selectedTextIndex: number | null
  onSelectText: (index: number) => void
  onClearTextSelection: () => void
  onTextTransform: (index: number, transform: KonvaTextTransform) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const transformerRef = useRef<KonvaTransformerNode | null>(null)
  const shapeRefs = useRef<Array<KonvaRectNode | null>>([])
  const scaleX = displayWidth / canvasWidth
  const scaleY = displayHeight / canvasHeight

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const selectedShape =
      selectedTextIndex === null ? null : shapeRefs.current[selectedTextIndex]
    transformer.nodes(selectedShape ? [selectedShape] : [])
    transformer.getLayer()?.batchDraw()
  }, [bounds.length, selectedTextIndex])

  function clampShape(shape: KonvaRectNode) {
    const width = Math.max(24, shape.width() * shape.scaleX())
    const height = Math.max(1, shape.height() * shape.scaleY())
    const clampedWidth = Math.min(canvasWidth, width)
    const clampedHeight = Math.min(canvasHeight, height)
    const clampedX = Math.max(
      0,
      Math.min(shape.x(), canvasWidth - clampedWidth)
    )
    const clampedY = Math.max(
      0,
      Math.min(shape.y(), canvasHeight - clampedHeight)
    )

    shape.position({ x: clampedX, y: clampedY })
    shape.size({ width: clampedWidth, height: clampedHeight })
    shape.scale({ x: 1, y: 1 })
  }

  function emitTransform(index: number, shape: KonvaRectNode) {
    onTextTransform(index, {
      left: shape.x(),
      top: shape.y(),
      width: shape.width(),
      height: shape.height(),
      canvasWidth,
      canvasHeight,
    })
  }

  function nudgeSelected(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (selectedTextIndex === null || !event.key.startsWith("Arrow")) return
    const shape = shapeRefs.current[selectedTextIndex]
    if (!shape) return
    event.preventDefault()
    const amount = event.shiftKey ? 10 : 1
    if (event.key === "ArrowLeft") shape.x(shape.x() - amount)
    if (event.key === "ArrowRight") shape.x(shape.x() + amount)
    if (event.key === "ArrowUp") shape.y(shape.y() - amount)
    if (event.key === "ArrowDown") shape.y(shape.y() + amount)
    clampShape(shape)
    emitTransform(selectedTextIndex, shape)
    shape.getLayer()?.batchDraw()
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-10 outline-none focus-visible:ring-2 focus-visible:ring-[#4f91ff] focus-visible:ring-inset"
      tabIndex={0}
      role="application"
      aria-label="Canvas text editor. Select and drag text, use the side handles to resize, or use the arrow keys to move it."
      data-canvas-engine="konva"
      data-slideshow-text-editor="konva-canvas"
      onKeyDown={nudgeSelected}
    >
      <Stage
        width={displayWidth}
        height={displayHeight}
        scaleX={scaleX}
        scaleY={scaleY}
        onMouseDown={(event: KonvaEventObject<MouseEvent>) => {
          if (event.target === event.target.getStage()) {
            onClearTextSelection()
          }
        }}
        onTouchStart={(event: KonvaEventObject<TouchEvent>) => {
          if (event.target === event.target.getStage()) {
            onClearTextSelection()
          }
        }}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      >
        <Layer>
          {bounds.map((target, index) => {
            const selected = selectedTextIndex === index
            return (
              <Rect
                key={target.id}
                ref={(node) => {
                  shapeRefs.current[index] = node
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
                  rootRef.current?.focus()
                  onSelectText(index)
                }}
                onTap={(event) => {
                  event.cancelBubble = true
                  rootRef.current?.focus()
                  onSelectText(index)
                }}
                onDragMove={(event) => {
                  clampShape(event.target as KonvaRectNode)
                }}
                onDragEnd={(event) => {
                  const shape = event.target as KonvaRectNode
                  clampShape(shape)
                  emitTransform(index, shape)
                  onSelectText(index)
                }}
                onTransformEnd={(event) => {
                  const shape = event.target as KonvaRectNode
                  clampShape(shape)
                  emitTransform(index, shape)
                  onSelectText(index)
                }}
              />
            )
          })}
          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            flipEnabled={false}
            enabledAnchors={["middle-left", "middle-right"]}
            borderDash={[4, 3]}
            borderStroke="#4f91ff"
            borderStrokeWidth={0.8}
            anchorFill="#4f91ff"
            anchorStroke="#ffffff"
            anchorStrokeWidth={0.8}
            anchorSize={5}
            anchorCornerRadius={1}
            boundBoxFunc={(oldBox, nextBox) =>
              nextBox.width >= 24 ? nextBox : oldBox
            }
          />
        </Layer>
      </Stage>
    </div>
  )
}
