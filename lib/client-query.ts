"use client"

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

type AppQueryOptions<T> = {
  fallbackData?: T
  keepPreviousData?: boolean
  refreshInterval?: number
  refreshWhenHidden?: boolean
  refreshWhenOffline?: boolean
}

/**
 * Small compatibility hook for app-owned request state. It intentionally
 * exposes the subset of the old SWR contract used by the UI so call sites can
 * move to TanStack Query without changing their loading and mutation behavior.
 */
export function useAppQuery<T>(
  key: string | null,
  fetcher: (url: string) => Promise<T>,
  options: AppQueryOptions<T> = {}
) {
  const queryClient = useQueryClient()
  const queryKey = ["app-request", key] as const
  const query = useQuery({
    queryKey,
    queryFn: () => fetcher(key as string),
    enabled: Boolean(key),
    initialData: options.fallbackData,
    placeholderData: options.keepPreviousData ? keepPreviousData : undefined,
    refetchInterval: options.refreshInterval,
    refetchIntervalInBackground: options.refreshWhenHidden,
    networkMode: options.refreshWhenOffline ? "always" : "online",
  })

  async function mutate(
    nextData?: T,
    shouldRevalidate = nextData === undefined
  ) {
    if (nextData !== undefined) queryClient.setQueryData(queryKey, nextData)
    if (shouldRevalidate && key) {
      const result = await query.refetch()
      return result.data
    }
    return nextData ?? query.data
  }

  return {
    data: query.data,
    error: query.error,
    isLoading: query.isLoading,
    isValidating: query.isFetching,
    mutate,
  }
}
