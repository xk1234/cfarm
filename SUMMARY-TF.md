# Testing facility prompt-field refocus

## Final dimension contract

| Dimension | Target | Applied value |
| --- | --- | --- |
| `slideDirection` | `{ section: "hook" \| "body" \| "cta", slideIndex: number }` | Replaces or creates only that slide's `slideOverrides` content direction. |
| `itemDirection` | `{ section: "hook" \| "body" \| "cta", itemId: string }` | Updates only that text item's `contentDirection`. |
| `wordRange` | `{ section: "hook" \| "body" \| "cta", itemId: string }` | Parses an exact positive-integer range such as `"20-40"` into `wordLengthMin` and `wordLengthMax`. |
| `staticText` | `{ section: "hook" \| "body" \| "cta", itemId: string }` | Updates only that item's `staticText` and sets its `textMode` to `"static"`. |
| `tone` | None | Applies the string through the existing tone schema helper, including its preset metadata. |
| `promptFormatting` | None | Replaces `prompt_formatting.style` while preserving its narrative, slide count, and hook casing. |
| `slideCount` | `{ section: "hook" \| "body" \| "cta" }` | Writes a non-negative integer string to that section's `slideCount`. |
| `model` | None | Passes the selected OpenRouter text model to preview generation. |
| `hook` | None | Enables only the selected hook seed for that preview. |

The experiment still builds a structured clone for every cell and calls
`previewAutomationRunPlan`; it never patches the saved automation. The 200-cell
cap, repeat range of 1–20, per-cell failure handling, and repeat-based RNG
seeding are unchanged.

## Deleted behavior

- Removed the `variable` dimension without a deprecated alias.
- Removed hook-token replacement and experiment-owned substitution merging.
- Removed variable-binding and word-collection lookup from experiments.
- Removed runtime-variable rejection and `assertSweepableVariables`.
- Removed the inert-token warning and cell warning payload.
- Removed the old `collection` sweep because it is not part of the prompt-field
  dimension set.

## Dimensions response

`getAutomationExperimentDimensions(automationId)` now returns:

- `automationId`
- `sections`, one each for `hook`, `body`, and `cta`
  - `section`
  - current `slideCount`
  - `textItems`
    - `itemId`
    - human `label`
    - current `contentDirection`
    - current `wordRange` as `{ min, max, value }`
    - current `textMode`
    - current `staticText`
  - `slides`, one per current section slide
    - one-based `slideIndex`
    - current override `contentDirection`, or an empty string
- current `tone` as `{ value, preset }`
- current `promptFormatting` object
- `enabledHookCount`

The API route and the two existing MCP tools use the same discriminated target
shapes. MCP descriptions include a body slide 2 direction sweep with three
realistic prompt candidates.

## Testing facility UI

The testing page now uses a sequential field picker:

1. Choose automation.
2. Choose an automation-wide scope or a `hook`/`body`/`cta` section.
3. Choose a slide, text item, or section settings.
4. Choose the compatible field.
5. Edit the saved current value and add candidate values, one per textarea line.

The labels **Choose automation**, **Test all hooks**, **Repeats**, and **Seed**
remain. Automation-wide tone and prompt formatting plus section slide count are
also available. Results identify the varied field, use candidate values as rows
and repeats as columns, and stack enabled-hook previews inside the applicable
cell. Every result shows generated hook/slide copy and QA findings.

The redesign stayed within existing LumenClip tokens and added no
`lint:design-tokens` warning for the testing component.

## Verification

- `lib/automation-experiment.test.ts`: 11/11 passing.
  - Exact slide override targeting.
  - Exact text-item direction targeting.
  - Valid `"20-40"` parsing and malformed-range rejection before previews.
  - Static text mode forcing.
  - Saved-record immutability and no persistence calls.
  - Cell cap, per-cell failure continuation, deterministic seeds, shared
    streams within a repeat, and divergent streams across repeats.
- MCP experiment tool test: passing.
- Touched-file ESLint: passing.
- Full `pnpm lint`: exits successfully; its 40 warnings are pre-existing and
  outside the touched files.
- MCP docs check: passing through `node --import tsx
  scripts/generate-mcp-docs.ts --check`; no generated MCP docs changed.
- `git diff --check`: passing.

## Environment limitations / left out

- `pnpm typecheck` is clean for the touched code after `next typegen`, but the
  repository-wide command still stops at the pre-existing
  `lib/docs-source.ts` import error for `collections/server`.
- The full `pnpm test` run completed with 609 passing and 133 failing tests.
  Most failures are integration tests denied access to the shared Appwrite
  endpoint at `localhost:9080` (`EPERM`); Docker is not running in this
  environment. The full MCP test file also retains four unrelated
  `structuredContent` assertion failures. The isolated experiment and MCP
  experiment-tool tests pass.
- A browser visual pass was not possible: the normal dev command requires
  Docker, and the sandbox also denies binding the web-only Next server to port
  3000.
- No files under `docs/**` or `browser-extension/**` were modified.
