# UI/UX Audit Framework

## Purpose

This framework defines how LumenLab, Escriben, CFarm, and InfluLab will be tested and documented from the point of view of an ordinary, reasonably computer-literate person who has not learned the product's internal architecture.

The audit answers four questions:

1. Can a new person understand where they are, what the product is for, and what they can do next?
2. Can they complete realistic tasks without guessing, backtracking, or learning inconsistent rules?
3. Does the interface remain coherent when data is empty, long, missing, loading, failing, or too numerous for the ideal mockup?
4. Does the product preserve its meaning and usable structure when the viewport changes from desktop to mobile?

This is not a formal accessibility-conformance audit. The focus is normal product use, visual design, interaction design, information architecture, responsive behavior, and the quality of the overall experience.

## Research foundation

The framework synthesizes four sources.

### Google Material Design

Material Design treats a UI as a coherent environment whose surfaces, hierarchy, states, and movement teach people how it works. Its three original principles are useful audit lenses:

- Material is the metaphor: layers, surfaces, seams, and elevation should make spatial relationships and interactivity understandable.
- Bold, graphic, intentional: typography, grids, space, scale, color, and imagery must create hierarchy, meaning, and focus.
- Motion provides meaning: transitions should preserve continuity, guide attention, and provide subtle feedback.

Material's current adaptive-layout guidance adds three useful structures: feeds for browsable collections, list-detail layouts for selection plus detail, and supporting panes for primary work plus secondary context. It also treats hover, pressed, selected, dragged, loading, error, and disabled as designed states rather than implementation leftovers.

