import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

const ownerContext = new AsyncLocalStorage<string>()

export function withSystemOwner<T>(ownerId: string, task: () => T): T {
  return ownerContext.run(ownerId, task)
}

export function systemOwnerId() {
  return ownerContext.getStore()?.trim() || undefined
}
