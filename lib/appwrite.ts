import "server-only"

// Server-side Appwrite client (TablesDB + Storage). Never import from a Client
// Component: this module has access to the Appwrite API key.
import { Client, Storage, TablesDB } from "node-appwrite"

export const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT ?? ""
export const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? ""
export const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY ?? ""
export const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? "cfarm"

export function appwriteEnabled(): boolean {
  return Boolean(APPWRITE_ENDPOINT && APPWRITE_PROJECT_ID && APPWRITE_API_KEY)
}

type AppwriteClients = { tables: TablesDB; storage: Storage }
let cached: AppwriteClients | null = null

/** Returns Appwrite clients, or null when Appwrite is not configured. */
export function getAppwrite(): AppwriteClients | null {
  if (!appwriteEnabled()) return null
  if (cached) return cached
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY)
  cached = { tables: new TablesDB(client), storage: new Storage(client) }
  return cached
}
