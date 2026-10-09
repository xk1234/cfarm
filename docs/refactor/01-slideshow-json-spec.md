# 01: Slideshow JSON Spec v1 and the render engine

Status: proposal for owner review. Branch base: `refactor/base` (b853662).
Scope: the declarative spec that fully drives slideshow/carousel rendering, the
single render engine that consumes it, the render API contract, and the file
plan for the engine. Backend storage (Appwrite) and publishing/scheduling are
covered only where the spec touches them.

> **AGENTS.md note:** the "Workflow run viewer layout" contract
> (`docs/reference/workflow-inspector-design-contract.md`) is written for multi-stage
> automation runs (stages, `Input | Result`, `Run step`, execution traces).
> Without automations, a render has no stages: it is spec + slot values → PNGs.
> Once automations are deleted that contract no longer applies. AGENTS.md should
> drop it and use a small "render viewer" contract instead: header with back
> link, status and actions (`Render`, `Download`, `Publish`), then slide strip,
> then the selected slide, then a collapsed `Spec JSON` disclosure. The shared
> `Button`/`IconButton`/`Tabs` primitives rule still applies. The Railway
> Postgres section of AGENTS.md also has to be rewritten for Appwrite.

---

## 0. TL;DR of decisions

1. **A spec is the only input to rendering.** Canvas, every layer, every
   position and every style are explicit JSON. The engine has no hidden
   heuristics: no auto-stacking, no ×4 font scale, no safe-margin clamps, no
   `textStyle` enum.
2. **Templates are specs with slots.** `{"slot":"hero"}` fills an image source
   or value, and `"{{title}}"` interpolates into text. A `list` slot plus
   `repeat` gives variable-length carousels. Resolving a template with slot
   values produces a **ResolvedSpec**, which has no slots left. The renderer
   accepts only ResolvedSpecs.
3. **The pipeline is `resolve → validate → layout → paint`.** Layout is pure
   TypeScript and depends only on a `TextMeasurer` interface. It produces a
   renderer-neutral **DisplayList**. Painting is a thin adapter.
4. **One engine: Fabric.js 7 painting a display list.** The server uses
   `fabric/node` with node-canvas 3.2.3, which runs on Railway today. The
   browser preview uses the same `lib/render` module with Fabric's browser
   build. The react-konva preview is deleted. Server PNGs are authoritative.
5. **Validation uses zod v4.** `z.toJSONSchema()` exports the schema for
   OpenAPI, MCP and the paste-JSON UI. Errors are structured
   `{code, path (JSON Pointer), message}` lists, with a separate warnings list.
6. **Outputs:** one PNG per slide (JPEG/WebP optional), a ZIP, and an optional
   PDF. Video, transitions and sound are removed from rendering. Sound moves to
   publish parameters.

---

## 1. Current pipeline, end to end (as of b853662)

```
automation-runner / MCP render protocol
  └─ lib/slideshows.ts  (record normalize, asset staging, materializeSlideImage / renderOneStagedSlideshowSlide)
       ├─ stage assets → scratch dir → data: URIs   (source, overlayImage, icon images)
       ├─ lib/font-config.ts configureFontconfig()  (writes fonts.conf → FONTCONFIG_FILE, Inter only)
       └─ lib/slideshow-raster-renderer.ts renderSlideshowSlideBuffers()
            ├─ registerFont(Inter-Variable.ttf)
            ├─ lib/slideshow-renderer.ts slideshowFabricScene()   ← all geometry/heuristics live here
            ├─ lib/slideshow-fabric-canvas.ts populateSlideshowFabricCanvas()  (Rect/Ellipse/FabricText/FabricImage)
            └─ fabric/node StaticCanvas → toSVG() + toDataURL(png)
  → writes slide-NNN.svg + slide-NNN.png → Railway bucket → record.output_images[]

Browser preview: components/realfarm/fabric-slideshow-canvas.tsx
  builds the same slideshowFabricScene() but paints it with **react-konva** (a second rasterizer),
  plus Transformer-based drag/resize editing (renderedTextItemEditorBounds).

Public: app/api/public/slideshows/[id]/slides/[index]  → streams stored PNG (signed share token)
        app/api/public/slideshows/[id]/download        → zips stored PNGs (JSZip)
Client: lib/slideshow-export.ts → client-side ZIP of slide PNGs
Worker copy: appwrite/functions/job-worker/src/slideshow-*.js are *generated* copies — already drifted
        (worker has a 16-family font registry + resolveSlideshowFontWeight; lib/ does not).
```

### 1.1 Capability inventory (what actually renders today)

| Area | Current behaviour | Source |
|---|---|---|
| Canvas | Width fixed at 1080. Height comes from the aspect string `W:H`. Allowed ratios are `9:16`, `4:5`, `3:4`, `3:2` and `1:1`; bad input falls back to 1080×1920. One ratio applies to the whole slideshow. | `slideDimensions` |
| Background | Fabric scene `backgroundColor` is hard-coded to `#111111`. `settings.background_color` is **ignored**. | `slideshowFabricScene` |
| Base image | Full-bleed `cover` around a centre focal point. `imageFit` (`cover/contain/fit`) is written by the runner but **ignored** by the renderer and dropped by `normalizeSlide`. There is no focal point or zoom. | renderer, `slideshows.ts` |
| Dark overlay | `overlay: true` draws a black rect at fixed 0.2 opacity. | `slideshowOverlayOpacity` |
| Overlay image | A second image at 16:9, centred horizontally, top at `0.5H − 0.42h`, width `(100−2·padding)%` (padding clamped 0..40, min width 20%), `cover`, clipped to its frame. | `overlayImageFrame` |
| Oval-icons layout | Cream bg `#f6f1e8`, an ellipse (rx .372W, ry .318H, stroke 7), 4–8 rotated rounded "cards" (rx .22 size, stroke 5) holding `contain` icons, and a focal card. Placement comes from a seeded random generator. | `slideshow-oval-icons.ts`, renderer |
| Image grids | `imageGrid: 2x2 / 1x2 / 1x3` is accepted by MCP and UI but **never rendered**. Only `oval-icons` renders. | `lumenclip-server.ts:280` |
| Text boxes | `fontSize "Npx"` → px = clamp(N×4, 32, 96). Width is a % of W (10..100). x/y are % positions with safe-margin clamps (`padded` 10% / `flush` 1.5% horizontally; `padded` 16% / `flush` 5% vertically). `textPlacement` top/center/bottom maps to fixed y values. | `prepareRenderedTextItem`, `textItemX/Y` |
| Wrapping | Heuristic width units: Latin 0.55em, other >U+00FF 1.2em, CJK 1em. Long CJK tokens are split per character. **No real font metrics.** | `wrapText`, `textDisplayUnits` |
| Line height | Fixed 1.12. One Fabric text object per line, `originY: center`. | |
| Weight | Always 800. | |
| Colour styles | An enum `textStyle`. Fills in practice: yellow `#fff176`; `#111` for black text and white background; everything else white. Light Pink, Muted Red and Navy Blue appear in the editor but **render white**. The White 50% background **renders white-on-white**, while the editor helper says `#111`. | `textFill` vs `textFillColor` |
| Stroke | `outline` style only. Width `max(6, 0.13·fs)`, `rgba(0,0,0,.88)`, painted under the fill. | |
| Background box | Per-line rounded pill. Padding .28em × .10em, radius `max(3, .06fs)`. White at 1.0, "50%" at .56, black at .9. | `fabricTextLayers` |
| Auto-stacking | Text items that share a placement or y and overlap horizontally are restacked vertically with gap `max(20, 1.1·minFs)`. | `stackedTextGroup` |
| Fonts | `resolveSlideshowFont` maps **every** family except generic CSS names to Inter. The editor's "Bebas Neue / Elegance" options and the legacy "TikTok Display Medium" therefore all render as Inter. 21 font files (the PIN set from 70a6ca7) sit in `appwrite/functions/job-worker/assets/fonts/` but are unused by `lib/`. | `slideshow-font-family.ts` |
| Emphasis / rich text | None. There are no per-word styles. | |
| Shadow, letter-spacing, gradients, filters, rotation of text | None. Rotation exists only on icon cards. | |
| Outputs | Per-slide PNG plus an SVG with embedded data-URI images. Optional video via Rendi/ffmpeg (duration, transition, sound). ZIP is built client-side and by the public download route. | |
| Legacy SVG builder | `renderedSlideSvg` is a second, divergent string-SVG renderer. Only tests use it. | |

