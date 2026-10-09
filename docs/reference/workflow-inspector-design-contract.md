---
title: Workflow run viewer contract
---

# Workflow run viewer contract

This contract defines the single layout for inspecting a workflow run across
all projects. A run may be queued, running, failed, or completed. The viewer is
not a workflow-creation form or a workflow-definition editor.

## Route boundary

- A viewer route receives a run identifier and opens that run directly.
- Template selection, workflow creation, and pre-run input forms live on
  separate routes or screens.
- Starting a workflow creates a run, then navigates to its viewer.
- The viewer must never use a creation form, template grid, or empty setup state
  as its first screen.

## Required vertical order

Every desktop and mobile implementation uses this order:

1. Existing application chrome.
2. Run header.
3. Stage navigation.
4. Selected-stage header.
5. `Input | Result` tabs.
6. Selected-stage content.

No project may move stage navigation to the bottom, a sidebar, a footer, a
floating control, or below the inspector content. It sits immediately below the
run header and may become sticky directly beneath the application chrome.

## Run header

The run header contains:

- back navigation to the Runs list;
- workflow name and run identifier;
- status and started/completed time;
- the standard `Run workflow` action and state-valid conditional actions.

Do not put stage navigation, stage actions, editable inputs, or explanatory
subtitles in this header.

## Stage navigation

- Render one connected horizontal row of labeled, clickable dots.
- Markers are compact 18–20px dots. The short label sits outside the marker.
  Large numbered circles, numbered stepper chips, icon tiles, stage cards, and
  duplicate progress bars do not satisfy this rule.
- Preserve execution order from left to right.
- Encode queued, running, completed, failed, and selected states without
  changing the navigation's placement.
- Every dot has a visible short label, tooltip/full accessible name, native tab
  order, and left/right arrow-key navigation.
- The selected dot remains visible. At 360px, only the stage row may scroll
  horizontally; the page itself must not.
- Do not render stage cards, a vertical stage list, decorative branches, or a
  second progress control elsewhere on the page.

## Selected-stage header

Place this immediately under stage navigation. It contains:

- `Stage N of M`, title, kind, and status;
- previous and next arrow buttons together on the right on desktop and in the
  same header row on mobile;
- a stage-level rerun action only when supported. A rerun creates a new run or
  fork; it never overwrites a completed run.

## Inspector

- Show exactly one selected stage in one inspector surface.
- The only primary tabs are `Input` and `Result`, in that order.
- `Input` shows the exact resolved dependencies received by the stage.
- A model prompt is an input. Show model, attempt, ordered system/user messages,
  variables, and attached media inside `Input`; never create a Prompt tab or
  Prompt stage.
- Request IDs, endpoints, token usage, HTTP records, and API/LLM-call logs are
  diagnostics. They never replace resolved dependencies or prompt messages.
- `Result` renders the typed artifact actually produced by the stage.
- The typed artifact is the first content in `Result`. Put API/LLM calls,
  network requests, timings, retries, and provider responses in a collapsed
  `Execution trace` after the artifact, or in `Raw stage data`. A trace table is
  never the primary result. In particular, an endpoint/status/duration grid or
  `API call` filter row is execution diagnostics, not the stage result.
- Put `Raw stage data` in a collapsed disclosure after the typed tab content.
  Raw data is never its own tab or stage and is never open by default.
- Inputs and results of a historical completed run are read-only. Editing or
  retrying creates a new run/fork with explicit lineage.

## Artifact rendering

Use the shared artifact renderer for the value's type:

- prompt: ordered message blocks with model and attempt metadata;
- generated copy: readable content, not JSON;
- image collection: name, count, usage, and a three-image sample mosaic;
- image/video input: visible preview plus filename/type/dimensions, not a bare
  URL;
- image selection: gallery with selection state;
- slideshow plan: ordered storyboard;
- render: media strip or manifest;
- QA: compact checklist with failures first;
- final output: the actual publishable draft or media viewer.

## Shared implementation and responsive behavior

- Reuse the existing application shell, workflow run viewer, stage navigation,
  stage inspector, and artifact renderers. Workflow-specific code supplies data
  and labels only.
- Page and section headings stand alone without explanatory subtitles.
- Use compact monochrome workspace styling, one-pixel dividers, restrained
  radii, 32–36px controls, 8–12px gaps, and 12–16px padding.
- At 360px, preserve the required vertical order, stack run-header metadata and
  actions as needed, keep previous/next controls visible, and avoid page-level
  horizontal scrolling.

