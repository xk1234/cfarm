import { AsyncLocalStorage } from "node:async_hooks"

export type ProviderRequestTrace = {
  provider: string
  operation: string
  model?: string
  request: Record<string, unknown>
}

type ProviderRequestError = Error & {
  providerRequests?: ProviderRequestTrace[]
}

const requestTraceStorage = new AsyncLocalStorage<ProviderRequestTrace[]>()

export function recordProviderRequest(trace: ProviderRequestTrace) {
  requestTraceStorage.getStore()?.push(structuredClone(trace))
}

export async function captureProviderRequests<T>(task: () => Promise<T>) {
  const existing = requestTraceStorage.getStore()
  const traces = existing ?? []
  const start = traces.length
  const execute = async () => {
    try {
      const result = await task()
      return {
        result,
        providerRequests: structuredClone(traces.slice(start)),
      }
    } catch (error) {
      if (error instanceof Error) {
        const requestError = error as ProviderRequestError
        requestError.providerRequests = structuredClone(traces.slice(start))
      }
      throw error
    }
  }
  return existing ? execute() : requestTraceStorage.run(traces, execute)
}

export function providerRequestsFromError(error: unknown) {
  return error instanceof Error &&
    Array.isArray((error as ProviderRequestError).providerRequests)
    ? structuredClone((error as ProviderRequestError).providerRequests ?? [])
    : []
}
