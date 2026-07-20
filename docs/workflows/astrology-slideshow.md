---
title: "Create an astrology slideshow from a blank automation [User]"
description: "Build a seven-slide astrology automation from the blank slideshow option, generate a draft, review it, and export the PNGs."
---

## Outcome

Starting from **New slideshow automation**, you create a reusable seven-slide
astrology format, add relevant media and hooks, generate an unpublished draft,
review all slides, and export the PNGs.

This workflow was verified in Chrome on July 17, 2026. The completed run created
**Sun, Moon & Rising: Why They Differ** with seven slides, no scheduled date,
and **Not published** status.

## Before you start

- Prepare a captioned image collection with at least seven vertical astrology
  images: birth charts, constellations, zodiac symbols, planets, or night skies.
- Use one visual theme so randomly selected images still look like one series.
- Do not connect or schedule an account for this walkthrough. A manual
  generation should remain unpublished and unscheduled.

> **Verified limitation:** the local app had no dedicated astrology collection.
> Creating one from the slideshow collection picker selected seven suitable
> Pinterest images, but saving failed because the backend bulk-write guard
> treated the addition as deletion of all 41 existing collections. The verified
> run therefore used the existing **Pinterest - blurry night love photos**
> collection. This is sufficient to test the workflow, but a dedicated
> astrology collection is required for production quality. The failure is
> tracked in the [workflow-gap backlog](/docs/roadmap/workflow-gaps).

## 1. Start with the blank slideshow automation

1. Select **New Automation** in the sidebar.
2. Keep the **Slideshow** tab selected.
3. Select **New slideshow automation**. Do not choose **Add** on an existing
   template card.

![Automation template picker with New slideshow automation selected as the blank starting point](/docs/workflows/astrology-blank-01-template-picker.jpg)

_The blank option creates a user-owned automation without importing another template's topic, hooks, or visual direction._

## 2. Name the blank automation

1. Select the edit icon beside **Untitled automation**.
2. Enter **Astrology Basics Slideshow**.
3. Press **Enter** to save the name.

![New untitled automation ready to be renamed](/docs/workflows/astrology-blank-02-created.jpg)

_Name it before editing so generated outputs and download files are easy to identify._

## 3. Open the blank slideshow format

1. Select **Slideshow Format**.
2. Confirm the blank canvas contains one hook and three content slides.
3. Keep text enabled for the hook, content, and final CTA.

![Blank slideshow format editor showing hook and content sections](/docs/workflows/astrology-blank-03-format-editor.jpg)

_The format editor controls the reusable slide structure; it does not generate the final copy yet._

## 4. Assign the image collection

1. On **Hook**, select **Select collection**.
2. Search for the prepared astrology collection.
3. Select it, then repeat for **Content**.
4. Use the same collection for the CTA unless the last slide needs a dedicated
   branded image.

![Collection picker filtered to the existing night-image collection used for verification](/docs/workflows/astrology-blank-04-collection.jpg)

_The screenshot shows the verified fallback collection. Use a captioned astrology collection for real publishing._

## 5. Build a seven-slide structure

1. Open **Content**.
2. Change **Slide count** to `5`.
3. Confirm the canvas now contains one hook and five content slides.
4. Enable **AI image matching** only when the collection captions are accurate.

![Content section configured with five slides and one shared collection](/docs/workflows/astrology-blank-05-content-structure.jpg)

_Hook + five content slides + CTA produces the seven-slide format used in the verified run._

## 6. Set the content direction

1. Select the edit icon on the first content slide.
2. In **Content direction**, enter:

   ```text
   Explain one astrology concept for beginners in one concise sentence. Across
   the five slides cover the definition, birth details needed, how astrologers
   interpret it, a useful comparison, and how to find it in a birth chart.
   Frame claims as astrology, not scientific fact; do not predict events.
   ```

3. Keep one readable text block per content slide.

![Content text editor containing the astrology generation direction](/docs/workflows/astrology-blank-06-content-direction.jpg)

_This direction makes the five generated slides pay off the hook in a deliberate sequence._

## 7. Enable and direct the CTA

1. Open **CTA** and enable **Enable CTA**.
2. Confirm it inherits the chosen collection.
3. Edit its text direction to:

   ```text
   End with a low-friction CTA: save this for your next birth-chart reading or
   share it with a friend learning astrology. Use 5-10 words.
   ```

4. Select **Save Changes**.

![Enabled CTA slide with a specific astrology save-and-share direction](/docs/workflows/astrology-blank-07-cta.jpg)

_The enabled CTA becomes slide seven._

## 8. Add reusable astrology hooks

1. Open **Hooks & Style**, then **Hooks**.
2. Replace any instruction-like placeholder with one real hook per line:

   ```text
   what your rising sign says about your first impression
   why your sun moon and rising signs feel so different
   the four elements in astrology explained simply
   ```

3. Keep hook casing intentional; the verified run used mixed casing.

![Hooks editor containing three reusable astrology hooks](/docs/workflows/astrology-blank-08-hooks.jpg)

_Each manual run selects one hook, so every hook must support the same five-slide educational structure._

## 9. Set the writing style

1. Open **Style**.
2. Set **Tone** to **Educational & Informative**.
3. Enter this slideshow writing style:

   ```text
   Teach one beginner astrology concept per slideshow. Use plain language, one
   idea per slide, and qualify interpretations as astrology rather than
   scientific fact. The hook must be paid off by the five body slides. Avoid
   predictions, certainty, jargon, and generic filler. End with a specific
   save-or-share CTA.
   ```

4. Select **Save Changes**.

![Style editor configured for educational beginner astrology content](/docs/workflows/astrology-blank-09-style.jpg)

_The shared style governs voice and quality; section directions still control what each slide must accomplish._

## 10. Generate an unpublished draft

1. Select **Generate**.
2. Confirm the new result card displays **Generating**.
3. Wait until it changes to **Not published**.
4. Verify the manual run has no publication date.

![Astrology slideshow card while generation is in progress](/docs/workflows/astrology-blank-10-generating.jpg)

![Completed astrology slideshow card with Not published status](/docs/workflows/astrology-blank-11-draft-ready.jpg)

_The verified generation completed as “Sun, Moon & Rising: Why They Differ.”_

## 11. Review and export the slideshow

1. Open the completed result.
2. Read all seven slides in order. Confirm the hook is paid off, claims remain
   qualified, and each image supports the slide.
3. Review the title, description, and hashtags under **Publishing details**.
4. Keep the status **Not published** while editing.
5. Select **Export PNGs**. The verified export created
   `sun-moon-rising-why-they-differ.zip`.

![Generated slideshow viewer with the first astrology slides and publishing details](/docs/workflows/astrology-blank-12-review.jpg)

![Final save-and-share CTA in the completed seven-slide astrology slideshow](/docs/workflows/astrology-blank-13-final-slide.jpg)

_Exporting creates the posting files but does not publish or mark the output published._

## Success check

- The automation was created from **New slideshow automation**, not a catalog
  template.
- Its reusable format contains one hook, five content slides, and one CTA.
- It has at least three real astrology hooks and an educational writing style.
- The generated output contains seven coherent slides.
- The result remains **Not published** and has no automatic publish date.
- **Export PNGs** produces a ZIP containing the slideshow images.
