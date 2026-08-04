import { Callout } from "fumadocs-ui/components/callout"

export function StageShorthand() {
  return (
    <Callout type="info" title="Stage output shorthand">
      In the JSON examples on this page,{" "}
      <code>{`"...output": "stage-N output"`}</code> is documentation shorthand
      for spreading the complete preceding stage output into the next stage
      input. It is not a literal runtime field.
    </Callout>
  )
}