## Controls and actions

Use the project's shared `Button`, `IconButton`, and `Tabs` primitives. Do not
create workflow-local button classes or subtly different versions of the same
control.

### Default action inventory

The following controls and labels are identical across slideshow, UGC, fixed
video, LinkedIn, X/Threads, and future workflow types:

| Location | Default control | Behavior |
| --- | --- | --- |
| Run header, left | `Back to runs` | Returns to the Runs list. |
| Run header, right | `Run workflow` | Executes a draft or creates a new run from a historical run's saved inputs. |
| Stage header, right | `Run step` | Executes the selected step or creates a new fork from that step on a historical run. |
| Stage header, after Run step | Previous icon | Selects the previous step; disabled on the first step. |
| Stage header, after Previous | Next icon | Selects the next step; disabled on the final step. |

These are the only default workflow execution controls. Do not replace them
with `Generate`, `Continue`, `Run stage`, `Retry`, `Rerun`, `Fork`, or a
workflow-specific synonym. The page title, stage title, and artifacts establish
the workflow context; button labels remain stable.

- `Run step` is present for every executable stage. When prerequisites are
  missing, keep it visible but disabled and expose the reason accessibly.
- A completed or failed historical run stays immutable. Its `Run workflow` and
  `Run step` actions always create a new run/fork with lineage.
- During execution, disable the trigger, preserve its width, and use `Running
  workflow…` or `Running step…`.
- `Input` and `Result` remain tabs, not execution buttons.

### Conditional actions

Conditional controls appear only when their capability is active:

- `Cancel workflow`: queued or running run only.
- `Resume workflow`: paused run only.
- `Download`: selected final artifact with a downloadable file only.
- `Open output`: selected final artifact with a dedicated viewer only.
- Destructive actions: overflow menu by default, except an immediate recovery
  action that must remain visible.

Do not add Save to autosaved drafts or historical runs. Do not add a persistent
Download, Publish, Approve, Share, or overflow button to every workflow merely
for toolbar symmetry.

### Roles

- **Primary:** `Run workflow` on an editable draft. There is at most one visible
  primary action per action group.
- **Secondary:** `Run step` and supported conditional actions such as Download.
- **Ghost/icon:** navigation and low-emphasis utilities, including Back,
  Previous, Next, and overflow.
- **Destructive:** cancellation or deletion using the project's shared
  destructive treatment. Include an explicit verb; never rely on color alone.

### Fixed placement by screen

- **Workflow/template list:** page action at the top right. A template or
  workflow card is one fully clickable target; do not add a redundant button
  inside it.
- **Pre-run creation:** one `Run workflow` primary action at the top-right of
  the form header or in one sticky action footer on narrow screens, never both.
- **Run viewer:** `Run workflow` and any state-valid conditional run action at
  the right of the run header.
- **Selected stage:** `Run step` at the right of the selected-stage header,
  followed by one adjacent Previous/Next icon-button pair.
- **Inspector:** no duplicated run/stage actions below the tabs or artifacts.

### Dimensions and states

- Labeled buttons are 34–36px high. Icon-only buttons are square at the same
  height. Use the shared radius and spacing tokens.
- Use only the project's existing icon family at 16px with the established
  stroke weight. Icons precede labels.
- Icon-only buttons require an accessible name and tooltip. Unfamiliar actions
  remain labeled.
- Tabs are plain text tabs with an active underline. They are not pills,
  segmented buttons, cards, or a bottom navigation bar.
- Loading disables the triggering control, preserves its width, and changes its
  label or shows the shared spinner. Do not add a second progress button.
- Disabled controls remain legible and expose the reason through nearby text or
  a tooltip when the reason is not obvious.
- Completed historical runs are read-only and have no Save button. `Run
  workflow` and `Run step` create a new run/fork with lineage.
- `Run workflow` uses the primary treatment only on an editable draft. On a
  completed or failed historical run it uses the secondary treatment.
- Pre-run inputs autosave when supported. Do not show both Autosaved and a Save
  button for the same state.

### Mobile

- Preserve the desktop action hierarchy at 360px.
- Run-level labeled actions may become full-width below the run identity.
- Keep Previous and Next together and visible in the selected-stage header.
- Never move actions or stage progress into a fixed bottom bar merely to make
  the desktop layout fit.
- Never add floating scroll arrows, sticky action bubbles, or viewport-edge
  shortcuts. Use native scrolling and keep actions in their assigned headers.
