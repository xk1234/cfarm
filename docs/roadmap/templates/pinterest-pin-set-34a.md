---
title: Pinterest Pin Set 34A template migration
---

# Pinterest Pin Set 34A template migration

## Decision

Treat pages 2–6 of `Copy of PIN SET 34A 2022 - 750x1500.pdf` as five distinct starter templates. Page 1 is a cover sheet and should not become a template.

The five templates should remain true 750×1500 / 1:2 Pinterest pins. They should appear in Templates as current rendered image cards; selecting a card should open the existing slideshow template editor with its editable layers.

## Source audit

| PDF page | Template          | Editable construction                                                                                         |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| 2        | Home decor        | Full-bleed photo, orange outline rectangle, large left arrow, five text layers, orange footer bar             |
| 3        | Blueberry muffins | Full-bleed photo, navy/white text layers, script title, shadowed `BLUEBERRY`, navy footer bar                 |
| 4        | Product grid      | Tan background, 2×5 image grid, brown header bar, layered title, script subtitle, footer text                 |
| 5        | Baby names        | Two full-height image regions, navy label rectangle, three display-text layers, navy footer bar               |
| 6        | Flower names      | Full-bleed photo, pink outline rectangle, mixed black/pink text layers, script parenthetical, pink footer bar |

The source photos are embedded in the PDF at usable resolution. No photography has to be recreated.

## Asset blocker

Pixel-accurate editable text is blocked until the full licensed font files are supplied. The PDF embeds only subsetted font programs: they preserve the glyphs already present in the exported PDF but do not provide a safe, complete font for arbitrary replacement copy.

Required TTF, OTF, or WOFF/WOFF2 files:

- Glacial Indifference Regular and Bold
- Jenthill Light
- Angelina
- Hertical Sans Smooth
- Rumba Regular
- Sunflower
- Maldina
- Seattle Regular
- Buffalo Regular

The repository currently bundles only Inter. Falling back to Inter would materially change line breaks, spacing, and the look of every design, so these templates should not be published as “exact” until the fonts are available and licensed for app/server rendering.

## Code readiness

Implemented as part of this migration foundation:

- native 1:2 slideshow/template ratio, including MCP validation;
- editable rectangle and arrow layers with fill, stroke, opacity, size, position, rotation, radius, and direction;
- shape creation and editing in the slideshow template editor;
- per-text-element color and letter spacing controls;
- per-text-element font selection honored by preview and exported rendering;
- shape, typography, and image-layer persistence through preview, automation runs, saved slideshows, and final rendering.

Existing image layers can reproduce the fixed collage on page 4. A separate dynamic-slot feature is still needed if every tile should select a new image from a collection during each automation run. Fixed image layers are sufficient for a faithful editable template.

## Import plan

1. Obtain and confirm licenses for the nine full font families above.
2. Add the font files to the renderer bundle and register their exact family names in the editor and server font configuration.
3. Extract the embedded photos into the asset library without recompression where possible.
4. Rebuild pages 2–6 as 1:2 template schemas using image, shape, and text layers.
5. Render each schema to produce its Templates card thumbnail; do not use a past generation as the card art.
6. Compare exported 750×1500 PNGs against the PDF pages for geometry, crop, typography, color, and stacking order.
7. Optionally make page 4’s ten image regions collection-driven after the fixed templates are approved.

## Acceptance criteria

- Five template cards are visible, not six.
- Every card renders the current template definition.
- Each card opens the slideshow template editor.
- Text, photos, rectangles, arrows, and footer bars are independently editable.
- Export size and aspect ratio are 750×1500 / 1:2.
- No fallback font is used in the approved renders.
- Page 4’s crop and layer order match the source.
