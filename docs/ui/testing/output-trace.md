---
title: Output trace
description: Inspect every persisted input and output behind one generated slideshow.
---

Route: `/share/workflows/[outputId]?token=...`

## Layout

`components/realfarm/public-workflow-trace.tsx` owns the signed public workflow
viewer. It presents the production slideshow pipeline as an ordered set of 16
expandable stages. Every stage contains an Input and Output panel, provider and
stage-kind metadata, execution status, and a reconstructed marker when a
historical run did not persist the transient intermediate value. Workflow input
and final output remain pinned in a desktop side rail and flow below the stages
on smaller screens.

The visual view is the default. Raw JSON exposes the complete trace contract,
including custom prompt configuration, the exact retained provider prompt,
selected media identities, rendered outputs, and QA. The signed token is scoped
to one owner and slideshow output and is shared with the existing slideshow
preview and download links.

## Interactions

Opening a Recent slideshow exposes a Workflow action in the viewer header. The
public trace can switch between visual and raw JSON modes, copy the full JSON,
expand any stage, and return to the signed slideshow preview.

## MCP coverage

Yes. `lumenclip_workflow_trace_get` returns the complete ordered trace and
signed visual URL. `lumenclip_workflow_stage_get` returns one addressed stage
with the same input and output shown in the viewer. Existing
`lumenclip_pipeline_stage_run` and `lumenclip_pipeline_run` remain the execution
surfaces for rerunning an individual registered stage or a suffix of the named
pipeline.
