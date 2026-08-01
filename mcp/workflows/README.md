# Workflows

The workflow tools compose the existing LumenClip MCP tools without creating a
second execution path. A workflow step is any callable non-workflow tool in the
registry. It keeps the selected tool's original input validation, owner scope,
confirmation gates, idempotency behavior, and provider side effects.

## Run a complete workflow

Call `lumenclip_workflow_run` with an ordered list of up to 20 steps. Each step
has a caller-defined unique `id`, a LumenClip `tool`, and that tool's normal
`arguments`.

```json
{
  "workflowId": "generate-and-validate-slideshow",
  "steps": [
    {
      "id": "generate",
      "tool": "lumenclip_automation_run",
      "arguments": {
        "automationId": "automation-123",
        "requestId": "campaign-2026-08-01"
      }
    },
    {
      "id": "validate",
      "tool": "lumenclip_output_validate",
      "arguments": {
        "outputId": { "$ref": "generate", "path": "outputs.0.id" }
      }
    }
  ]
}
```

The result includes ordered per-step outputs and a workflow status:

- `succeeded`: every requested step completed.
- `stopped`: a step failed and later steps were not attempted.
- `failed`: one or more steps failed and there were no unattempted steps.

Workflows stop on the first failure by default. Set `continueOnError: true` only
for later steps that are genuinely independent. A reference to a failed or
missing step always fails closed.

## Pipe results between steps

An exact object with `$ref` and optional `path` is replaced before the selected
tool validates its arguments:

```json
{ "$ref": "generate", "path": "outputs.0.id" }
```

- `$ref` is an earlier step ID.
- `path` is an optional dot-separated path through that step's structured MCP
  output. Numeric array indexes are supported.
- Omitting `path` passes the entire structured output.
- Forward references, missing paths, and outputs from failed steps are errors.

References can appear at any depth inside objects or arrays.

## Run one individual step

Call `lumenclip_workflow_step_run` when a client wants the same workflow-step
contract without constructing a multi-step workflow:

```json
{
  "tool": "lumenclip_automation_run",
  "arguments": {
    "automationId": "automation-123",
    "requestId": "campaign-2026-08-01"
  }
}
```

The response wraps the selected tool's structured output with the tool name and
`status: "succeeded"`.

## Safety and execution rules

- Workflow tools cannot invoke themselves, directly or indirectly.
- Unknown, proposed, disabled, or unregistered tools are rejected.
- Each step is parsed through the original Zod input schema before execution.
  A workflow cannot bypass `confirmPublish`, `confirmDelete`, `confirmLink`, or
  other literal confirmation fields.
- Publishing is never appended automatically. A caller must include the
  publishing tool as an explicit step with its normal confirmation fields.
- The workflow executor does not retry steps. Use the selected tool's stable
  idempotency key when retrying a workflow.
- Partial results are returned when a later step fails, making safe resume
  possible with a new workflow containing only the remaining steps.

## Long-running steps

Asynchronous tools such as `lumenclip_ugc_generate` return an operation. A
single workflow call does not wait or sleep for that operation. Run the queueing
step, then call `lumenclip_operation_get` separately or in a later workflow
after the advertised polling interval.

This is deliberate: workflow composition does not change the lifecycle of the
underlying MCP tools.

## Tool contracts

| Tool                          | Availability | Purpose                                                                           |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------- |
| `lumenclip_workflow_run`      | Implemented  | Execute an ordered graph of existing MCP tools with structured-output references. |
| `lumenclip_workflow_step_run` | Implemented  | Execute one existing MCP tool through the same validated step contract.           |

The callable tool list in [the tool index](../tool-index.md) remains the source
of truth for tools that can be selected as steps.
