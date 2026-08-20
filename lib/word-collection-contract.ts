export type WordCollectionSource = "manual" | "ai"

export type WordCollectionRecord = {
  id: string
  name: string
  description?: string
  words: string[]
  source: WordCollectionSource
  created_at: string
  updated_at: string
}
