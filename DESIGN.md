# LumenClip Design System

## Brand premise

LumenClip is the creator operations layer between inspiration and publishing. It turns saved references, reusable media, and repeatable workflows into content teams can inspect, approve, and ship.

The visual metaphor is **captured light**: a bright source is clipped into a precise, usable frame. The supplied LC mark is the master asset and must not be redrawn or geometrically modified.

- Brand promise: From source to signal.
- Personality: precise, energetic, modern, trusted
- Audience: creators, growth teams, social operators, and creative strategists
- Voice: short, specific, operational, confident
- Avoid: AI hype, generic purple glow, creator-economy slang, excessive gradients, fake metrics

## Logo

Master mark: `/public/brand/lumenclip-mark.png`

- Use the mark on white, cloud, ink, or true black only.
- Keep clear space equal to the width of the mark's inner vertical stroke.
- Minimum digital size: 24px.
- Do not add shadows, outlines, rotations, or alternate gradients.
- Pair with the `LumenClip` wordmark in Geist SemiBold, tracking `-0.035em`.
- App icon treatment: mark centered on ink with a 20% inset.

## Color

The product is light-first. The logo spectrum is a focused signal, not a background wash.

| Token                | Value     | Role                                                 |
| -------------------- | --------- | ---------------------------------------------------- |
| `--lc-ink`           | `#111117` | Primary text, selected navigation, dark media frames |
| `--lc-cloud`         | `#F7F7FA` | App background                                       |
| `--lc-white`         | `#FFFFFF` | Raised surfaces                                      |
| `--lc-line`          | `#E7E7EE` | Borders and dividers                                 |
| `--lc-muted`         | `#686875` | Secondary copy                                       |
| `--lc-violet`        | `#6D28D9` | Primary action and focus                             |
| `--lc-violet-strong` | `#5B21B6` | Hover and pressed states                             |
| `--lc-magenta`       | `#E92A9A` | Gradient midpoint only                               |
| `--lc-amber`         | `#FF9F1C` | Gradient endpoint and warm media highlights          |
| `--lc-success`       | `#168A55` | Semantic success only                                |
| `--lc-danger`        | `#C53B4A` | Semantic errors only                                 |

### Signature gradient

`linear-gradient(120deg, #6D28D9 0%, #E92A9A 54%, #FF9F1C 100%)`

Use it only for the logo, a 2px signal rail, a selected progress edge, or one atmospheric image treatment per viewport. Primary buttons use solid violet for reliable contrast.

## Typography

Use Geist through `next/font`.

- Display: Geist, 650 to 700, `-0.045em`, line-height 0.98 to 1.05
- Product headings: Geist, 600, `-0.025em`
- Body: Geist, 400 to 500, line-height 1.5
- Labels: Geist, 550, sentence case
- Data and IDs: Geist Mono, 450, tabular figures
- Do not use serif typography.
- Avoid all-caps eyebrows except for compact technical statuses.

Scale: 12, 14, 16, 20, 24, 32, 48, 64px.

## Shape and depth

- Buttons: 10px radius
- Inputs: 10px radius
- Product cards: 14px radius
- Media frames: 16px radius
- Dialogs and large panels: 18px radius
- Pills are reserved for filters, statuses, and segmented controls.
- Prefer 1px cool-gray borders and spacing over shadows.
- Raised panels may use `0 12px 36px rgba(35, 24, 67, 0.08)`.

## Layout

- Desktop shell: 224px sidebar plus fluid work area.
- Content max width: 1280px.
- App gutters: 24px desktop, 16px tablet/mobile.
- Use asymmetric media compositions and mixed aspect ratios for creator content.
- Keep workflows dense enough for operators but give primary actions clear breathing room.
- Navigation must remain one line per item and show one unmistakable active state.

## Product surfaces

### Sidebar

Cloud background, logo mark plus wordmark, solid violet primary action, ink active row with a 2px spectrum rail. Section labels are sentence case and muted.

### Home

Start with a compact editorial welcome block: direct headline, one-line value statement, two actions, and a staggered strip of placeholder creator media. Follow with output tabs and quick-start workflows.

### Cards

Cards exist for media, automation templates, and saved source records. Avoid wrapping every setting or metric in a card. Use dividers and whitespace for supporting information.

### States

- Loading: skeletons matching the final media geometry
- Empty: specific next action, no generic illustration
- Error: inline, direct language, recovery action where possible
- Focus: 3px violet ring at 28% opacity plus visible border
- Pressed: translate down 1px

## Photography and media direction

Placeholder imagery should feel like real production inputs: product closeups, creator sets, hands operating cameras, studio light, short-form frames, and quiet behind-the-scenes scenes. Use mixed portrait and landscape crops. Avoid staged office teams and obvious AI imagery.

Final image treatment:

- Natural contrast and cool-neutral shadows
- Occasional violet or amber practical light
- Subtle grain
- No text labels floating over photography
- No rainbow overlays

## Motion

Motion communicates state and flow.

- 160ms for hover and press feedback
- 240ms for panels and tabs
- 360ms for page-level reveals
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`
- Respect `prefers-reduced-motion`.
- Do not animate continuously unless it represents active generation or upload progress.

## Accessibility

- Minimum body contrast: WCAG AA 4.5:1
- Do not place white type on the amber end of the gradient.
- Every icon-only button needs an accessible label.
- Keep visible keyboard focus.
- Touch targets are at least 40px on mobile.
- Meaning cannot depend on gradient color alone.

## Brand assets

- Master mark: `/public/brand/lumenclip-mark.png`
- Brand guidelines board: `/public/brand/lumenclip-brandkit.png`

The board is a visual reference. Production UI must use the exact tokens and interaction rules in this document.
