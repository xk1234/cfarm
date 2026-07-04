# Automation Template Slideshow QA

Date: 2026-07-03

## Template Created

- Name: `Template QA - Nature Texture Slideshow`
- Source collection: `Pinterest - nature texture`
- Collection id: `collection-pinterest-nature-texture-2026-07-03t02-45-58-426z`
- Hook text:
  - `3 texture ideas that make a slideshow feel expensive`
  - `save these calm nature backgrounds for your next ad`
- Slide count: static `3`
- Publish type: `slideshow`
- Auto-post: `false`
- Visibility: `SELF_ONLY`

The template is stored as an automation record in `data/automations/automations.json`.

## Process Tested

1. Confirmed there were no existing automation templates.
2. Created a live automation-backed template through `POST /api/automations`.
3. Used the existing template modal opened from `New Automation`.
4. Confirmed the modal displayed `Template QA - Nature Texture Slideshow`.
5. Opened the template preview and confirmed it rendered slideshow options.
6. Clicked the template card `Add` action.
7. Confirmed the app created a new local automation from the template and opened the automation settings drawer.
8. Ran the slideshow generation path through `POST /api/automations/run`.

## Slideshow Run Result

- Run id: `automation-run-2ee609c5-d5ed-4ee1-b658-8492044b57a7`
- Automation id: `automation-local-4434fd81-daa7-48b2-84ca-fbb2e8514150`
- Scheduled for: `2026-07-03T03:00:00.000Z`
- Status: `scheduled`
- Output record: `data/automations/runs.json`

Generated slides:

1. Hook slide
   - Image: `/api/local-assets/image-collections/files/1783048012453-3b7542f1-4d66-48b0-9e33-3c5d827ae714.png`
   - Text: `3 texture ideas that make a slideshow feel expensive`
   - Caption: `This vertical close-up shows rough, light brown sandstone with a subtle grain texture and jagged surface.`

2. Content slide
   - Image: `/api/local-assets/image-collections/files/1783048013540-10af0e6b-b1ac-43a2-b841-33a3d02ba648.jpg`
   - Text: `Template QA - Nature Texture Slideshow`
   - Caption: `This textured abstract image shows rough wavy brown wood and choppy dark blue water with a box overlay.`

3. CTA slide
   - Image: `/api/local-assets/image-collections/files/1783048012952-4c13c753-f4a2-4c2c-b07f-9f9e102f5c6e.jpg`
   - Text: `Template QA - Nature Texture Slideshow`
   - Caption: `This vibrant, almost emerald-green clear water with dappled sunlight creates a serene natural abstract with dancing reflections.`

## QA Notes

- The template modal is no longer empty once a real automation template exists.
- The modal uses live automation records, not hardcoded templates.
- The `Add` action creates a new local automation and copies the template block correctly.
- The settings drawer has a visible `Generate` button, but it does not currently have an `onClick` handler. The working generation path today is `POST /api/automations/run`, which creates records in `data/automations/runs.json`.
- The generated slideshow run uses local image collection asset URLs.

## Commands Used

```bash
npm test -- lib/generated-videos.test.ts components/realfarm/generated-video-persistence.test.ts components/realfarm/generated-video-exports-actions.test.ts
npm run typecheck
POST /api/automations
POST /api/automations/run
```