The JSON spec makes every row above explicit. It also fixes the "silently
ignored" bugs: `imageFit`, `background_color`, colours and fonts.

---

## 2. Spec design

### 2.1 Principles

- **Coordinate space:** pixels in canvas space (default canvas width 1080).
  Any length may instead be a percentage string `"50%"`. Percentages resolve
  against the **parent box**: width for x/width/insets-left-right, height for
  y/height. Font sizes and stroke widths are always px.
- **z-order:** array order, so later layers draw on top. An optional integer
  `z` overrides order within the same parent with a stable sort.
- **Nothing implicit:** no safe margins, no auto-restacking, no clamps beyond
  schema limits. Templates provide good defaults. The engine does not.
- **Renderer-agnostic:** the spec describes appearance, not Fabric objects.
  Anything Fabric cannot do deterministically on both node-canvas and browser
  canvas stays out of v1 (for example CSS blend filters and blur on text).
- **Deterministic:** the same ResolvedSpec, engine version, font files and
  asset bytes give the same PNG bytes. Randomness (such as picking from a
  collection) happens only at resolve time with an explicit seed, and the pick
  is recorded in the ResolvedSpec.

### 2.2 TypeScript type sketch (`lib/render/spec/types.ts`)

```ts
// ───────── primitives ─────────
export type Pct = `${number}%`
export type Length = number | Pct                    // px or % of parent box
export type TokenRef = `$${string}`                  // "$colors.accent" → theme lookup
export type ColorValue = string                      // #rgb #rrggbb #rrggbbaa rgb()/rgba() | TokenRef
export type SlotRef = { slot: string }               // "hero", "item.image", "item.title"
export type Valued<T> = T | SlotRef                  // any scalar can be slot-bound

export type Anchor =
  | "top-left" | "top" | "top-right"
  | "left" | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right"

export type Paint =
  | ColorValue
  | { type: "linear"; angle: number /* deg, 0 = left→right */; stops: { offset: number; color: ColorValue }[] }
  | { type: "radial"; stops: { offset: number; color: ColorValue }[]; center?: { x: number; y: number } /* 0..1 */ }

export type Stroke = { color: Valued<ColorValue>; width: number; join?: "miter" | "round" | "bevel" }
export type Shadow = { color: ColorValue; blur: number; offsetX?: number; offsetY?: number }

/** A layer's box inside its parent box. Either insets OR anchor-positioned. */
export type Frame = {
  inset?: Length | [Length, Length, Length, Length]   // top,right,bottom,left; inset:0 = full-bleed
  x?: Length                                          // position of the *anchor point* of the box
  y?: Length
  width?: Length | "auto"                             // "auto" only valid for text (shrink-wrap)
  height?: Length | "auto"                            // "auto" = content height (text) / intrinsic aspect (image)
  anchor?: Anchor                                     // default "top-left"
}

// ───────── document ─────────
export type SlideshowSpec = {
  $schema?: string
  version: 1
  id?: string
  name?: string
  description?: string
  canvas: Canvas
  fonts?: FontRef[]                     // fonts this spec uses; validated against registry / loaded from url
  theme?: Theme
  defaults?: { text?: TextStyle; image?: Partial<ImageProps> }
  slots?: Record<string, SlotDef>      // present only in templates
  slides: SlideEntry[]                  // 1..35 after repeat expansion
  meta?: Record<string, unknown>        // opaque, round-tripped, never rendered
}

export type Canvas = {
  preset?: "9:16" | "4:5" | "1:1" | "3:4" | "3:2" | "16:9"   // width 1080, height derived
  width?: number                        // 320..2160 (overrides preset)
  height?: number                       // 320..3840
  background?: Valued<Paint>            // default "#000000"
}

export type FontRef = {
  family: string                        // must exist in registry, or url must be given
  url?: string                          // https TTF/OTF (not WOFF2 – Pango can't load it)
  weights?: number[]                    // informational; validated against faces
}

export type Theme = {
  colors?: Record<string, string>
  fonts?: Record<string, string>        // "$fonts.heading"
  textStyles?: Record<string, TextStyle> // referenced by name from TextLayer.style
}

// ───────── slots (templates) ─────────
export type SlotDef =
  | { type: "image"; label?: string; required?: boolean; default?: ImageSource; minWidth?: number; minHeight?: number }
  | { type: "text"; label?: string; required?: boolean; default?: string; maxLength?: number; multiline?: boolean }
  | { type: "color"; label?: string; required?: boolean; default?: string }
  | { type: "number"; label?: string; required?: boolean; default?: number; min?: number; max?: number }
  | { type: "boolean"; label?: string; default?: boolean }
  | { type: "list"; label?: string; minItems?: number; maxItems?: number; item: Record<string, Exclude<SlotDef, { type: "list" }>> }

export type ImageSource =
  | { url: string }                     // https only; fetched server-side with SSRF guard
  | { asset: string }                   // Appwrite Storage file id in the caller's assets bucket
  | { collection: string; pick?: "first" | "random" | number; seed?: string } // resolved → {asset} at resolve time

export type SlotValues = Record<string, unknown>   // validated against slots; images accept ImageSource | url string

// ───────── slides ─────────
export type Slide = {
  id: string                            // may interpolate: "item-{{index1}}"
  name?: string
  if?: Condition                        // omit slide when falsy (e.g. optional CTA)
  background?: Valued<Paint>            // overrides canvas.background
  layers: LayerEntry[]
}
export type SlideRepeat = { repeat: { slot: string; as?: string /* default "item" */ }; slide: Slide }
export type SlideEntry = Slide | SlideRepeat

export type Condition = SlotRef | { not: SlotRef } | boolean

// ───────── layers ─────────
type LayerBase = {
  id: string
  name?: string
  frame?: Frame                         // required unless parent group has stack/grid layout
  opacity?: Valued<number>              // 0..1
  rotation?: number                     // deg, about the frame centre
  z?: number
  if?: Condition
  shadow?: Shadow                       // drop shadow of the whole layer (not text glyph shadow)
}

export type ImageProps = {
  src: ImageSource | SlotRef
  fit?: "cover" | "contain" | "fill" | "none"        // default cover
  focal?: { x: number; y: number }                   // 0..1, default .5/.5 — which part of the source stays in view on cover
  zoom?: number                                      // ≥1, extra scale about focal point
  cornerRadius?: Length
  clip?: "rect" | "ellipse"
  border?: Stroke
  backdrop?: Paint                                   // fills letterbox area when fit=contain
  filters?: {
    brightness?: number                              // -1..1
    contrast?: number                                // -1..1
    saturation?: number                              // -1..1
    grayscale?: boolean
    blur?: number                                    // 0..1 (Fabric Blur filter scale)
    tint?: { color: ColorValue; opacity: number }
  }
  flipX?: boolean
  flipY?: boolean
}
export type ImageLayer = LayerBase & { type: "image" } & ImageProps

export type TextLayer = LayerBase & {
  type: "text"
  text: Valued<string> | Span[]         // string supports {{slot}} interpolation
  markup?: "none" | "emphasis"          // "emphasis": *word* → emphasisStyle; \* escapes
  style?: string | TextStyle | [string, TextStyle] // named theme style, inline, or named+overrides
  emphasisStyle?: Partial<TextStyle>
}
export type Span = { text: Valued<string>; style?: Partial<TextStyle> }

export type TextStyle = {
  fontFamily?: string                   // or "$fonts.heading"
  fontWeight?: number                   // 100..900; must exist for family (or synthesized? no – error)
  fontStyle?: "normal" | "italic"
  fontSize?: number | { min: number; max: number }   // range = auto-fit (largest that fits box & maxLines)
  color?: Valued<Paint>                 // solid or gradient fill
  align?: "left" | "center" | "right" | "justify"
  verticalAlign?: "top" | "middle" | "bottom"        // within frame height when height is fixed
  lineHeight?: number                   // multiplier, default 1.15
  letterSpacing?: number                // px, default 0
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"
  stroke?: Stroke                       // painted *under* fill (paint-order: stroke)
  shadow?: Shadow                       // glyph shadow
  background?: {
    mode: "lines" | "block"             // lines = per-line pill (current TikTok look); block = one box
    color: Valued<ColorValue>
    opacity?: number
    paddingX?: number                   // px, default .28em
    paddingY?: number                   // px, default .10em
    radius?: number                     // px
  }
  maxLines?: number
  overflow?: "shrink" | "ellipsis" | "clip" | "error" // default "shrink" when fontSize is a range, else "error"
  wrap?: "word" | "char" | "none"       // "word" auto-falls back to char for CJK runs
  underline?: boolean
}

export type ShapeLayer = LayerBase & {
  type: "shape"
  shape: "rect" | "ellipse" | "line"    // line: from frame top-left to bottom-right
  fill?: Valued<Paint>
  stroke?: Stroke
  cornerRadius?: Length
}

export type GroupLayer = LayerBase & {
  type: "group"
  layout?:
    | { type: "absolute" }                                                   // default
    | { type: "stack"; direction: "vertical" | "horizontal"; gap?: Length;
        align?: "start" | "center" | "end" | "stretch";
        justify?: "start" | "center" | "end" | "space-between" }
    | { type: "grid"; columns: number; rows?: number; gap?: Length; cellAspect?: number }
  clip?: boolean                        // clip children to group frame (+cornerRadius)
  cornerRadius?: Length
  background?: Paint
  padding?: Length | [Length, Length, Length, Length]
  children: LayerEntry[]
}

export type LayerRepeat = { repeat: { slot: string; as?: string }; layer: Layer }
export type Layer = ImageLayer | TextLayer | ShapeLayer | GroupLayer
export type LayerEntry = Layer | LayerRepeat

// ───────── resolved / engine-facing ─────────
/** No slots, no repeats, no tokens, no named styles, all defaults merged, all ImageSources = {asset}|{url}. */
export type ResolvedSpec = Omit<SlideshowSpec, "slots" | "slides" | "theme"> & { slides: ResolvedSlide[] }
export type ResolvedSlide = Omit<Slide, "if"> & { layers: Layer[] }   // Layer with only literal values
```

