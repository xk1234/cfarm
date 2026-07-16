/**
 * Generation mechanics: OpenRouter structured-output call + deterministic
 * validation + one repair attempt. Mirrors lib/x-automation-generation.ts.
 *
 * Codex: you normally do NOT need to edit this file — prompt content lives in
 * presets.mjs. Only touch this if an experiment direction requires a pipeline
 * change (e.g. two-pass self-critique), and say so in your report.
 */
import { buildSystemPrompt, buildUserPrompt } from "./presets.mjs"
import { deterministicChecks } from "./judge.mjs"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

export async function openRouterJson({ apiKey, model, system, user, schema, temperature }) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: temperature ?? 0.8,
      // Structured posts are capped at 1,900 characters. Keep OpenRouter from
      // reserving the model's much larger default completion window.
      max_tokens: schema ? 4096 : 2048,
      response_format: schema
        ? { type: "json_schema", json_schema: schema }
        : { type: "json_object" },
      plugins: [{ id: "response-healing" }],
    }),
    signal: AbortSignal.timeout(120_000),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error?.message || `OpenRouter failed (${res.status})`)
  const raw = payload.choices?.[0]?.message?.content
  const text = typeof raw === "string" ? raw : ""
  const candidate = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
  const parsed = JSON.parse(candidate.slice(candidate.indexOf("{"), candidate.lastIndexOf("}") + 1))
  if (!parsed || typeof parsed !== "object") throw new Error("Model returned invalid JSON")
  return parsed
}

export async function deriveBrief({ apiKey, model, niche }) {
  const result = await openRouterJson({
    apiKey,
    model,
    temperature: 0.4,
    system:
      "You derive a focused LinkedIn content strategy from one niche. Return concrete audience language and distinct content pillars. Never invent performance claims.",
    user: `Niche: ${niche}\nReturn exactly 3-5 pillars.`,
    schema: {
      name: "linkedin_brief",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["audience", "promise", "pillars", "keywords", "painPoints"],
        properties: {
          audience: { type: "string" },
          promise: { type: "string" },
          pillars: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
          keywords: { type: "array", items: { type: "string" } },
          painPoints: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
        },
      },
    },
  })
  return {
    audience: String(result.audience ?? ""),
    promise: String(result.promise ?? ""),
    pillars: (result.pillars ?? []).map(String),
    keywords: (result.keywords ?? []).map(String),
    painPoints: (result.painPoints ?? []).map(String),
  }
}

export function buildPostSchema(archetype) {
  const properties = Object.fromEntries(
    archetype.slots.map((s) => [
      s.key,
      { type: "string", description: `${s.description}. ${s.minWords}-${s.maxWords} words.` },
    ])
  )
  const required = archetype.slots.filter((s) => !s.optional).map((s) => s.key)
  return {
    name: `linkedin_post_${archetype.id}`,
    strict: true,
    schema: { type: "object", additionalProperties: false, properties, required },
  }
}

export function composePost(archetype, output) {
  return archetype.slots
    .map((s) => String(output[s.key] ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
}

function wordCount(value) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

export function validateSlots(archetype, output) {
  const errors = []
  for (const s of archetype.slots) {
    const value = String(output[s.key] ?? "").trim()
    const words = wordCount(value)
    if (!s.optional && !value) errors.push(`${s.key} is required`)
    if (value && (words < s.minWords || words > s.maxWords))
      errors.push(`${s.key} must be ${s.minWords}-${s.maxWords} words; received ${words}`)
  }
  return errors
}

/**
 * Generate one post for a plan; up to 2 attempts, second attempt receives the
 * exact validation errors (slot bounds + deterministic format checks).
 */
export async function generatePost({ apiKey, model, niche, brief, plan, voice, excludedTopics = [], proof = [] }) {
  const schema = buildPostSchema(plan.archetype)
  const system = buildSystemPrompt({ voice, niche, brief, excludedTopics, proof })
  const basePrompt = buildUserPrompt({ plan })
  let output = {}
  let post = ""
  let errors = []
  let attempts = 0
  for (let attempt = 0; attempt < 2; attempt += 1) {
    attempts += 1
    output = await openRouterJson({
      apiKey,
      model,
      system,
      user: `${basePrompt}${errors.length ? `\n\nYour previous attempt failed validation. Repair these exact errors:\n- ${errors.join("\n- ")}` : ""}`,
      schema,
    })
    post = composePost(plan.archetype, output)
    errors = [
      ...validateSlots(plan.archetype, output),
      ...deterministicChecks(post, { proof, archetypeMinCharacters: plan.archetype.minCharacters }),
    ]
    if (errors.length === 0) break
  }
  return { post, output, violations: errors, attempts }
}
