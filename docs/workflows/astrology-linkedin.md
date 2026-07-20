---
title: "Create an astrology LinkedIn automation and generate a post [User]"
description: "Current availability and intended user workflow for persistent LinkedIn text automation."
---

> **Not currently available.** Do not follow internal API examples as a
> substitute for a user workflow.

## What exists today

- LinkedIn can be selected as a publishing destination for compatible slideshow
  and video automations.
- Provider-specific LinkedIn visibility settings exist.
- `POST /api/linkedin-automations/generate` can generate stateless preview posts
  for internal testing.

## What is missing

- **New LinkedIn automation** in **Other social media**.
- An owner-scoped persistent LinkedIn automation store.
- A LinkedIn editor for niche, strategy, voice, proof, hooks, schedule, and
  account selection.
- Generated-run history and a LinkedIn-native preview.
- Scheduler/job integration and per-run PostFast publishing.

![Other social media currently has X and Threads but no LinkedIn automation](/docs/workflows/social-text-01-platform-choice.jpg)

## Intended workflow after implementation

1. Open **New automation** → **Other social media** → **New LinkedIn
   automation**.
2. Set the niche to `astrology education for beginners`.
3. Generate a reusable audience and content-pillar brief.
4. Add proof or source material when using personal-result or number-based hook
   archetypes.
5. Enter a topic such as `Why exact birth time matters when reading a chart`.
6. Generate a draft and review the first 200 characters for the LinkedIn fold.
7. Select a LinkedIn account and visibility.
8. Publish now or schedule through the same lifecycle used by other text
   automations.

Implementation is tracked under **LinkedIn automation product surface** in the
[roadmap](/docs/roadmap).