**Built-in interpolation variables**, available in any string after repeat
expansion:
- `{{index}}` and `{{index1}}`: the repeat iteration, 0-based and 1-based.
- `{{slideIndex1}}` and `{{slideCount}}`: the final slide position and total.
  Use them for "2/7" page indicators.
- `{{item.<field>}}`: list item fields. The prefix follows `repeat.as`.

Write `{{{{` for a literal `{{`.

**Icons and stickers** are image layers with `fit: "contain"`. SVG sources are
allowed: node-canvas renders them through librsvg, and the browser natively. A
"sticker card" is a group holding a rounded rect and an image. No separate
icon type exists, because it would add nothing.

### 2.3 Layout semantics (normative)

- **Frame:** with `inset`, box = parent box shrunk by the insets. Otherwise the
  box's anchor point is placed at `(x, y)` in the parent. For example,
  `anchor: "bottom"` puts the bottom-centre of the box at (x, y). Missing
  `width`/`height` default to 100% of the parent, except text height, which
  defaults to `"auto"`.
- **Text:**
  1. Interpolate the text and apply `textTransform`.
  2. Split it into styled runs (spans and emphasis).
  3. Wrap greedily by measured advance width plus `letterSpacing` against the
     box width minus 2×`background.paddingX` when `mode: "lines"`.
  4. If `fontSize` is a range, binary-search integer px from max down to min
     until both the line count (≤ `maxLines`) and the height fit.
  5. If it still overflows, apply `overflow`. `"shrink"` below min becomes a
     warning plus a clip, and `"error"` fails the render.
  6. Height `"auto"` makes the box height equal the text height and
     re-applies the anchor.
  7. Line boxes use `lineHeight × fontSize`. The first baseline sits at
     `ascent` scaled to the line box.
  8. Alignment works per line. `justify` does not stretch the last line.
- **Stack group:** children laid out in sequence. A child's `frame.x/y` is
  ignored. `width/height` are honoured, and `"auto"` text heights are measured
  first. The group's own height may be `"auto"`, so a stack of title and body
  can be anchored `bottom` and grow upward. This replaces today's
  auto-stacking heuristic.
- **Grid group:** cells are `(W − (cols−1)·gap)/cols` wide. Children fill
  cells in row-major order and their frames are ignored. Use `cellAspect` when
  `rows` is omitted.
- **Image fit:** `cover` scales by `max(bw/iw, bh/ih)·zoom` and offsets so the
  `focal` point sits as close to the box centre as the crop allows. `contain`
  uses min, centres, and fills the letterbox with `backdrop`. `fill` stretches.
  `none` uses scale 1. The image is always clipped to its box, so it never
  bleeds out the way today's unclipped base image could.

### 2.4 Template vs instance

```
Template (SlideshowSpec with slots)  +  SlotValues
        │ resolve()  — lib/render/spec/resolve.ts
        │   1. validate SlotValues against slots (required, maxLength, list bounds, types)
        │   2. apply slot defaults
        │   3. expand slide/layer repeats over list slots (→ ids made unique: "<id>~<n>")
        │   4. drop entries whose `if` is falsy
        │   5. interpolate {{…}} and replace {slot} refs
        │   6. resolve ImageSource.collection → {asset} (seeded); url strings → {url}
        │   7. resolve $tokens and named textStyles; merge defaults.text → each TextStyle
        │   8. compute slideIndex1/slideCount and interpolate them last
        ▼
ResolvedSpec  (pure data, no slots — stored on the render record, re-renderable forever)
        │ render()
        ▼
PNG per slide (+ zip/pdf)
```