Sources: [Material Design introduction](https://m2.material.io/design/introduction/), [Material canonical layouts](https://m3.material.io/foundations/layout/canonical-examples/overview), [Material interaction states](https://m3.material.io/foundations/interaction/states/overview), and [Material motion](https://m1.material.io/motion/material-motion.html).

### Don Norman, *The Design of Everyday Things*

Norman's central claim is that people should not be blamed for confusion created by a poor system image. The audit therefore looks for:

- Discoverability: can a person determine the possible actions?
- Signifiers: does the interface visibly indicate where and how to act?
- Mapping: is the relationship between a control and its result natural?
- Feedback: does the product make the result of an action apparent?
- Constraints: does the UI prevent invalid actions without creating unexplained dead ends?
- Conceptual models: does the product teach one coherent model that transfers from one page to another?
- Error tolerance: can people recover without losing time, context, or work?

Sources: [MIT Press book page](https://mitpress.mit.edu/9780262525671/the-design-of-everyday-things/), [Don Norman's book outline](https://jnd.org/books/the-design-of-everyday-things-revised-and-expanded-edition/), [Norman on signifiers](https://jnd.org/preface-design-of-everyday-things-revised-edition/), and [Norman on affordances and conceptual models](https://jnd.org/affordances-and-design/).

### Apple Human Interface Guidelines

Apple's guidance reinforces hierarchy, consistency, familiarity, direct feedback, recoverability, and adaptation across window sizes. For this audit, the most relevant expectations are:

- Use familiar concepts and platform conventions.
- Keep visuals and interactions consistent after establishing a pattern.
- Make controls clearly available or unavailable and show when content changes.
- Match feedback intensity to the importance of the event.
- Use alerts sparingly and only when interruption is justified.
- Use tab bars for top-level navigation and toolbars for actions on the current view.
- Prefer compact navigation on small screens and broader sidebars where space permits.
- Help people reverse mistakes or return to the previous state.

Sources: [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/), [design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles), [feedback](https://developer.apple.com/design/human-interface-guidelines/feedback), [alerts](https://developer.apple.com/design/human-interface-guidelines/alerts), [tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars), and [toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars).

### Michael Filipiuk, *UI Design Principles*

The supplied 323-page PDF was reviewed both as extracted text and as rendered pages. Its most useful operational guidance is:

- Design should become "invisible" by directing attention to the task rather than itself.
- A good interface is both usable and delightful; prettiness cannot compensate for task failure.
- Size, color, position, proximity, alignment, common regions, and figure-ground relationships create hierarchy.
- Use a repeatable grid and spacing scale; a soft 8-point desktop grid and 4-point mobile grid are useful starting points.
- Build a restrained type scale and preserve readable body text, line height, and line length.
- Important buttons should be more visually prominent than secondary or tertiary actions.
- Design every control state, not only the default state.
- Keep field labels visible, choose controls that match the data, and shorten forms where possible.
- Use simple, consistent icons; an unfamiliar icon still needs a text label.
- Cards need variants for different viewports and rules for long text, missing media, and irregular data.
- White space creates focus and grouping; it should not be filled merely because it is empty.
- Brand personality must be intentional and consistent in color, typography, shape, imagery, icons, and language.
- Button and modal microcopy should state the result of the action precisely.
- Navigation should keep the most important destinations visible and avoid overloading people with choices.
- Microinteractions should provide fast, subtle feedback, not delay the user for decoration.

## Company-wide design principles to evangelise

These principles should become product rules, review criteria, and shared vocabulary across design and engineering.

### 1. Start with the person's task

Every page needs a clear primary job. Every visual element must either help perform that job, explain its state, or provide necessary context. Decorative elements are welcome only when they do not compete with task completion.

Test question: within five seconds, can a person say what this page is for and what they should do first?

### 2. Make actions discoverable

Interactive elements must look interactive. Clickable cards, tabs, toolbar actions, row menus, and expandable regions need visible signifiers. Do not make essential behavior depend on hover, secret gestures, or prior product knowledge.

Test question: before clicking, can the person identify the likely actions and predict which element performs each one?

### 3. Use one coherent conceptual model

The same object, status, or action should be named, placed, and behaved consistently throughout a product. A pattern learned on one page should transfer to the next. Avoid one-off local inventions when an established product pattern exists.

Examples: a project should not become a workspace on another page; Edit should not sometimes open a modal and elsewhere start inline editing without a clear reason.

### 4. Give every action a visible result

Clicks need feedback. Saving, deleting, generating, importing, copying, moving, publishing, filtering, and switching tabs must visibly change state or produce a concise status message. Long-running work needs progress or a stable queued/running state.

Feedback should appear near the affected object when possible. Use a disruptive modal only when the event genuinely demands a decision.

### 5. Preserve control and recovery

People explore when the cost of mistakes is low. Provide Back, Cancel, Close, Undo, retry, and safe draft behavior where they are meaningful. Do not silently discard unsaved work. Destructive actions should identify the exact object and consequence.

### 6. One primary action per decision area

A page, card, modal, or form section can contain many actions, but its hierarchy should make one action primary at a time. Multiple equally prominent buttons turn prioritization into guesswork.

Primary, secondary, tertiary, and destructive actions must be visually distinct and used consistently.

### 7. Explain unavailable actions

Disabled controls often look broken. Prefer keeping an action available and explaining the missing requirement after interaction, or place a short reason beside it. If disabling is necessary, the UI must reveal why and what makes it available.

Several adjacent disabled buttons are a strong sign that the workflow, permission model, or progressive disclosure is poorly represented.

### 8. Use words and icons deliberately

Use an icon-only button when the action is universal, frequent, spatially constrained, and still unambiguous in context: close, search, play, pause, more, back, download, copy, or delete are typical candidates.

Use a text button when the action is novel, consequential, product-specific, or needs to state the result precisely. Add an icon to improve scanning only when it contributes meaning. Never replace a clear word with a clever but ambiguous symbol.

Repeated long text buttons in dense toolbars should be reviewed for familiar icon equivalents; obscure icon-only controls should be reviewed for visible labels.

### 9. Adapt the layout; do not amputate it

Mobile is not the desktop UI with arbitrary parts hidden. When space contracts, re-prioritize and recompose:

- Sidebar navigation can become a drawer or bottom/top-level navigation.
- Tables can become prioritized rows, horizontally scrollable data grids, or list-detail cards depending on the task.
- Supporting panes can stack below primary content or become a clearly labeled secondary view.
- Toolbars can retain high-frequency actions and move lower-frequency actions into a More menu.
- Long button rows can stack without reversing action order.

If text, context, filters, counts, status, or actions disappear, the mobile design must preserve the same meaning or provide an obvious route to it.

### 10. Let data shape the component

Components must be tested with real and adversarial data, not only ideal examples:

- zero, one, and many records;
- long names and descriptions;
- missing media and broken media;
- large counts and large numbers;
- unknown or stale status;
- loading, partial, failed, and permission-limited states;
- mixed aspect ratios;
- duplicate names;
- unbroken URLs and machine-generated text.

Cards should summarize one subject and remain modular. Use a table for genuinely comparable columnar data, not a pile of cards pretending to be a table. Avoid cards used only as decorative bordered boxes.

### 11. Hierarchy must survive decoration

The first-read order should come from position, size, weight, spacing, and controlled color. If every card has a badge, bright icon, gradient, shadow, subtitle, and two buttons, nothing is primary.

Use color as a scarce signal. Use elevation only to explain layering or interactivity. Keep backgrounds quieter than foreground content.

### 12. White space is structural

Spacing communicates grouping. Related label-value pairs should be closer to one another than to the next group. Page sections need enough separation to scan, while cards and forms should avoid inflated padding that wastes mobile space.

Use a small set of spacing tokens, normally based on 4-point increments with an 8-point rhythm for larger gaps. Visual rhythm matters more than mechanically applying the same gap everywhere.

### 13. Typography is an interface system

Use a restrained type scale and a small set of roles: page title, section title, card title, body, label, metadata, and code/data where needed. Do not create a new size or weight to solve each local layout problem.

As starting targets:

- Body and input text should normally be about 16-17 px on mobile and 15-17 px in desktop application surfaces.
- Explanatory text should use a comfortable line height, typically around 1.4-1.6.
- Long prose should normally remain near 50-75 characters per line.
- Tiny metadata should be used sparingly; shrinking text to fit an overloaded component is a design failure.

Subtitles earn their place only when they add orientation, consequence, or necessary context. Remove subtitles that merely restate the heading, describe an obvious control, or repeat the empty state below.

### 14. Forms should feel like one conversation

Keep labels visible. Match field width and control type to the expected data. Group related fields and separate unrelated sections. Ask only for information required at that stage.

Buttons should describe the result: Save changes, Create workflow, Import 12 posts, or Delete project. Avoid ambiguous labels such as Submit, Yes, OK, or Continue when a more precise verb is available.

Validation should preserve what the person entered, identify the exact field, explain the issue in plain language, and suggest the correction.

### 15. Modals are interruptions, not miniature websites

Use a modal for a focused, bounded decision or task that benefits from preserving the parent context. Avoid using a modal merely because routing is inconvenient.

Every modal needs:

- a concise, unique title;
- an obvious and consistently positioned close or cancel path;
- a stable primary-action area;
- enough context to understand what is being changed;
- predictable dismissal behavior;
- clear handling of unsaved work;
- a layout that fits the viewport without hiding the title or actions.

Tabs within a modal are acceptable when they divide peer views of one task. A button that opens another modal creates a deeper layer and must preserve a clear return path. Repeated modal nesting is a design smell and should be documented as a hierarchy problem even when technically functional.

### 16. Movement should explain continuity

Motion should show where content came from, where it went, or what changed. Use immediate pressed/selected feedback and short transitions. Material guidance places many small transitions around 150-200 ms and larger mobile transitions around 300-400 ms.

Avoid long staged animations, unrelated elements moving in different directions, and spinners that replace useful status. A user should not have to wait for decorative motion to finish.

### 17. Personality must be coherent

Color saturation, typography, corner radius, icon style, imagery, tone of voice, density, and motion together create the product's personality. Decide whether the product should feel neutral, technical, playful, premium, editorial, or another intentional character, then apply that choice consistently.

Polish is not extra decoration. It is consistent alignment, spacing, proportions, rhythm, component states, and language.

### 18. Evidence beats preference

"Ugly," "clean," and "modern" are conclusions, not evidence. Every finding must describe the observed interface, the attempted task, the friction it created, and the expected design behavior. Recommendations must connect to a user outcome.

## Visual and component review standards

### Layout and grid

For each surface, record:

- viewport and responsive breakpoint;
- outer margins and maximum content width;
- column, pane, rail, sidebar, header, and footer structure;
- alignment anchors;
- horizontal and vertical gaps;
- fixed, sticky, absolute, and scrolling regions;
- overflow behavior;
- whether the layout is feed, list-detail, supporting pane, dashboard, editor canvas, form, or another structure;
- how the structure changes when data or viewport size changes.

Flag:

- accidental asymmetry;
- unrelated elements aligned as if related;
- related elements split across regions;
- controls detached from the object they affect;
- excessive empty canvas with no deliberate focus;
- dense areas beside wasteful empty areas;
- content clipped under fixed chrome;
- nested independent scroll regions;
- mobile horizontal overflow without clear intent.

### Color, surface, and elevation

Record the approximate surface hierarchy: page background, navigation surface, card/panel surface, modal scrim, modal surface, primary accent, secondary accent, and semantic status colors.

Flag:

- too many competing accent colors;
- semantic colors reused decoratively;
- shadows on nearly every object;
- borders plus shadows plus tinted fills serving the same separation purpose;
- backgrounds that compete with content;
- selected and unselected states that are difficult to distinguish;
- disabled styles indistinguishable from loading or unavailable data.

### Typography and content hierarchy

Record font family, approximate size, weight, line height, case, color, and truncation behavior for each text role.

Flag:

- titles visually weaker than subtitles or badges;
- several near-duplicate text styles;
- tiny labels used to fit overloaded controls;
- excessive all-caps or letter spacing;
- single-line truncation where the hidden content matters;
- subtitles that repeat headings or obvious page purpose;
- unclear terminology, internal jargon, or the same concept with multiple names;
- paragraphs spanning overly wide application canvases.

### Navigation

For each navigation level, record position, size, labels, icons, selected state, counts/badges, ordering, persistence, and responsive transformation.

Flag:

- top-level destinations that disappear on mobile;
- actions placed in navigation or navigation placed among actions;
- selected state conveyed weakly or inconsistently;
- duplicate routes with different labels;
- hidden navigation for high-frequency destinations;
- too many peer choices with no grouping;
- browser Back producing an unexpected state;
- tabs that reset data or scroll position without warning.

### Buttons and toolbars

Record label, icon, role, position, dimensions, prominence, state, and the object affected.

Flag:

- multiple primary buttons in one decision area;
- several adjacent disabled buttons;
- enabled-looking controls that do nothing;
- vague button text;
- destructive actions styled like routine actions;
- wordy repeated buttons that a familiar icon could replace;
- unfamiliar icon-only buttons;
- inconsistent icon size, stroke, or corner style;
- button groups that reverse order between pages or viewports;
- close buttons moving from left to right without a platform or hierarchy reason.

### Forms and settings

Record field order, grouping, labels, hints, defaults, required state, control type, validation, save behavior, and dependency rules.

Flag:

- placeholder-only labels;
- instructions separated from their fields;
- unrelated fields sharing a row;
- long dropdowns without search;
- short option sets hidden in dropdowns;
- switches that require a separate Save without making that dependency clear;
- autosave and manual-save patterns mixed in one surface;
- fields disabled without explanation;
- Save enabled before anything changed or disabled after a meaningful change;
- losing input after validation or navigation.

### Cards, lists, tables, and data grids

Record the subject, data fields, actions, status, media ratio, dimensions, column behavior, sorting/filtering, selection, pagination, and empty/loading/error behavior.

Flag:

- cards with no clear subject or click target;
- every card repeating non-distinguishing content;
- excessive nested cards;
- variable card heights caused by unmanaged text;
- action buttons jumping position between cards;
- missing-media collapse;
- truncation hiding the only distinguishing data;
- tables converted to mobile cards that omit important columns with no detail route;
- numeric data aligned inconsistently;
- filters and result counts disagreeing;
- empty states occupying a data grid while stale controls remain enabled.

### Modals, drawers, popovers, and nested flows

Record:

- trigger and parent surface;
- title and purpose;
- dimensions and viewport fit;
- header, body, tabs, footer, and action layout;
- close/cancel/back positions;
- scroll container;
- initial data and loading behavior;
- dirty-state behavior;
- every tab and button that changes the layer or opens another layer;
- the state returned to after dismissal.

Flag:

- inconsistent close location or icon;
- title/actions scrolling out of view;
- double scrollbars;
- background still appearing interactive;
- modal wider than mobile viewport;
- footer actions obscured by mobile browser chrome or keyboard;
- a modal that contains a complete multi-page application;
- nested modals with no visible depth or Back model;
- Cancel meaning "discard" in one place and "close safely" elsewhere;
- a terminal modal with tabs or actions that secretly open additional layers.

### Empty, loading, success, failure, and permission states

Every meaningful data surface must be observed in all reachable states.

Flag:

- blank space that looks broken;
- skeletons that do not resemble the loaded structure;
- spinner with no task identity during a long operation;
- success that produces no visible change;
- error text without a retry or next step;
- permission-limited controls mixed with ordinary disabled controls;
- stale data displayed as current;
- optimistic updates that revert without explanation.

## Responsive audit protocol

### Reference viewports

Primary desktop test: 1440 x 900 CSS pixels.

Primary mobile test: 390 x 844 CSS pixels.

Compact-mobile spot check: 360 x 800 CSS pixels when a layout is dense, modal-heavy, or horizontally constrained.

The exact breakpoint is less important than confirming behavior immediately above and below each actual layout transition.

### Desktop-to-mobile comparison

For every root page, tab page, and modal, compare:

| Question | Desktop observation | Mobile observation | Design consequence |
| --- | --- | --- | --- |
| What remains visible? |  |  |  |
| What moves? |  |  |  |
| What stacks? |  |  |  |
| What becomes scrollable? |  |  |  |
| What is hidden? |  |  |  |
| Where did hidden meaning/action go? |  |  |  |
| Does action priority change? |  |  |  |
| Do labels truncate or wrap? |  |  |  |
| Does navigation preserve location? |  |  |  |
| Do overlays fit and dismiss predictably? |  |  |  |
| Does the data remain comparable and understandable? |  |  |  |

Hiding is acceptable only for redundant decoration, low-frequency actions moved to an obvious menu, or secondary information available through a clear detail route. Hiding status, primary actions, field labels, distinguishing data, or orientation cues is a finding.

## Production user-test method

### Test participant model

The evaluator behaves like a normal first-time or infrequent user:

- reasonably comfortable with modern web and mobile applications;
- unfamiliar with repository structure, internal names, database schema, and intended implementation;
- willing to explore visible controls but not guess hidden routes;
- expects common browser and platform conventions to work;
- uses realistic production data and does not rely on source-code knowledge while completing a task.

Code and documentation may be inspected after the interaction to explain observed behavior, but they cannot be used to excuse a discoverability failure.

### Pre-test deployment gate

For each project:

1. Identify the canonical production URL and current deployed revision.
2. Inspect the production worktree, current branch, upstream relationship, uncommitted changes, build state, and deployment mechanism.
3. Determine whether changes are genuinely undeployed, not merely uncommitted documentation or unrelated experiments.
4. Build and run the project's relevant verification before deployment.
5. Deploy only the intended current product state using the project's established production path.
6. Verify the resulting production URL, revision, health, and initial page before auditing.
7. Record any reason deployment could not safely proceed.

### Exploration sequence

For each project and viewport:

1. Arrival: load the production root and observe the first screen before interaction.
2. Orientation: identify product, current location, primary action, navigation model, account/workspace context, and visible system status.
3. Top-level traversal: open every reachable top-level navigation destination.
4. Page traversal: inspect tabs, cards, lists, row actions, filters, sort, search, pagination, and toolbar actions.
5. Overlay traversal: open every modal, drawer, popover, and menu reachable without causing an unsafe external side effect.
6. Recursive traversal: follow every tab or button inside an overlay that opens another meaningful state or overlay.
7. Data-state traversal: inspect empty, populated, loading, error, success, disabled, and permission-limited states when safely reachable.
8. Task tests: complete representative create, inspect, edit, organize, and recover tasks using production-safe test data where appropriate.
9. Responsive repeat: repeat the entire hierarchy on mobile, not merely the root page.
10. Cross-check: compare desktop/mobile structure and patterns used elsewhere in the same product and across the four-product suite.

No destructive production action is completed merely to see a confirmation. The confirmation layer can be inspected and canceled unless the user has explicitly authorized the final action and test data makes it safe.

### Observation discipline

An observation must separate fact, interpretation, and recommendation.

- Fact: "At 390 px, the workflow status and owner are removed from each card; only the title remains."
- Interpretation: "Cards with similar titles are no longer distinguishable, so selecting the intended workflow requires opening them one by one."
- Recommendation: "Keep status as a compact chip and owner as one metadata line, or provide a list-detail route that preserves those fields."

Avoid unsupported statements such as "the mobile cards are ugly."

### User-test log

Every tested task uses this structure:

```md
## Test: <task name>

- Project:
- Production URL:
- Date/time:
- Viewport:
- Starting state:
- Test data/account context:
- Goal:

### What I did

1. ...
2. ...

### What I expected

...

### What happened

...

### Observations

- ...

### Result

- Outcome: completed / completed with friction / blocked / failed
- Time or interaction count when useful:
- Wrong turns:
- Unclear decisions:
- Data or work lost:

### Design implication

Explain how the result changes or validates the design. Connect the observation to discoverability, mapping, feedback, consistency, hierarchy, responsive adaptation, or another framework principle.
```

## UI documentation hierarchy

The documentation mirrors the interface recursively:

```text
Project root
└── Top-level tab/page
    ├── Page state or sub-tab
    │   ├── Modal/drawer/popover
    │   │   ├── Modal tab
    │   │   │   └── Deeper modal or state
    │   │   └── Button leading to deeper modal
    │   └── Terminal modal/state -> its own Markdown file
    └── Another page state
```

A terminal modal is a modal or overlay state with no tab or action that opens another meaningful modal layer. Each terminal modal becomes a Markdown file. Non-terminal modals receive an index file describing their common shell and linking to descendant states.

Menus containing only immediate commands are documented with their parent surface. A menu that contains substantial state, configuration, or navigation is documented as an overlay node.

### Naming convention

Use stable, readable slugs based on user-visible labels:

```text
docs/ui/
  index.md
  <top-level-page>/
    index.md
    <page-tab>/
      index.md
      <modal-name>/
        index.md
        <terminal-state>.md
```

If two states share the same visible label, qualify by parent or result rather than using implementation names.

## Page documentation template

```md
# <Visible page or state name>

## Purpose

What a normal person uses this surface to accomplish.

## Entry points

- Parent route/state:
- Visible trigger:
- URL when applicable:

## Layout

### Desktop

- Viewport tested:
- Major regions and order:
- Position, dimensions, spacing, and scrolling:
- Color, surface, typography, and elevation:

### Mobile

- Viewport tested:
- Recomposition:
- Hidden or moved content/actions:
- Scrolling and sticky regions:

## Elements

| Element | Position and approximate size | Visual treatment | Purpose | Data interaction | States |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Data behavior

- Empty:
- One record:
- Many records:
- Long/missing data:
- Loading:
- Failure:
- Permission/unavailable:

## Interaction tree

- Tab/button -> child state or modal

## User tests

Link or include the tests performed from this surface.

## Findings

| ID | Severity | Observation | Normal-person impact | Recommendation |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Evidence

- Screenshot or exact visible state:
- Production revision/deployment:
- Tested date:
```

## Terminal modal documentation template

```md
# <Modal name>

## Parent path

`Project -> page -> tab/state -> modal -> this modal`

## Purpose and trigger

...

## Desktop shell

- Position:
- Approximate width/height:
- Header/title/close control:
- Body and scroll behavior:
- Footer/actions:
- Scrim/background relationship:

## Mobile shell

- Position and viewport fit:
- Full-screen, sheet, or centered behavior:
- Header/title/close control:
- Body and keyboard/scroll behavior:
- Footer/actions:

## Elements and data

| Element | Position/size/color | Purpose | Data dependency | Enabled/disabled/loading/error behavior |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Dismissal and recovery

- Close icon:
- Cancel/Back:
- Outside click:
- Escape/browser Back:
- Unsaved changes:
- Returned focus/state:

## User-test observation

What was attempted, what happened, and what the result implies for design.

## Findings

...
```

## Finding severity and priority

Severity measures user impact, not implementation effort.

### P0 - Task impossible or dangerous

- A core task cannot be completed.
- The UI causes data loss, wrong-target destructive action, or silent corruption.
- Mobile removes the only route to essential functionality.
- A modal traps the person with no reliable exit.

### P1 - Major friction or misleading behavior

- A common task is technically possible but requires guessing, repeated wrong turns, or undocumented workarounds.
- Control mapping or feedback makes the outcome seriously ambiguous.
- Desktop and mobile expose materially different capabilities without explanation.
- Several pages teach conflicting rules for the same action.

### P2 - Noticeable usability or visual-structure problem

- Hierarchy is unclear but the task remains discoverable.
- Data cards, forms, or toolbars are hard to scan.
- Important context is truncated, hidden, or visually weak.
- Disabled states, subtitles, action density, modal layout, or card formatting create recurring friction.

### P3 - Polish and consistency issue

- Small spacing, sizing, alignment, color, icon, wording, or motion inconsistency.
- The issue does not block understanding by itself but weakens product quality or compounds other issues.

### Positive validation

The audit also records patterns that work well. A successful task test can validate a design decision, justify standardizing the pattern, and prevent a later redesign from removing useful clarity.

## Cross-product consistency review

The four products are audited individually first, then compared as a suite.

Compare:

- logo/product identity and account location;
- desktop sidebar/header structure;
- mobile navigation model;
- page title and subtitle treatment;
- primary/secondary/destructive button styles;
- close, Back, Cancel, and Save positions;
- modal width, header, footer, and nesting behavior;
- tabs and selected-state treatment;
- card surface, radius, shadow, padding, and action placement;
- empty/loading/error/success language;
- icon family and use of icon-only actions;
- form labels, hints, validation, and save behavior;
- status chips and semantic colors;
- tables, filters, search, sort, and pagination;
- responsive hiding and overflow conventions.

Shared patterns should be standardized when the products have the same interaction need. Differences are acceptable when the domain requires them, but the reason must be visible to the user rather than existing only in implementation history.

## Deliverables and communication of results

The final documentation set includes:

1. This framework.
2. A project UI map for each product.
3. Desktop and mobile documentation for every reachable page and nested state.
4. A Markdown file for each terminal modal.
5. User-test logs describing what was done, what happened, and how the result informs design.
6. A prioritized findings list for each project.
7. A cross-product consistency report.
8. A short company-wide design-principles summary suitable for reviews and onboarding.

Each project summary leads with observed outcomes:

- tasks completed cleanly;
- tasks completed with friction;
- tasks blocked or failed;
- strongest patterns worth preserving;
- highest-impact design changes;
- responsive capability gaps;
- inconsistencies within the product and across the suite.

The report distinguishes direct production observations from source-code inference and states when a state could not be safely or legitimately reached.

## Framework limitations

This is an expert walkthrough and structured first-use test, not a substitute for moderated research with representative customers. It can identify strong usability risks, visual inconsistencies, and responsive failures, but it cannot by itself prove frequency across the user population.

Recommended follow-up for high-impact changes:

- recruit three to five representative users for the affected workflow;
- give them outcome-based tasks without coaching;
- record completion, wrong turns, hesitation, and interpretation;
- compare results before and after the change;
- instrument production funnels for abandonment, repeated errors, and retry behavior.

The design implication should remain evidence-based: change the interface because observed behavior shows a problem or opportunity, not merely because a reviewer prefers a different style.
