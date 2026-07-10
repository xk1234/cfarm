import { describe, it } from "vitest"
import { readFileSync } from "node:fs"
import { automationTemplateToTempSlideTestingAutomation, getTempSlidePromptPlaceholders } from "@/lib/temp-slide-testing"

describe("probe girl templates", () => {
  it("expands", () => {
    const t = JSON.parse(readFileSync("data/automation-templates/templates.json","utf8"))
    const arr = Array.isArray(t)?t:(t.templates||Object.values(t))
    for (const x of arr.filter((x:any)=>/girl/i.test(x.name||""))) {
      const a = automationTemplateToTempSlideTestingAutomation(x)
      const ph = getTempSlidePromptPlaceholders(a)
      console.log(`\n### ${x.name}`)
      console.log("slides:", a.slides.map((s:any)=>`${s.section}(${s.id})`).join(" | "))
      console.log("total slides:", a.slides.length)
      console.log("placeholders ("+ph.length+"):")
      ph.forEach((p:any)=>console.log(`  ${p.id} | section=${p.section} | words=${p.wordLengthMin}-${p.wordLengthMax} | dir=${JSON.stringify(p.contentDirection)}`))
    }
  })
})