- A spec without `slots` is already an instance. Pasted raw JSON, either fully
  literal or a template plus slot values, goes through the same path.
- A **template** is stored once (`templates` table). A **render** stores
  `templateId?`, `slotValues`, the full `resolvedSpec`, `renderHash` and
  outputs. Re-rendering a historical render uses its stored ResolvedSpec and
  never re-resolves against an edited template.
- The visual UI reads `slots` to build the form. Image slots open the picker
  (uploads, collections, Pexels, Pinterest). Text, colour and number slots
  become plain inputs. List slots get add, remove and reorder controls. These
  are form fields over slot values, not a canvas editor.

### 2.5 Validation and error reporting

Validation runs in three passes:

1. **Structural (zod):** `SlideshowSpecSchema.safeParse`. zod issues map to
   `{code: "schema.<zodcode>", path: JSON Pointer, message}`.
2. **Semantic (template level):**
   - layer ids are unique per slide
   - every `{slot}` and `{{var}}` refers to a declared slot or builtin
     (`slot.unknown`)
   - `repeat.slot` is a list slot (`repeat.not_list`)
   - fonts exist in the registry or carry a `url`, and the weight exists
     (`font.unknown`, `font.weight_unavailable`)
   - token refs resolve (`token.unknown`)
   - grid and stack children carry no frames, which is only a warning
   - nesting depth is at most 4 (`limits.depth`)
3. **Instance (after resolve and before or during layout):**
   - missing required slot (`slot.required`)
   - wrong slot type (`slot.type`)
   - list too short or long (`slot.list_bounds`)
   - text over `maxLength` (`slot.max_length`)
   - more than 35 slides after expansion (`limits.slides`)
   - image fetch failed or not an image (`asset.fetch_failed`,
     `asset.unsupported_type`)
   - image over 25 MB or 50 MP (`asset.too_large`)
   - text that cannot fit with `overflow: "error"` (`text.overflow`)

Warnings never fail a render:
- `text.shrunk_below_min`
- `asset.upscaled` (scale above 2× on cover)
- `asset.below_min_size`
- `font.fallback_glyphs` (characters missing from the family, such as emoji
  or CJK)

Response shape, used by the API, MCP and UI:

```json
{
  "ok": false,
  "errors": [
    { "code": "slot.required", "path": "/slotValues/hookImage", "message": "Slot \"hookImage\" (image) is required." },
    { "code": "schema.invalid_type", "path": "/slides/1/slide/layers/2/frame/width", "message": "Expected a number or a percentage string like \"84%\"." }
  ],
  "warnings": [
    { "code": "text.shrunk_below_min", "path": "/slides/0/layers/2", "slide": 0, "message": "Text clipped at 56px; 5 lines exceed maxLines 4." }
  ]
}
```

Paths point into the **template** for template errors and into
`slotValues` for value errors. For layout warnings the path points into the
ResolvedSpec and adds `slide`, the index after expansion. The JSON Schema
(`z.toJSONSchema`) is published at `/api/v1/schema/slideshow-spec` and
`public/schemas/slideshow-spec-v1.json`, so external tools and agents can
validate offline.

**Hard limits in v1:**
- spec ≤ 256 KB
- ≤ 35 slides (TikTok photo-mode max)
- ≤ 64 layers per slide (after repeat)
- depth ≤ 4
- canvas between 320 and 2160 wide and at most 3840 tall
- ≤ 16 fonts per spec
- ≤ 80 distinct image assets per render

### 2.6 Engine choice: Fabric 7 everywhere

The engine is the existing Fabric raster path, rewritten to paint a
**DisplayList**. It serves server rendering and the browser preview.

- **It is proven in production.** `fabric/node` with node-canvas 3.2.3 and
  fontconfig already renders on Railway (Alpine), including registered TTF/OTF
  faces.
- **It runs in both places.** `fabric` (browser) and `fabric/node` share one
  API, so `lib/render/paint/fabric-painter.ts` is literally the same code. Konva
  can also run under node, but only through the same node-canvas, and it lacks
  the Fabric filter stack. Two painters (Konva in the browser, Fabric on the
  server) is exactly how today's drift between preview and output arises.
- **It covers v1:** rect, ellipse, line, gradients, clipPath (rect, ellipse,
  rounded), image filters (Brightness, Contrast, Saturation, Grayscale, Blur,
  BlendColor), shadows, `paintFirst: "stroke"` for outlined text, and
  `charSpacing`.
- **Fabric's text layout is not used.** Fabric `Textbox` wrapping and
  auto-fit is not controllable enough for `maxLines`, auto-fit, per-line
  backgrounds and CJK fallback. `lib/render/layout` therefore measures through
  a `TextMeasurer` (`ctx.measureText` on node-canvas or the browser canvas),
  emits absolutely positioned **runs**, and the painter draws each run as a
  `FabricText`. This is today's per-line approach, but with real metrics.
- **Rejected alternatives:**
  - *Satori + resvg:* flexbox is nice, but there are no image filters,
    stroke-under-fill text needs hacks, it is an SVG round-trip, and per-glyph
    measurement differs from canvas.
  - *Raw Canvas2D painter:* possible later. node-canvas lacks `ctx.filter`, so
    filters would need reimplementing.
  - *Headless Chrome:* heavy on Railway.
- **Authority:** the server PNG is the truth. The browser preview loads the
  same font files through `FontFace` from `/api/fonts/<file>` and runs the same
  layout. Sub-pixel metric differences between Pango and browser shaping can
  rarely move a line break, which is acceptable for a preview. A
  `POST /api/v1/renders/preview` single-slide PNG endpoint backs the
  "exact preview" toggle and parity tests.
- **SVG output is dropped.** Today's `canvas.toSVG()` embeds data-URI images
  and nothing consumes it.

---

## 3. Example specs

### 3.1 Hook + listicle carousel (template, renders 4 slides with 2 items)

