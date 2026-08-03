---
title: UI primitives
description: Compose shared domain-neutral controls, feedback, data, loading, upload, and media building blocks.
---

Route: Shared across application routes.

## Layout

Owner: `components/ui/`.

The shared primitives provide presentation and generic interaction state while
feature components supply product language and business rules. `Button`
defines the standard, outline, secondary, ghost, destructive, link, app action,
soft-control, and icon-control treatments, plus sizes for compact actions,
dialogs, settings rows, and icon-only controls. Its `asChild` option applies the
same styling to a composed link or trigger through Radix Slot.

Form controls include Radix switches and selects, native selects, search
fields, labeled selectors, and the grid/table `ViewModeToggle`. The toggle is a
named control group whose two buttons expose their selected state through
`aria-pressed`.

`AppModal`, `AppModalPanel`, and `AppModalHeader` provide the shared Radix
dialog overlay, surface, title, actions, and labeled close action. Fixed modals
use a portal, while the absolute layer stays inside an existing positioned
surface. `ConfirmDialog` provides the shared destructive confirmation surface,
and `useDirtyGuard` can insert that confirmation before an in-app action leaves
unsaved local edits.

`AgDataTable` wraps AG Grid with sortable, filterable, resizable columns,
pagination, a 620px viewport, a shared empty state, and page-size choices of 10,
20, 50, or 100 rows. The loading skeletons and `Spinner` expose busy semantics.
`UploadDropzone` combines drag and drop with a file picker and reports rejected
files through the global toaster. `MediaCard` composes image or video previews,
fallback states, status, actions, metadata, and captions without embedding
collection or automation behavior.

## Interactions

Button and control variants retain their disabled, focus-visible, invalid, and
pressed states when composed by product surfaces. A row action supplied to
`AgDataTable` runs from either a pointer click or Enter on a focused cell.
`UploadDropzone` accepts the caller's MIME and extension filters, single or
multiple selection, and disabled state.

`ConfirmDialog` cannot be dismissed while confirmation is pending. A failed
confirmation remains open and displays the error. `useDirtyGuard` protects
in-app actions only and does not install a browser unload handler. The root
layout mounts `AppToaster` once; Sonner messages appear at the top right, include
a close button, use rich status colors, and default to six seconds.

## MCP coverage

No. These modules are presentation and client-interaction primitives, and
`lib/mcp/tool-registry.ts` registers no primitive-level operations. A feature
that composes them may have MCP coverage for its own underlying data.
