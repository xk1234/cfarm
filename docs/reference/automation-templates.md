---
title: "Automation templates"
---

Automation templates are reusable starting points. They define structure,
generation constraints, and quality gates; a user-created automation receives
its own editable copy.

## Catalog storage

The slideshow template catalog is public reference data in the shared local
Appwrite project:

- `permanent_assets/source_key=automation_template` — 30 template definitions.
- `permanent_assets/source_key=automation_template_example` — 158 curated
  example runs.
- `lib/automation-templates.ts` — normalization and template-to-runtime
  conversion.

The application reads these rows through `lib/json-store.ts`; there is no
filesystem template fallback. The former cloud rows were removed after the
catalog was moved into local Appwrite. User automations created from a template
remain owner-scoped rows in the `automations` table.

## Cutout Swap Carousel

`template-cutout-swap-carousel` is a seven-slide slideshow template modeled on
the visual structure of the [reference X post](https://x.com/shortformsavage/status/2078443414383743456).
It stores the format, not a live or scheduled automation.

The sequence is fixed to one hook, five content slides, and one closing CTA:

1. The hook places a short curiosity headline among several playful cutouts.
2. Each content slide uses a direct headline at the top and one short
   explanation at the bottom.
3. Content imagery prefers an old-choice/new-choice comparison in a `1x2`
   layout, with a simple right-pointing arrow supplied by the image asset.
4. The CTA uses a static **Thank you for watching!** heading, a short generated
   closing wish, and one expressive cutout in the lower half.

The intended assets are clean transparent object cutouts composed on a pure
white 9:16 canvas. Collection bindings are intentionally empty: applying the
template requires choosing a suitable hook/body/CTA collection instead of
silently reusing an unrelated catalog collection. The current renderer does
not synthesize cutouts or arrows, so those elements must already be present in
the selected images. AI image selection is enabled for the five content slides;
after those images are locked, the runner repairs the generated content copy
against their exact captions before rendering.

## Astrology Oval Icons

`template-astrology-oval-icons` is a real slideshow automation template backed
by the pinned `White of Squarish Icons` image collection. Its Hook, Content,
and CTA sections use the editor-selectable `Oval icons` image layout and each
section contains exactly one prompt text item.

For every generated slide, the runner selects one collection asset as the
focal icon inside a centered oval. It then selects four to eight other assets
from the same collection and divides the oval perimeter into the same number
of equal sectors. One icon is placed per sector with bounded seeded jitter and
collision checks, producing even spacing without a rigid repeating pattern.
Only each square's center must remain outside the oval, so the icon itself may
overlap the oval edge. Its distance from the oval is sampled across the usable
space between the oval boundary and the canvas edge, rather than being pinned
to the outline.
Each surrounding icon independently receives a 70–130% scale and a rotation
between -90 and 90 degrees. The selected assets and placements are stored on
the run plan, so reopening or exporting a slideshow does not reroll its
layout.

The initial collection contains ten hand-authored SVG placeholders—crescent
moon, crystal ball, tarot card, zodiac wheel, constellation, ritual candle,
amethyst crystal, hourglass, celestial eye, and shooting star. They are not
AI-generated and can be replaced with production icons without changing the
template.

## LinkedIn content automation template

LinkedIn generation is a text-post template system implemented by
`lib/linkedin-post-presets.ts` and `lib/linkedin-automation-generation.ts`.
It is currently API-only through `POST /api/linkedin-automations/generate`.

Template inputs:

| Input                              | Purpose                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Niche and weighted content pillars | Selects the subject area without repeating one topic indefinitely.                                                         |
| Archetype                          | Chooses a structure such as struggles-to-advice, how-to, framework, harsh truth, process breakdown, or proof-backed story. |
| Hook style                         | Selects a compatible opening while avoiding immediate repetition.                                                          |
| Voice                              | Uses educator by default or proof-backed first-person practitioner voice.                                                  |
| Proof                              | Gates numerical claims and first-person result/story archetypes.                                                           |

Generation returns structured slot output, composes it into plain LinkedIn
text, and runs deterministic checks. The shipped format policy is:

- 500–1,900 characters for standard posts.
- First line at most 105 characters.
- No links, hashtags, or Markdown in the post body.
- At most one emoji and one em dash.
- Unsupported numerical claims fail validation.
- AI-tell wording and generic engagement closers are rejected.

Invalid drafts receive up to two repair attempts and remain marked for review
if violations persist. The missing product work is persistence, a dedicated UI,
scheduling, and publishing—not the generation template itself.

## Video story automation template

The video story template is `story_over_broll` in
`lib/video-automation-templates.ts`. In the UI it is named **Story over
B-roll**.

Its four-beat structure is:

1. **Story hook** — one 2.8-second B-roll clip and a specific first-person
   discovery that opens a loop.
2. **Journey** — two 2.6-second clips showing concrete actions in chronological
   order.
3. **Payoff** — two 2.4-second clips showing an observable result that resolves
   the opening.
4. **CTA** — one 2.2-second clip with a comment-gate or low-friction next step.

Every beat uses collection video, hard cuts, and independently generated text
constraints. The preset is selected through the video automation creation
dialog and saved as `AutomationVideoFormat.template = "story_over_broll"`.

Related presets—including React & Reveal, Compilation, Screen Record,
Screenshot Pictures, Aesthetic Video, and Faceless Reel—live in the same
registry. The registry is code-owned so scheduled and interactive generation
share an exact structural contract.
