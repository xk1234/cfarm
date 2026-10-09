import { fetchJsonWithTimeout } from "@/lib/client-api"

export function clientQueryFetcher<T>(url: string): Promise<T> {
  return fetchJsonWithTimeout<T>(url, {
    cache: "no-store",
    toastOnError: false,
  })
}