```json
{
  "$schema": "https://lumenclip.app/schemas/slideshow-spec-v1.json",
  "version": 1,
  "name": "Listicle: full-bleed photo + captions",
  "canvas": { "preset": "9:16", "background": "#111111" },
  "fonts": [{ "family": "Inter" }],
  "theme": {
    "colors": { "accent": "#FFF176", "ink": "#111111", "paper": "#FFFFFF" },
    "textStyles": {
      "hook": {
        "fontFamily": "Inter", "fontWeight": 800,
        "fontSize": { "min": 56, "max": 92 },
        "color": "$colors.paper", "align": "center", "lineHeight": 1.12,
        "stroke": { "color": "rgba(0,0,0,0.88)", "width": 12, "join": "round" },
        "maxLines": 4, "overflow": "shrink"
      },
      "itemTitle": {
        "fontFamily": "Inter", "fontWeight": 800,
        "fontSize": { "min": 44, "max": 64 },
        "color": "$colors.ink", "align": "left", "lineHeight": 1.15,
        "background": { "mode": "lines", "color": "$colors.paper", "opacity": 1, "paddingX": 16, "paddingY": 6, "radius": 6 },
        "maxLines": 3, "overflow": "shrink"
      },
      "itemBody": {
        "fontFamily": "Inter", "fontWeight": 600, "fontSize": { "min": 32, "max": 40 },
        "color": "$colors.paper", "align": "left", "lineHeight": 1.25,
        "background": { "mode": "block", "color": "#000000", "opacity": 0.56, "paddingX": 20, "paddingY": 14, "radius": 12 },
        "maxLines": 5, "overflow": "ellipsis"
      }
    }
  },
  "slots": {
    "hook": { "type": "text", "label": "Hook", "required": true, "maxLength": 140 },
    "hookImage": { "type": "image", "label": "Hook photo", "required": true, "minWidth": 720 },
    "items": {
      "type": "list", "label": "List items", "minItems": 1, "maxItems": 8,
      "item": {
        "title": { "type": "text", "required": true, "maxLength": 70 },
        "body": { "type": "text", "maxLength": 180 },
        "image": { "type": "image", "required": true }
      }
    },
    "cta": { "type": "text", "label": "Closing line", "default": "Save this for later" },
    "ctaImage": { "type": "image", "label": "Closing photo" }
  },
  "slides": [
    {
      "id": "hook",
      "layers": [
        { "id": "photo", "type": "image", "src": { "slot": "hookImage" }, "frame": { "inset": 0 }, "fit": "cover" },
        { "id": "scrim", "type": "shape", "shape": "rect", "frame": { "inset": 0 }, "fill": "#000000", "opacity": 0.2 },
        {
          "id": "hook-text", "type": "text", "text": "{{hook}}", "markup": "emphasis",
          "style": "hook", "emphasisStyle": { "color": "$colors.accent" },
          "frame": { "x": "50%", "y": "14%", "width": "84%", "anchor": "top" }
        }
      ]
    },
    {
      "repeat": { "slot": "items", "as": "item" },
      "slide": {
        "id": "item-{{index1}}",
        "layers": [
          { "id": "photo", "type": "image", "src": { "slot": "item.image" }, "frame": { "inset": 0 }, "fit": "cover" },
          {
            "id": "scrim", "type": "shape", "shape": "rect",
            "frame": { "x": 0, "y": "100%", "width": "100%", "height": "45%", "anchor": "bottom-left" },
            "fill": { "type": "linear", "angle": 90, "stops": [ { "offset": 0, "color": "rgba(0,0,0,0)" }, { "offset": 1, "color": "rgba(0,0,0,0.65)" } ] }
          },
          {
            "id": "copy", "type": "group",
            "frame": { "x": "8%", "y": "92%", "width": "84%", "height": "auto", "anchor": "bottom-left" },
            "layout": { "type": "stack", "direction": "vertical", "gap": 20, "align": "start" },
            "children": [
              {
                "id": "badge", "type": "text", "text": "{{index1}}",
                "style": ["itemTitle", { "fontSize": 40, "align": "center", "background": { "mode": "block", "color": "$colors.accent", "paddingX": 18, "paddingY": 8, "radius": 999 } }],
                "frame": { "width": "auto" }
              },
              { "id": "title", "type": "text", "text": "{{item.title}}", "style": "itemTitle" },
              { "id": "body", "type": "text", "text": "{{item.body}}", "style": "itemBody", "if": { "slot": "item.body" } }
            ]
          },
          {
            "id": "pager", "type": "text", "text": "{{slideIndex1}}/{{slideCount}}",
            "style": { "fontFamily": "Inter", "fontWeight": 700, "fontSize": 28, "color": "rgba(255,255,255,0.8)", "align": "right" },
            "frame": { "x": "94%", "y": "4%", "width": "auto", "anchor": "top-right" }
          }
        ]
      }
    },
    {
      "id": "cta",
      "if": { "slot": "cta" },
      "background": "#111111",
      "layers": [
        { "id": "photo", "type": "image", "if": { "slot": "ctaImage" }, "src": { "slot": "ctaImage" }, "frame": { "inset": 0 }, "fit": "cover", "filters": { "brightness": -0.25 } },
        {
          "id": "cta-text", "type": "text", "text": "{{cta}}", "style": "hook",
          "frame": { "x": "50%", "y": "50%", "width": "80%", "anchor": "center" }
        }
      ]
    }
  ]
}
```

Slot values for a 4-slide render (hook, 2 items, CTA):

```json
{
  "hook": "5 sleep habits that *actually* worked for me",
  "hookImage": { "asset": "6650f1c2000a1b2c3d4e" },
  "items": [
    { "title": "No screens after 10pm", "body": "Phone charges in the kitchen. Kindle only.", "image": { "url": "https://images.pexels.com/photos/1/pexels-photo-1.jpeg" } },
    { "title": "Same wake time, even Sundays", "image": { "collection": "bedroom-aesthetic", "pick": "random", "seed": "2026-10-09" } }
  ],
  "cta": "Save this for tonight"
}
```

### 3.2 Text-only quote carousel (no images, colour slot, page dots)

```json
{
  "version": 1,
  "name": "Quote carousel",
  "canvas": { "preset": "4:5", "background": { "slot": "bg" } },
  "fonts": [{ "family": "Hertical Serif Regular" }, { "family": "Inter" }],
  "theme": {
    "colors": { "ink": "#1B1A17", "muted": "#6B665E" },
    "textStyles": {
      "quote": {
        "fontFamily": "Hertical Serif Regular", "fontWeight": 400,
        "fontSize": { "min": 48, "max": 84 }, "color": "$colors.ink",
        "align": "left", "verticalAlign": "middle", "lineHeight": 1.2,
        "letterSpacing": -0.5, "maxLines": 8, "overflow": "shrink"
      },
      "attribution": { "fontFamily": "Inter", "fontWeight": 600, "fontSize": 30, "color": "$colors.muted", "letterSpacing": 2, "textTransform": "uppercase" }
    }
  },
  "slots": {
    "bg": { "type": "color", "label": "Background", "default": "#F4EFE6" },
    "author": { "type": "text", "label": "Author", "required": true, "maxLength": 60 },
    "quotes": { "type": "list", "minItems": 1, "maxItems": 10, "item": { "text": { "type": "text", "required": true, "maxLength": 280, "multiline": true } } }
  },
  "slides": [
    {
      "repeat": { "slot": "quotes", "as": "q" },
      "slide": {
        "id": "quote-{{index1}}",
        "layers": [
          {
            "id": "mark", "type": "text", "text": "“",
            "style": { "fontFamily": "Hertical Serif Regular", "fontSize": 260, "color": "$colors.ink", "lineHeight": 1 },
            "opacity": 0.12, "frame": { "x": "6%", "y": "4%", "width": "auto" }
          },
          {
            "id": "quote", "type": "text", "text": "{{q.text}}", "markup": "emphasis",
            "style": "quote", "emphasisStyle": { "fontStyle": "italic", "underline": true },
            "frame": { "inset": ["16%", "10%", "22%", "10%"] }
          },
          { "id": "rule", "type": "shape", "shape": "rect", "fill": "$colors.ink", "frame": { "x": "10%", "y": "84%", "width": 64, "height": 4 } },
          { "id": "author", "type": "text", "text": "— {{author}}", "style": "attribution", "frame": { "x": "10%", "y": "87%", "width": "60%" } },
          {
            "id": "pager", "type": "text", "text": "{{slideIndex1}} / {{slideCount}}",
            "style": ["attribution", { "align": "right", "letterSpacing": 0 }],
            "frame": { "x": "90%", "y": "87%", "width": "auto", "anchor": "top-right" }
          }
        ]
      }
    }
  ]
}
```

