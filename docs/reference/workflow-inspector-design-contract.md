---
title: "Workflow inspector design contract"
description: "Shared interaction, layout, artifact, and slideshow-semantic rules for every LumenClip workflow inspector."
---

# Workflow inspector design contract

Every workflow uses one shared inspector shell. Workflow-specific code supplies
stage metadata and typed artifacts; it does not invent a new inspector layout.

## Inspector shell

- Represent the complete stage sequence as one connected row of clickable dots.
- A stage dot is a labeled button with an accessible name and tooltip. The
  selected dot may grow or receive an accent ring, but it does not become a
  stage card.
- Put the selected stage title, status, kind, and actions in the inspector
  header. Do not repeat all stage names permanently beside the dots.
- Render one selected stage at a time in one content surface.
- Use whitespace and hairline dividers for structure. Do not nest generic
  bordered panels or put every field in its own card.
- Reserve cards for bounded visual objects: image collections, individual
  media, slides, social-post previews, validation failures, and final outputs.
- Keep raw JSON available as an explicit secondary view. It is never the
  default representation of a recognized artifact.

## Stage result vocabulary

| Artifact          | Required presentation                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Input group       | Compact labeled values or divided rows                                                   |
| Parallel branches | Aligned lanes or columns that visually meet at their first real join                     |
| Hook text         | Resolved text, source template, and variable substitutions; never a slide-role card      |
| Model prompt      | Ordered system/user message blocks with model and attempt metadata                       |
| Generated copy    | Readable text hierarchy matching the target content type                                 |
| Image collection  | One card containing a three-image sample mosaic, collection name, asset count, and usage |
| Candidate pool    | Collection sample plus the slides that consume it                                        |
| Image shortlist   | Ranked image gallery for the selected slide                                              |
| Image selection   | Final ordered image sequence with selection reason                                       |
| Slideshow plan    | Horizontal storyboard of ordered slides                                                  |
| Video plan        | Timed block sequence or shot list                                                        |
| Render result     | Media preview plus a compact artifact manifest                                           |
| Validation        | Compact status and issue checklist; no decorative score dashboard                        |
| Final result      | Target-platform or publishable-draft preview with stable artifact links                  |

Unknown structured data falls back to the shared readable structured renderer,
with expandable additional fields. Do not create another recursive JSON viewer.

## Slideshow semantics

- Slides are ordered slides. There are no `hook`, `body`, or `cta` slide types.
- A hook is text content, usually assigned to an early slide. It is not a slide
  role and must not change the slide's data type.
- Use one default image collection for the slideshow.
- A slide may override the default collection explicitly.
- Do not expose `hook_collection_id`, `body_collection_id`, or
  `cta_collection_id` in new UI, workflow schemas, or artifact contracts.
- CTA text may be content on any configured slide. It does not create a CTA
  slide type or a CTA collection lane.
- Use slide numbers or stable slide IDs in UI labels and workflow artifacts.

Legacy persisted records may still contain role fields while migration is in
progress. Compatibility code may read those fields, but new writes and UI must
normalize them to ordered slides and per-slide configuration.

## Shared component ownership

The shared implementation belongs under:

```text
components/realfarm/workflow-inspector/
components/realfarm/workflow-artifacts/
```

The reusable surface should own:

- connected-dot stage navigation;
- selected-stage header and keyboard navigation;
- visual/raw mode switching;
- responsive inspector layout;
- artifact dispatch by explicit type first, then structural inference;
- loading, empty, failed, skipped, active, and completed states.

Workflow pages should provide stage descriptors and artifact values only.

## Responsive and accessibility requirements

- Support 360px without clipped dots, stage content, or horizontal page scroll.
- Keep the full dot sequence visible when it fits; otherwise allow a contained
  stage-row scroll with the selected dot brought into view.
- Stage navigation supports native tab order and arrow-key movement.
- Every media preview has useful alternative text when the media conveys
  information. Decorative mosaic thumbnails use empty alternative text.
- Status is expressed with text or an icon as well as color.
- Follow the app's system light/dark tokens and existing focus-ring behavior.

## Prohibited patterns

- Workflow-specific stage sidebars or stage-card grids.
- A bordered box around every input, metric, or text fragment.
- Different inspector shells for slideshow, video, X/Threads, and LinkedIn.
- Raw URLs in place of collection or asset previews.
- Generic recursive JSON as the primary stage result.
- Decorative DAG branches that do not represent real artifact dependencies.
- New slideshow UI or data that reintroduces hook/body/CTA slide roles.

## Review checklist

Before merging a workflow UI change, verify:

1. It uses the shared inspector shell and dot navigation.
2. Each recognized artifact uses the shared artifact vocabulary.
3. Cards are limited to bounded visual objects.
4. The selected stage is understandable without reading raw JSON.
5. The layout works at 360px and in both color schemes.
6. Slideshow changes use ordered slides and per-slide collection overrides.
7. The implementation does not duplicate an existing shared component.
