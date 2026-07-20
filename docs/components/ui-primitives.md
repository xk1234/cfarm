---
title: UI primitives
description: Reusable domain-neutral controls under components/ui.
---

## Primitive catalog

| Module                 | Exports and intended use                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `button.tsx`           | `Button` and `buttonVariants`; canonical action, secondary, ghost, and destructive buttons          |
| `modal.tsx`            | `AppModal`, `AppModalPanel`, `AppModalHeader`, and close button; shared overlay and dialog geometry |
| `confirm-dialog.tsx`   | Confirmation for destructive or irreversible actions                                                |
| `form-controls.tsx`    | Switches, toggle rows, search, select, and labeled format controls                                  |
| `upload-dropzone.tsx`  | Drag/drop and file-picker surface for supported media uploads                                       |
| `ag-data-table.tsx`    | Typed AG Grid wrapper for data-heavy tables                                                         |
| `loading-skeleton.tsx` | Card, list, account, and block loading placeholders                                                 |
| `spinner.tsx`          | Compact indeterminate progress indicator                                                            |
| `view-mode-toggle.tsx` | Grid/table view selection                                                                           |
| `app-toaster.tsx`      | Root Sonner notification host                                                                       |

## Usage conventions

- Use `Button` variants instead of reproducing action styles in feature code.
- Use app design tokens such as `text-app-text`, `border-app-panel-border`, and
  `bg-app-surface`; avoid introducing raw colors when an equivalent token
  exists.
- Form controls must retain visible focus rings and labels or accessible names.
- Modals should use the shared shell so escape, overlay, stacking, and responsive
  spacing remain consistent.
- Keep domain labels and API payload knowledge outside this directory.

Fumadocs components are scoped to the `/docs` route and come from
`fumadocs-ui`; they are not replacements for product primitives.