### 3.3 Grid / collage slide (single slide, 2×2 grid + centred label pill)

```json
{
  "version": 1,
  "name": "2x2 collage",
  "canvas": { "preset": "1:1", "background": "#FFFFFF" },
  "fonts": [{ "family": "Inter" }],
  "slots": {
    "photos": { "type": "list", "minItems": 4, "maxItems": 4, "item": { "image": { "type": "image", "required": true } } },
    "label": { "type": "text", "required": true, "maxLength": 40 }
  },
  "slides": [
    {
      "id": "collage",
      "layers": [
        {
          "id": "grid", "type": "group",
          "frame": { "inset": 24 },
          "layout": { "type": "grid", "columns": 2, "rows": 2, "gap": 12 },
          "children": [
            {
              "repeat": { "slot": "photos", "as": "p" },
              "layer": { "id": "cell", "type": "image", "src": { "slot": "p.image" }, "fit": "cover", "cornerRadius": 20 }
            }
          ]
        },
        {
          "id": "label", "type": "text", "text": "{{label}}",
          "style": {
            "fontFamily": "Inter", "fontWeight": 800, "fontSize": { "min": 40, "max": 64 },
            "color": "#111111", "align": "center", "maxLines": 2, "textTransform": "uppercase",
            "background": { "mode": "block", "color": "#FFFFFF", "paddingX": 36, "paddingY": 18, "radius": 999 }
          },
          "shadow": { "color": "rgba(0,0,0,0.25)", "blur": 24, "offsetY": 8 },
          "frame": { "x": "50%", "y": "50%", "width": "auto", "anchor": "center" }
        }
      ]
    }
  ]
}
```

(A 1×3 strip is `columns: 3, rows: 1`. The old oval-icons look is a group with
an ellipse shape and N absolutely positioned, rotated sticker groups, written
as literal coordinates. The random placement generator is not part of the
engine; see §6.)

---

## 4. Render API contract

All routes live under `/api/v1` (Hono `openApiApp`, which today only has
`/health`). Auth is a Clerk session or an API key. Scheduling and publishing
reference renders by id.

| Method & path | Purpose |
|---|---|
| `GET /schema/slideshow-spec` | JSON Schema for spec v1, plus the font registry and the error code list |
| `POST /specs/validate` | `{spec, slotValues?}` → `{ok, errors, warnings, resolvedSpec?}`. No assets fetched unless `checkAssets: true`. |
| `POST /renders` | Create a render (below) |
| `GET /renders/{id}` | Status and outputs (signed URLs) |
| `POST /renders/preview` | `{spec \| templateId, slotValues, slide: n, scale?: 0.5}` → `image/png` synchronously. Not persisted, rate-limited. |
| `GET/POST/PATCH/DELETE /templates[/{id}]` | Template CRUD. The body is a SlideshowSpec, validated on save. |
| `GET /fonts` | Registry: family, weights, styles, file and licence note |

`POST /renders` request:

```jsonc
{
  "templateId": "tpl_…",                 // XOR "spec"
  "spec": { "version": 1, "...": "..." },
  "slotValues": { "...": "..." },
  "output": {
    "format": "png",                    // png | jpeg | webp
    "quality": 0.92,                    // jpeg/webp only
    "scale": 1,                         // 0.5..2 multiplier on canvas px
    "zip": true,
    "pdf": false
  },
  "title": "Sleep habits #12",          // for filenames/zip slug
  "wait": true,                         // sync up to ~55s, else 202
  "idempotencyKey": "client-run-123"
}
```

Response, either `201` (complete) or `202` (`status: "queued" | "rendering"`):

```json
{
  "id": "rnd_…",
  "status": "succeeded",
  "renderHash": "sha256:…",
  "slides": [
    { "index": 1, "id": "hook", "url": "https://…/signed", "width": 1080, "height": 1920, "bytes": 812345, "sha256": "…" }
  ],
  "zipUrl": "https://…/signed",
  "pdfUrl": null,
  "resolvedSpec": { "...": "..." },
  "warnings": [],
  "createdAt": "2026-10-09T08:00:00Z"
}
```

Error responses:
- `422 {ok:false, errors, warnings}` for spec or slot problems
- `424` for `asset.fetch_failed`
- `413` for a spec that is too large
- `429` when rate-limited

**Caching:** `renderHash = sha256(canonicalJSON(resolvedSpec) + engineVersion
+ fontFileHashes + assetSha256s + output)`. A matching succeeded render returns
its stored outputs instead of rendering again.

**Execution:** synchronous inside the Next `web` service for previews and
small renders. Renders created by schedules or with `wait: false` go to the
Railway `worker` through the job queue. Rendering never runs in Appwrite
Functions: node-canvas is native, and the generated-copy drift is already
visible in `appwrite/functions/job-worker/src/slideshow-*.js`.

**MCP tools** wrap the same functions:
- `lumenclip_spec_schema`
- `lumenclip_spec_validate`
- `lumenclip_render` (+ `wait`)
- `lumenclip_render_get`
- `lumenclip_templates_list/get/save/delete`
- `lumenclip_fonts_list`
- publishing tools take a `renderId`

They replace the automation, hook and generation tools in
`lib/mcp/tool-registry.ts`.

**Public share routes stay:**
- `/api/public/slideshows/[id]/slides/[n]` becomes
  `/api/public/renders/[id]/slides/[n]`, with a redirect alias.
- The `/download` ZIP route stays.

Both keep the HMAC share token (`lib/slideshow-share.ts`) and read from
Appwrite Storage.

---

## 5. Mapping current saved slideshow records onto the spec

The owner chose a fresh start with no data migration. The mapping below is
still required for two things:
- `lib/render/legacy/from-slideshow-record.ts`, a **test-only parity fixture
  builder**. It golden-tests that the new engine reproduces today's look
  within tolerance.
- Building the **starter templates** that reproduce the current house style.

