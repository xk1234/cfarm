import { describe, expect, it } from "vitest"

import {
  applyWorkflowTextPatch,
  WorkflowTextPatchError,
} from "./workflow-text-patch"

describe("applyWorkflowTextPatch", () => {
  it("replaces only the selected prompt passage without mutating the source", () => {
    const source = {
      model: "example/model",
      messages: [
        { role: "system", content: "Keep this unchanged" },
        { role: "user", content: "Before. Change only this. After." },
      ],
    }
    const selectedText = "Change only this"
    const selectionStart = source.messages[1].content.indexOf(selectedText)
    const result = applyWorkflowTextPatch(source, {
      path: "/messages/1/content",
      selectionStart,
      selectionEnd: selectionStart + selectedText.length,
      selectedText,
      replacement: "Use this variation",
    })

    expect(result).toEqual({
      model: "example/model",
      messages: [
        { role: "system", content: "Keep this unchanged" },
        { role: "user", content: "Before. Use this variation. After." },
      ],
    })
    expect(source.messages[1].content).toBe("Before. Change only this. After.")
  })

  it("rejects stale selections instead of patching the wrong text", () => {
    expect(() =>
      applyWorkflowTextPatch(
        { messages: [{ content: "Current prompt" }] },
        {
          path: "/messages/0/content",
          selectionStart: 0,
          selectionEnd: 3,
          selectedText: "Old",
          replacement: "New",
        }
      )
    ).toThrowError(WorkflowTextPatchError)
  })
})
