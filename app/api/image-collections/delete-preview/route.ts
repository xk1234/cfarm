import { NextResponse } from "next/server"
import { z } from "zod"

import { providerFail, validate } from "@/lib/api"
import {
  listAutomationTemplateRecords,
  automationTemplateRecordToSchema,
} from "@/lib/automation-templates"
import { listAutomationRecords } from "@/lib/automations"
import { listImageCollections } from "@/lib/image-collections"
import { automationCollectionIds } from "@/lib/realfarm-automation"
import {
  collectionAliases,
  storedToCollection,
} from "@/lib/realfarm-collections"

export const dynamic = "force-dynamic"

const schema = z.object({
  collections: z
    .array(
      z.object({
        name: z.string(),
        created_at: z.string(),
      })
    )
    .min(1),
})

export async function POST(request: Request) {
  try {
    const input = validate(schema, await request.json().catch(() => null))
    const [collections, automations, templates] = await Promise.all([
      listImageCollections(),
      listAutomationRecords(),
      listAutomationTemplateRecords(),
    ])
    const requested = new Set(
      input.collections.map((item) => `${item.name}::${item.created_at}`)
    )
    const selected = collections.filter((collection) =>
      requested.has(`${collection.name}::${collection.created_at}`)
    )
    const aliases = new Set(
      selected.flatMap((collection) =>
        collectionAliases(storedToCollection(collection))
      )
    )
    const dependentAutomations = automations
      .filter((automation) =>
        automationCollectionIds(automation.schema).some((id) => aliases.has(id))
      )
      .map((automation) => ({ id: automation.id, name: automation.name }))
    const dependentTemplates = templates
      .filter((template) =>
        automationCollectionIds(
          automationTemplateRecordToSchema(template)
        ).some((id) => aliases.has(id))
      )
      .map((template) => ({ id: template.id, name: template.name }))

    return NextResponse.json({
      collections: selected.map((collection) => ({
        name: collection.name,
        created_at: collection.created_at,
        itemCount: collection.images.length,
      })),
      itemCount: selected.reduce(
        (total, collection) => total + collection.images.length,
        0
      ),
      dependentAutomations,
      dependentTemplates,
      recoveryDays: 30,
    })
  } catch (error) {
    return providerFail(error, "Failed to inspect collection dependencies", 400)
  }
}