| `SlideshowRecord` field | Spec |
|---|---|
| `settings.aspect_ratio` | `canvas.preset` |
| `settings.background_color` | `canvas.background`. Note that today it is ignored and `#111111` is used. |
| `settings.font` (`TikTok Display Medium`, etc.) | `defaults.text.fontFamily`, with legacy aliases mapped to `"Inter"` explicitly (§6) |
| `settings.duration/transition_style/export_as_video/sound_*` | **Not spec.** Sound becomes a publish parameter. The rest is dropped. |
| `title` | render `title` (filenames) |
| `caption/hashtags` | publish request metadata, not spec |
| `prompt/image_collection/slideshow_type/automationId/runId` | dropped |
| `images[i]` | `slides[i]`, `id` kept |
| `images[i].source_image_url \|\| image_url` | full-bleed image layer `{frame:{inset:0}, fit:"cover"}`. **Careful:** after a render, `image_url` holds the *output* PNG and the source is `source_image_url`. |
| `images[i].imageFit` | layer `fit` (`"fit"` → `"contain"`) |
| `images[i].overlay: true` | shape rect, inset 0, `#000`, opacity 0.2 |
| `images[i].overlayImage {padding p}` | image layer with `w = W·max(20,100−2p)%`, `h = w·9/16`, `x = 50%` (anchor top), `y = clamp(0.5H − 0.42h, 0, H−h)` and `fit: "cover"` |
| `images[i].iconLayout` | group: bg rect `#f6f1e8`, ellipse (cx .5W, cy .5H, rx .372W, ry .318H, fill `#fffdf9`, stroke `#27231f`/7), then per icon a group at (x%, y%) with anchor center, `rotation`, size `.135W·clamp(scale,.7,1.3)`, holding a rect (radius .22, `#fffdf8`, stroke 5) and a contain image at 74%, then the focal card (`#eee6f7`, size .16W, y = cy − .159H) |
| `textItems[j].text` | text layer `text` (literal) |
| `fontSize "Npx"` | `fontSize: clamp(N·4, 32, 96)` |
| `textSize.width %` | `frame.width` = `clamp(w,10,100)%` |
| `textAlign` | `style.align` and `frame.anchor` (left → `left`, right → `right`, center → `center`) |
| `textPosition {x,y}` / `textPlacement` / anchors | `frame.x/y` in %. Placement top → y = 16% (flush 5%), center → 45%, bottom → 84% (flush 95%). Today's clamping is baked into literal numbers. |
| overlapping items (auto-stack) | wrap in a `stack` group with gap `max(20, 1.1·fs)` |
| `textStyle` | see the table below. Weight is always 800 and `lineHeight` 1.12. |

| legacy `textStyle` | fill | stroke | background |
|---|---|---|---|
| `outline` | `#ffffff` | `rgba(0,0,0,.88)`, `max(6,.13fs)` | – |
| `whiteText` | `#ffffff` | – | – |
| `yellowText` | `#fff176` | – | – |
| `blackText` | `#111111` | – | – |
| `whiteBackground` | `#111111` | – | lines, `#fff`, 1.0, pad .28/.10em, r `max(3,.06fs)` |
| `white50Background` | `#ffffff` today (bug). Map to `#111111`. | – | lines, `#fff`, .56 |
| `blackBackground` | `#ffffff` | – | lines, `#111`, .9 |
| `black50Background` | `#ffffff` | – | lines, `#111`, .56 |
| `lightPink` / `mutedRed` / `navyBlue` | render white today (bug). Map to `#fbcfe8` / `#f87171` / `#1e3a5f`. | – | – |

These become named `theme.textStyles` (`outline`, `yellow`, `pill-white`,
`pill-black`, …) in the starter templates. A "classic TikTok look" therefore
needs no engine special-casing.

Automation-side fields (`textMode`, `staticText`, `contentDirection`,
`wordLength*`, hooks, `slideCountMode`, `imageOverrides`, `aiImageSelection`,
`noText`) have no spec equivalent. Their only valid descendants are slots
(`items` list for slide counts, image slots for per-slide collections, and
`if` for `noText`).

---

## 6. Capabilities intentionally dropped

1. **The slideshow canvas editor:** drag/resize Transformer, per-slide text
   edits on rendered outputs (`updateSlideshowSlideText`), and viewport
   zoom/pan (`slideshow-viewport.ts`).
2. **Implicit layout heuristics:**
   - auto-stacking of overlapping text
   - safe-margin clamps (`padded` / `flush`)
   - the `fontSize ×4` editor scale
   - fixed placement y values
   - heuristic char-width wrapping (replaced by real metrics)
3. **The `textStyle` enum** and `realfarm-slideshow-text-style-config.ts`.
   Explicit styles and named theme styles replace them.
4. **The `oval-icons` random placement generator** (`createOvalIconLayout`).
   The look stays expressible with explicit layers. If wanted, a generator can
   live in the UI as a "spec macro" that writes literal coordinates, never in
   the engine.
5. **The `imageGrid` enum** (`2x2/1x2/1x3`, never rendered) is replaced by the
   `grid` group layout.
6. **`overlayImage` padding semantics.** A regular image layer replaces it.
7. **Silent font fallback to Inter.** Unknown fonts are now a validation error.
   An explicit alias table keeps `TikTok Display*` → `Inter` for legacy
   fixtures only.
8. **SVG output** and the legacy string-SVG renderer (`renderedSlideSvg`).
9. **Video export:** Rendi/ffmpeg, `export_as_video`, transitions, duration,
   and slideshow video thumbnails.
10. **All content logic in the render path:**
    - AI image selection
    - caption-based image matching (`slideshow-image-matching.ts`)
    - LRU image reuse tracking
    - overlay-image-by-text matching
    - hook casing
    - text generation and tone
    - `slideshow-plan-core.ts` section expansion (hook/content/cta)
11. **Record fields** `prompt`, `slideshow_type`, `image_collection` and
    `automationId`.
12. **Konva/react-konva** as a second rasterizer.

---

## 7. Files and modules

### 7.1 Create (`lib/render/` is the engine; nothing else imports Fabric)

| Path | Contents |
|---|---|
| `lib/render/spec/types.ts` | Types in §2.2 (inferred from zod where possible) |
| `lib/render/spec/schema.ts` | zod v4 `SlideshowSpecSchema`, `SlotValuesSchema(slots)`, `RenderRequestSchema`, limits |
| `lib/render/spec/errors.ts` | `SpecIssue`, codes enum, zod → issue mapping (JSON Pointer) |
| `lib/render/spec/resolve.ts` | template + slotValues → ResolvedSpec (§2.4), pure, no I/O except an injected `resolveCollectionPick` |
| `lib/render/spec/validate.ts` | semantic + instance passes |
| `lib/render/spec/canonical.ts` | canonical JSON and `renderHash` |
| `lib/render/layout/frame.ts` | Length/anchor/inset → absolute boxes, rotation |
| `lib/render/layout/text.ts` | runs, wrapping (word/char/CJK), auto-fit search, maxLines/overflow, per-line backgrounds |
| `lib/render/layout/measure.ts` | `TextMeasurer` interface plus node-canvas and browser implementations |
| `lib/render/layout/image.ts` | cover/contain/fill/none, focal and zoom crop math |
| `lib/render/layout/group.ts` | absolute, stack and grid |
| `lib/render/display-list.ts` | DisplayList types (rect, ellipse, line, image + crop + filters + clip, text run, group transform/clip) |
| `lib/render/paint/fabric-painter.ts` | DisplayList → Fabric objects. Shared by node and browser; successor of `slideshow-fabric-canvas.ts`. |
| `lib/render/node/render-slide.ts` | `fabric/node` StaticCanvas → PNG/JPEG/WebP buffer; successor of `slideshow-raster-renderer.ts` |
| `lib/render/node/fonts.ts` | registry → `registerFont` for each face plus fontconfig (generalizes `font-config.ts`) |
| `lib/render/node/assets.ts` | ImageSource → bytes: Appwrite Storage by file id, https with an SSRF guard (blocks private IPs and redirects to them, 25 MB / 50 MP cap, timeout, content sniffing), per-render cache |
| `lib/render/browser/preview.ts` | browser Fabric canvas + `FontFace` loading + browser measurer |
| `lib/render/fonts/registry.ts` | 21 faces from 70a6ca7 (`appwrite/functions/job-worker/assets/fonts/*`, moved to `assets/fonts/`): family, weight, style, file, licence |
| `lib/render/output/zip.ts`, `output/pdf.ts` | server ZIP (from `slideshow-export` slug logic); PDF via `pdf-lib` if approved |
| `lib/render/render.ts` | `renderSpec({spec \| templateId, slotValues, output})` orchestrator: resolve → validate → fetch → layout → paint → store |
| `lib/render/legacy/from-slideshow-record.ts` | test-only parity fixture builder (§5) |
| `lib/render/templates/*.json` | starter templates: the 3 examples plus "classic TikTok" outline, yellow and pill styles |
| `lib/renders.ts` (+ `lib/templates.ts`) | Appwrite-backed records: `templates {id, ownerId, name, spec, thumbnailFileId}`, `renders {id, ownerId, templateId?, slotValues, resolvedSpec, status, outputs[], zipFileId, pdfFileId, warnings, error, renderHash}`. Owned by the backend workstream. |
| `app/api/fonts/[file]/route.ts` | serves registry font files to the browser preview |
| `public/schemas/slideshow-spec-v1.json` | generated by `scripts/export-spec-schema.mjs` |
| `components/render/spec-preview.tsx` | read-only slide preview (browser engine) |
| `components/render/slot-form.tsx` | form generated from `slots` (image picker, text, colour, list) |
| `components/render/spec-json-input.tsx` | paste/upload JSON with inline issue list (no code editor) |
| `test/render/golden/*` | golden PNGs for the examples and legacy parity fixtures, compared with a pixelmatch tolerance |

