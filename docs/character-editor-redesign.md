# AI Character Editor — Redesign Notes

Scope: the "AI Characters" editor in `components/realfarm/characters/` — the sidebar list, the header, the generations grid, and the floating bottom **composer** (the part that felt ugly). Every change is grounded in two sources: your interface-design vault (`Knowledge 2/Vault/Design`) and the design system this repo already ships (`DESIGN.md` + the `--app-*` tokens in `app/globals.css`).

The headline finding: the editor wasn't lacking a design system — it was **ignoring the one you already have**. It hardcoded near-but-wrong hex values (`#ff4f28` where the token is `#ff5626`), which also meant it silently broke in dark mode.

---

## What was wrong (diagnosis)

Read against the vault, the problems were structural, not cosmetic:

**1. No color roles — accent used as decoration.**
The orange `#ff4f28` appeared on hover borders, list rings, source badges, empty-state card hovers, icons, and the primary button all at once. Per *Assign UI Color Roles*: "If a color does not have a role, it becomes decoration… Reserve strong color for meaning." When the accent is everywhere, the user can't tell what's actually the primary action.

**2. Bold everything — so nothing reads as hierarchy.**
Nearly every text node was `font-bold`. Per *Choose UI Type… Weight Should Match The Job*: "Every label is bold, so bold no longer communicates hierarchy." Names, metadata, micro-labels, and helper text all shouted at the same volume.

**3. Tiny uppercase micro-labels as the default.**
`Mode`, `Ratio`, `Images`, `Audience`, etc. were all 12px **bold uppercase**. The vault reserves uppercase micro-labels for genuinely low-priority text; used everywhere they add noise and visual weight to a decision-heavy surface.

**4. The composer was one over-dense box with a horizontal scrollbar.**
Mode, description, prompt, a scrolling control row (`overflow-x-auto`), asset chips, attachments, Assets, Ratio, Model, and Generate were stacked in a single flat white card. Per *Tune Interface Density* ("density should match the user's mode" — generation is a **decision** moment → lower density) and *Use Box Model… Negative Space* ("interfaces need different spacing at different relationship levels"). A horizontal scroll also **hides controls**, which is an affordance failure.

**5. Mode was switchable in three different places.**
A header pill row (`Identity / Generate / Recreate / …`), the composer `Mode` dropdown, and the empty-state cards. The header pills matched the active state with a fragile `.label.includes(item)` string check, and "Identity" did nothing. Per *Separate UX from UI* ("if there are multiple primary controls… the design is avoiding a prioritization decision") and *Tune… Affordance* ("decide whether the action should be a button, link, menu item, tab").

**6. Broke dark mode.**
`bg-white`, `#f8f8f4`, `#111827`, `#667085` are fixed light values. The repo has a full `.dark` token ramp; the editor opted out of all of it.

---

## What changed (implementation)

All changes are presentational — no state, handlers, or generation logic were touched. `tsc --noEmit` and `eslint` pass clean on the three files.

### `characters-view.tsx`

| Area | Before | After | Vault principle |
|---|---|---|---|
| Surfaces | `bg-white`, `#f8f8f4`, `#efefe9` | `bg-app-surface`, `bg-app-surface-subtle` + `border-app-panel-border` | Surface hierarchy via neutrals, not color (*Dark UI*, *Color Roles*) |
| List cards | Shadowed white tiles, `ring-[#ff4f28]` | Flat bordered rows; selected = accent border + ring only | Reduce accidental weight; accent = selection only (*Tune…*) |
| Character name / meta | Both `font-bold`, `#252525` / `#555` | Name `font-semibold` app-text; meta regular `app-muted-text` | Strong name, quiet metadata (*Write Interface Text*, *Type…*) |
| "Headshot locked" | Bold inline text | Quiet neutral status chip | Status pairs with a contained treatment, not loud text |
| Header pill row | 6 fragile `.includes`-matched pills | **Removed** — Mode lives in one place now | Consolidate mode-switching (*Affordance*) |
| Generate button | "Generate Image" | "Generate image" (sentence case) | Consistent, boring-in-a-good-way labels |

### The composer (the core fix)

Rebuilt from one flat card into **three grouped zones** with real dividers and consistent 36px control heights:

- **Mode header** (`bg-app-surface-subtle`, bottom border): the single Mode selector + a one-line, quiet description. This is now the *only* mode control.
- **Prompt body**: the textarea (content weight, not bold, relaxed line-height), workflow-specific controls, selected-asset chips (now removable with an ✕), and attachment thumbnails — each in its own spaced row.
- **Action footer** (top border): Assets on the left; Ratio, Model, and the single accent **Generate** button on the right.

The control row changed from `overflow-x-auto` (scroll, hides controls) to `flex-wrap` (everything stays visible). Shadow dropped from `0 18px 48px` to a Level-2 `0 12px 32px` per `DESIGN.md`'s elevation scale.

### `workflow-panels.tsx` & `shared-components.tsx`

- Uppercase-bold labels → `text-[11px] font-medium … text-app-text-faint` (quieter, consistent).
- Source/edit chips → accent tokens; the "select an image first" warning → `app-danger` tokens.
- Status dots and the reference-ready border → `emerald-500` (ready) / `app-danger` (missing) — status colors kept for status only.
- Empty state: icon and title de-bolded to tokens; added a one-line subtitle so the primary action (picking a starting card) is oriented, per *Write Interface Text*.
- Progress / failed / attachment tiles → surface + danger tokens (now dark-mode correct).

**Net effect on accent usage:** orange now appears on exactly three things — the selected item, the source/edit state, and the Generate button. That's the discipline *Assign UI Color Roles* asks for.

---

## Recommended next steps (not done — worth deciding on)

1. **Delete the legacy `WorkflowSidePanel`** (~600 lines of disabled, still-hardcoded code in `workflow-panels.tsx`). I left it untouched to keep this change low-risk, but it's dead weight and a source of future hex drift. Per *Reference and File Organization*: archive or remove, don't leave it inline.

2. **QA dark mode.** The editor will now actually theme, but it was never seen in dark before — worth a visual pass. *Design Dark UI* is the checklist: verify surface levels (rail vs. main vs. composer) stay distinguishable and the accent isn't too hot on near-black.

3. **Design the missing states.** *Tune… Interaction Layouts Need States* lists default / hover / focus / loading / success / error / disabled. The Generate button currently has no disabled state when required inputs are missing (e.g. no reference selected) — today it errors via toast *after* a click. Better: disable it and show why.

4. **Rethink the workflow list itself.** There are ~11 workflows in one flat dropdown. *Separate UX from UI* ("what belongs together?") suggests grouping them — e.g. **Create** (free generate, modules, photo dump), **Transform** (recreate, outfit, edit), **Motion** (animate, motion control). A grouped select or a small segmented control would scan far better than one long list.

5. **Sharpen button labels to promise the result.** *Interactive Text Must Promise The Result*: "Generate" → "Generate 8 images" / "Animate image" depending on mode. The count variant already does this; extend it.

6. **Add a spacing/type scale as tokens.** Sizes still drift (`13/14/15/22/26px`). Adopting a small stepped scale (the vault's *Rule of 4*) as named classes would stop the per-element guessing.
