# CFarm / LumenClip production UI audit

Production: `https://cfarm-eight.vercel.app`, deployed before testing. The live product brands itself LumenClip. Desktop was tested at 1440 × 900 and mobile at 390 × 844 with an isolated empty audit account; shared starter templates and connected-account examples remained visible.

The core visual system is calm and usable: Geist, white surfaces, purple `rgb(109, 40, 217)` primary actions, dark active navigation, and mostly 8–10 px radii. It is the most conventionally legible of the four products, but several old/specialized surfaces do not use the same responsive shell.

## Screenshot-backed page documentation

These files document the production interface by route and nested UI surface. A page is listed only after at least one production screenshot has been captured for it. Desktop and mobile screenshots appear before the layout notes in every file.

- [Landing page](pages/landing-page.md)
- [Login page](pages/login-page.md)
- [Dashboard](pages/dashboard/dashboard.md)
- [Dashboard slideshow viewer](pages/dashboard/slideshow-viewer-modal.md)
- [Collections](pages/collections/collections.md)
- [Collection asset importer](pages/collections/add-assets-modal.md)
- [Collection detail](pages/collections/collection-detail.md)
- [Automations](pages/automations/automations.md)
- [Automation template browser](pages/automations/template-browser.md)
- [Testing facility](pages/testing/testing.md)
- [Viral tracker](pages/viral-tracker/viral-tracker.md)
- [X and Threads automations](pages/x-automations/x-automations.md)

Screenshot captures live under `screenshots/desktop` and `screenshots/mobile`. Loading skeletons are not used as canonical page screenshots.

## Login and shell

Desktop login is a two-column split. The left brand statement uses a 60 px heading and the right form is 430 px wide with 48 px fields and button. The visual confidence is good, but the product name and route history still expose the repository's older CFarm identity while the UI says LumenClip; documentation and browser-facing metadata should use one name.

Desktop application navigation is a 223 px sidebar. Mobile replaces it with a 56 px header and 40 × 40 menu button. This adaptation works on the main shell.

## Home

Home combines a 26-week posting heatmap, New automation/View workflows actions, generated Slideshows/Videos, and a “Start from a proven workflow” catalog. It is functionally rich but has no visible H1 in the measured page; the first heading appears around y=875. Users meet charts and controls before a page-level explanation.

On desktop the generated-content pagination shows Previous and Next disabled when the account has no content. On mobile the heatmap intentionally scrolls but is 387 px inside a 343 px region with no obvious cue; month labels are 9 px and individually clip. Starter examples become a long vertical catalog.

Add a clear “Home” heading and one sentence describing the next task. Hide pagination for an empty/single page. For mobile, summarize the heatmap first and expose the detailed grid behind “View activity”.

## Automation template dialog

The parent dialog is opened from New Automation. It contains search, Slideshow/Video/Other social media filters, sort, a “New slideshow automation” action, and about 29 template cards. The semantic heading is visually hidden at 1 × 1 px, so the visible dialog begins with controls rather than identity.

Desktop cards are two columns, with a large preview plus separate Open and Add buttons. Mobile becomes a single-column internal list approximately 5,100 px tall. The scrollable region is 341 px wide but has about 360 px of intrinsic content; the filter/header row also overflows. There is no result count, pagination, or progressive loading.

Make the title and close control visible in a sticky header. Use compact template rows on mobile, filter chips in one deliberate horizontal scroller, and load 10–12 results at a time. “Open” should mean inspect; “Add” should mean create from template and should confirm the resulting record name.

The final nested surface is documented in [Template slideshow detail](modals/template-slideshow-detail.md).

## Compose

Desktop uses a strong authoring model: connected accounts, a master message, network-specific tabs, platform override fields, a live preview, and bottom Schedule/Post now actions. The purpose of inherited text versus override text is explained clearly.

Mobile stacks the connected-account pills and form, but the network tab strip is about 721 px inside 286 px. Facebook begins around x=363 and TikTok around x=578. Several composer regions have 372 px intrinsic width inside 341 px, and the sticky schedule/post actions appear around y=767 while editing content continues beyond y=1,200, which risks covering fields.

Use a native/select-like network switcher on phone or a labelled scroller with edge fade. Keep the submit bar sticky only after reserving its height; show selected-account count rather than four large account pills. The disabled network post text is well explained by “Use custom text”, and this pattern should be retained.

## Analytics

Desktop initially showed oversized skeletons with 2,210 px intrinsic width inside 1,145 px before resolving. With an empty account, mobile resolves to a useful “No stored analytics yet” state and two identical “Sync analytics” actions—one in the header and one in the empty state.

Keep one primary action. Ensure skeleton dimensions exactly match their containers and do not themselves produce overflow. State what accounts/sources will be synced and when the last snapshot was stored.

## Collections

The page has type tabs, search, sort, grid/table mode, “Create empty collection”, and “Add”. On mobile the type tabs total about 405 px inside 358 px; Variables begins around x=309 and extends beyond the viewport. Cards themselves adapt to about 171–173 px in a two-column grid. Card action buttons are 40 px and positioned over the visual.

The two creation labels are ambiguous: “Create empty collection” and “Add” do not communicate different outcomes. Rename them around the result, for example “New collection” and “Import assets”. On mobile use a dropdown for type or a deliberate scroll strip with a visible selected indicator.

## Testing facility

Desktop uses two 549 px columns for automation and inputs, followed by variations and repeats. Mobile stacks to 301 px controls and reads well. “Choose automation first” and “Run experiment” are disabled for clear dependency reasons. The 200 synchronous-cell warning is useful but should be recast as an estimated cost/time summary once variations are known.

## Viral tracker

The page exposes Refresh/New project and immediately displays a technical environment error: “TikHub is not configured. Add TIKHUB_API_KEY…”. A normal user cannot act on a server environment variable. Replace it with “Viral tracking is unavailable” and an admin-only diagnostic link. The New project form is compact on both layouts; avoid showing the duplicate top action while the form is already open.

## X and Threads Automations

This route does not use the responsive application shell. Desktop is a three-column grid: 246 px navigation, minimum 460 px editor, and minimum 360 px preview. At 390 px, the document becomes 1,066 px wide. The editor begins around x=284 and the preview around x=726; the user sees mostly the navigation column while the mobile shell's own header is layered above it.

This is a P1 responsive failure. On mobile use a three-step mode switch—Setup, Draft, Preview—under the standard shell. Do not mount a second navigation system. “Generate draft” is disabled before an automation exists, which is correct, but the required next action should be highlighted inside Setup.

## Purpose and card formatting

Starter cards use three adjacent 124 px slide previews followed by a tiny 47 × 32 “Use” button. The previews visually dominate the template identity; some cards show “No example slideshow yet” but occupy the same height. Use one representative thumbnail, title, concise capability tags, and a full-size Create action. Keep additional slides in the detail view.

## Priority backlog

1. P1 — Rebuild X/Threads Automations as a responsive, single-shell workflow.
2. P1 — Make the automation-template title visible and paginate/virtualize its mobile catalog.
3. P1 — Fix Compose network navigation and reserve space for the sticky submit bar.
4. P2 — Add a Home H1/task orientation and remove empty pagination.
5. P2 — Remove duplicate Sync/New actions and technical environment copy.
6. P2 — Clarify collection creation labels and mobile type navigation.
7. P2 — Constrain analytics skeletons to their containers.
8. P3 — Simplify starter cards to one preview and a stronger action.