### 7.2 Rewrite

- `lib/openapi-app.ts`: add the §4 routes (zod-openapi, schema from
  `lib/render/spec/schema.ts`).
- `lib/mcp/lumenclip-server.ts`, `lib/mcp/tool-registry.ts`, `mcp/slideshow/`,
  `mcp/exports/`: render, spec and template tools only (plus the kept
  publishing and scheduling tools).
- `app/api/public/slideshows/[id]/slides/[index]/route.ts` and `/download`:
  read render outputs from Appwrite Storage (`railwayFileResponse` → Appwrite
  file response).
- `lib/slideshow-share.ts`: token over `renderId`.
- `lib/public-slideshow-assets.ts`: Appwrite file ids instead of
  `/api/local-assets/slideshows/outputs/…` paths.
- `lib/font-config.ts`: folded into `lib/render/node/fonts.ts`.
- `lib/slideshow-export.ts`: keep `slideshowExportSlug`. The client ZIP becomes
  a link to the server ZIP.
- `components/realfarm/slideshow-viewer-modal.tsx` and
  `public-slideshow-share.tsx`: render viewer over `renders` (read-only,
  download, publish).
- Publishing (PostFast/TikTok) takes `renderId` → slide image URLs plus
  caption/hashtags/sound in the publish request.

### 7.3 Delete (render-related; other workstreams delete the rest)

- `lib/slideshow-renderer.ts` (+ test), `lib/slideshow-fabric-canvas.ts`,
  `lib/slideshow-raster-renderer.ts` (+ test)
- `lib/slideshow-font-family.ts`, `lib/realfarm-slideshow-text-style-config.ts`
- `lib/slideshow-oval-icons.ts` (+ test), `lib/slideshow-viewport.ts` (+ test),
  `lib/slideshow-text-controls.test.ts`
- `lib/slideshow-plan-core.ts` (+ test), `lib/slideshow-generation-engine.ts`,
  `lib/slideshow-image-matching.ts` (+ test)
- `lib/slideshow-text-generation*.ts`, `lib/slideshow-tone-analysis.ts` (+ test)
- `lib/slideshow-workflow-fork.ts`, `lib/slideshow-intents*`,
  `lib/slideshow-lifecycle.ts` (if automation-only)
- `lib/temp-slide-testing*.ts`, `lib/realfarm-preview-text.ts`
- `lib/slideshows.ts` (replaced by `lib/renders.ts` + `lib/render/render.ts`;
  its Rendi/video/staging code goes)
- `lib/slideshow-publishing-config.ts`: the language, transition and DeepL
  parts. Move `slideshowDurationOptions` only if publishing needs it.
- `components/realfarm/fabric-slideshow-canvas.tsx`,
  `components/realfarm/automation-settings/format-preview-card.tsx`,
  `template-showcase-*`, `example-slideshow-modal.tsx`,
  `slideshow-tone-analyzer-dialog.tsx`
- `app/api/slideshows/analyze-tone/`
- `appwrite/functions/job-worker/src/slideshow-*.js`, `font-config.js`,
  `realfarm-slideshow-text-style-config.js` (generated copies). After the font
  files move to `assets/fonts/`, the whole job-worker function goes.
- `lib/__live__/slideshow-generation.live.test.ts`
- Dependencies: `konva`, `react-konva`. Keep `fabric`, `canvas`, `jszip`,
  `zod`, `@hono/zod-openapi`. `sharp` may stay for upload thumbnails only.

---

## 8. Open questions for the owner

1. **Preview fidelity.** Is the browser Fabric preview (instant, very rarely
   a different line break) acceptable, with the server PNG authoritative? The
   alternative is server-rendered previews only (exact, ~300–800 ms per slot
   change).
2. **PDF output** (LinkedIn-style document carousels): v1 or later? It adds
   `pdf-lib`.
3. **`{collection, pick:"random", seed}` image sources** in the API. They are
   handy for scheduled renders without content generation, but they are a
   small "content" feature. Keep or drop?
4. **Fonts.** Ship the 21-face PIN set? Licences need checking for SaaS
   embedding and serving to browsers. Allow per-user font uploads (TTF/OTF to
   Appwrite)?
5. **Emoji and CJK.** Inter has neither, so today they render as tofu or with
   random fallback. Bundle Noto Color Emoji (~10 MB) and a CJK subset? This
   affects Railway image size.
6. **Limits.** Are 35 slides, canvas ≤ 2160 px wide and a `scale` up to 2×
   right? Is 1080 the right default width?
7. **Starter templates.** Should cfarm ship a curated template library
   (read-only, clone-to-own), or only user-pasted specs?
8. **API keys.** Clerk machine tokens or our own hashed API keys for `/api/v1`
   and MCP? This belongs to the auth workstream, but render API usability
   depends on it.

## 9. Risks

- **Text-metric drift** between Pango (server) and browser shaping. Mitigate
  with server-authoritative output, golden tests and the `preview` endpoint.
- **node-canvas native builds on Railway Alpine** work today, but upgrades to
  Fabric 7 or canvas 3 must stay pinned. Fabric `fabric/node` filter
  performance on large images: downscale sources to at most 2× the target box
  before filtering.
- **SSRF and memory.** The current `fetchRemoteAsset` has no private-IP guard
  or size cap. User-supplied URLs in a public API make this a must-fix, along
  with decompression bombs (cap megapixels before decode).
- **Font licensing** for the PIN set in a SaaS that serves the font files to
  browsers.
- **Spec surface creep.** Keep v1 small. Additions go into `version: 1` minor
  fields only if they are additive. Breaking changes mean `version: 2` and a
  migrator in `resolve`.
- **Parallel workstreams.** The Appwrite storage layer, publishing (needs
  `renderId`) and MCP/API rewrites all touch `lib/slideshows.ts` consumers.
  Freeze the `RenderRecord` / `renderSpec()` interface first.
