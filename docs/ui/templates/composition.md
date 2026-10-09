---
title: "Composition and publish gates"
description: "Feeding generated outputs into templates or turning them into posts."
---

# Composition and publish gates

Composition happens before publication. Any draft slideshow, video, or text output can be selected
as input to another compatible template. The next generation records both the processor template
and its source outputs.

```json
{
  "templateId": "astrology-slideshow",
  "inputOutputIds": ["research-text-output"],
  "outputIds": ["generated-slideshow"],
  "status": "ready"
}
```

Outputs remain composable until they enter a publish gate. The gate owns destination-specific
fields such as caption, description, hashtags, accounts, and publish timing.

```json
{
  "outputIds": ["generated-slideshow", "caption-text-output"],
  "metadata": {
    "caption": "Which one are you?",
    "description": "A comparison of two zodiac mindsets.",
    "hashtags": ["astrology", "zodiac"]
  },
  "selectedAccountIds": ["threads-account"],
  "mode": "draft"
}
```

The gate resolves ordered images or video plus any selected text output and creates one publishable
post per destination. Draft, schedule, and publish-now are post states; they are not output states.
