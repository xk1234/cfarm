export type LumenLabProjectSummary = {
  id: string
  title: string
  updatedAt: string
}

export type LumenLabHookSummary = {
  id: string
  text: string
  createdAt: string
  mechanisms: string[]
  sourceType?: "hook" | "script"
  sourceId?: string
  sourceTitle?: string | null
  contentDirection?: string
  content?: string
}

export type LumenLabProjectsResponse = {
  projects: LumenLabProjectSummary[]
}

export type LumenLabProjectHooksResponse = {
  project: LumenLabProjectSummary
  hooks: LumenLabHookSummary[]
  total: number
}

export type LumenLabProjectScriptAnalysisResponse = {
  project: LumenLabProjectSummary
  scriptCount: number
  projectContentDirection: string
  projectContent: string
  hooks: LumenLabHookSummary[]
  analysis: {
    model: string
    tokensIn: number
    tokensOut: number
    costUsd: number
  }
}
