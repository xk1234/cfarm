import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  MediaCard,
  MediaCardAction,
  MediaCardActions,
  MediaCardCaption,
  MediaCardMetadata,
  MediaCardPreview,
  MediaCardStatus,
} from "./media-card"

describe("MediaCard", () => {
  it("renders its composable slots", () => {
    const markup = renderToStaticMarkup(
      <MediaCard>
        <MediaCardPreview state="ready" imageSrc="/preview.jpg" alt="Studio setup">
          <MediaCardStatus tone="success">Ready</MediaCardStatus>
          <MediaCardActions>
            <MediaCardAction aria-label="Play preview">Play</MediaCardAction>
          </MediaCardActions>
        </MediaCardPreview>
        <MediaCardMetadata>MP4 · 24 seconds</MediaCardMetadata>
        <MediaCardCaption>Launch cut</MediaCardCaption>
      </MediaCard>
    )

    expect(markup).toContain("Studio setup")
    expect(markup).toContain("Ready")
    expect(markup).toContain("MP4 · 24 seconds")
    expect(markup).toContain("Launch cut")
  })

  it.each([
    ["loading", "Loading media"],
    ["error", "Media unavailable"],
  ] as const)("renders the %s fallback", (state, label) => {
    const markup = renderToStaticMarkup(<MediaCardPreview state={state} />)
    expect(markup).toContain(`data-media-state="${state}"`)
    expect(markup).toContain(label)
    expect(markup).toContain('role="status"')
  })

  it("provides accessible action and image semantics with the violet focus ring", () => {
    const markup = renderToStaticMarkup(
      <MediaCardPreview state="ready" imageSrc="/frame.jpg" alt="Product closeup">
        <MediaCardAction aria-label="Delete media">Delete</MediaCardAction>
      </MediaCardPreview>
    )

    expect(markup).toContain('alt="Product closeup"')
    expect(markup).toContain('aria-label="Delete media"')
    expect(markup).toContain('type="button"')
    expect(markup).toContain("lc-focus-ring")
  })
})
