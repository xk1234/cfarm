---
title: "The testing facility"
description: "Moved to LumenLab, which now owns workflow experiments across connected applications."
---

# The testing facility

The user-facing Testing Facility now lives in
[LumenLab](https://lumenlab-one.vercel.app/testing).

cfarm remains the LumenClip execution provider. Its preview engine and MCP tools
stay here so LumenLab can discover dimensions and run safe, non-publishing
experiments through:

- `lumenclip_automation_experiment_dimensions`
- `lumenclip_automation_experiment_run`

The former cfarm route `/app/testing` redirects to LumenLab. cfarm no longer
ships a second testing UI or a second copy of the workflow documentation.

The canonical workflow, trace contract, mobile behavior, and provider-extension
rules are documented in LumenLab under **Test an application workflow**.
