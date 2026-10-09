import { isRecord } from "@/lib/guards"

export type WorkflowTextPatch = {
  path: string
  selectionStart: number
  selectionEnd: number
  selectedText: string
  replacement: string
}

export function applyWorkflowTextPatch(
  value: unknown,
  patch: WorkflowTextPatch
) {
  const cloned = structuredClone(value)
  const segments = jsonPointerSegments(patch.path)
  if (segments.length === 0) {
    throw new WorkflowTextPatchError(
      400,
      "Select a prompt field before forking"
    )
  }
  let parent: unknown = cloned
  for (const segment of segments.slice(0, -1)) {
    parent = childAt(parent, segment)
  }
  const key = segments.at(-1)!
  const current = childAt(parent, key)
  if (typeof current !== "string") {
    throw new WorkflowTextPatchError(
      400,
      "The selected workflow value is not text"
    )
  }
  if (
    current.slice(patch.selectionStart, patch.selectionEnd) !==
    patch.selectedText
  ) {
    throw new WorkflowTextPatchError(
      409,
      "The original prompt changed. Select the passage again before running variations."
    )
  }
  const next =
    current.slice(0, patch.selectionStart) +
    patch.replacement +
    current.slice(patch.selectionEnd)
  assignChild(parent, key, next)
  return cloned as Record<string, unknown>
}

export function workflowTextAtPath(value: unknown, path: string) {
  const segments = jsonPointerSegments(path)
  if (segments.length === 0) {
    throw new WorkflowTextPatchError(
      400,
      "Select a prompt field before forking"
    )
  }
  let current = value
  for (const segment of segments) current = childAt(current, segment)
  if (typeof current !== "string") {
    throw new WorkflowTextPatchError(
      400,
      "The selected workflow value is not text"
    )
  }
  return current
}

function jsonPointerSegments(path: string) {
  if (!path.startsWith("/")) return []
  return path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))
}

function childAt(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= value.length) {
      throw invalidPath()
    }
    return value[index]
  }
  if (!isRecord(value) || !(key in value)) throw invalidPath()
  return value[key]
}

function assignChild(value: unknown, key: string, next: string) {
  if (Array.isArray(value)) {
    value[Number(key)] = next
    return
  }
  if (!isRecord(value)) throw invalidPath()
  value[key] = next
}

function invalidPath() {
  return new WorkflowTextPatchError(400, "The selected prompt path is invalid")
}

export class WorkflowTextPatchError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "WorkflowTextPatchError"
  }
}
