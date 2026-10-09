/**
 * Server-only Appwrite clients (TablesDB + Storage) built from env.
 *
 * Only lib/data/appwrite/* imports node-appwrite. The browser never talks to
 * Appwrite; the API key never leaves the server.
 */
import { Client, Storage, TablesDB } from "node-appwrite"

import type { Models } from "node-appwrite"

/** The TablesDB methods the adapter uses (object-parameter style). */
export type TablesApi = {
  createRow(params: { databaseId: string; tableId: string; rowId: string; data: Record<string, unknown> }): Promise<Models.DefaultRow>
  getRow(params: { databaseId: string; tableId: string; rowId: string; queries?: string[] }): Promise<Models.DefaultRow>
  listRows(params: {
    databaseId: string
    tableId: string
    queries?: string[]
    total?: boolean
  }): Promise<{ total: number; rows: Models.DefaultRow[] }>
  updateRow(params: { databaseId: string; tableId: string; rowId: string; data?: Record<string, unknown> }): Promise<Models.DefaultRow>
  upsertRow(params: { databaseId: string; tableId: string; rowId: string; data?: Record<string, unknown> }): Promise<Models.DefaultRow>
  deleteRow(params: { databaseId: string; tableId: string; rowId: string }): Promise<unknown>
  updateRows(params: {
    databaseId: string
    tableId: string
    data?: object
    queries?: string[]
  }): Promise<{ total: number; rows: Models.DefaultRow[] }>
  deleteRows(params: { databaseId: string; tableId: string; queries?: string[] }): Promise<{ total: number; rows: Models.DefaultRow[] }>
}

export type StoredFile = { $id: string; name: string; mimeType: string; sizeOriginal: number }

/** The Storage methods the adapter uses. `file` is an `InputFile` (node-appwrite/file). */
export type StorageApi = {
  createFile(params: { bucketId: string; fileId: string; file: never; permissions?: string[] }): Promise<StoredFile>
  getFile(params: { bucketId: string; fileId: string }): Promise<StoredFile>
  getFileView(params: { bucketId: string; fileId: string }): Promise<ArrayBuffer>
  deleteFile(params: { bucketId: string; fileId: string }): Promise<unknown>
}

export type AppwriteEnv = {
  endpoint: string
  projectId: string
  apiKey: string
}

export class AppwriteNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Appwrite is not configured: set ${missing.join(", ")}.`)
    this.name = "AppwriteNotConfiguredError"
  }
}

export function appwriteEnvFrom(env: Record<string, string | undefined> = process.env): AppwriteEnv {
  const endpoint = env.APPWRITE_ENDPOINT?.trim() ?? ""
  const projectId = env.APPWRITE_PROJECT_ID?.trim() ?? ""
  const apiKey = env.APPWRITE_API_KEY?.trim() ?? ""
  const missing = [
    !endpoint && "APPWRITE_ENDPOINT",
    !projectId && "APPWRITE_PROJECT_ID",
    !apiKey && "APPWRITE_API_KEY",
  ].filter((v): v is string => Boolean(v))
  if (missing.length) throw new AppwriteNotConfiguredError(missing)
  return { endpoint: endpoint.replace(/\/+$/, ""), projectId, apiKey }
}

export function isAppwriteConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.APPWRITE_ENDPOINT?.trim() && env.APPWRITE_PROJECT_ID?.trim() && env.APPWRITE_API_KEY?.trim())
}

export function createAppwriteClients(env: AppwriteEnv = appwriteEnvFrom()): {
  tables: TablesApi
  storage: StorageApi
} {
  const client = new Client().setEndpoint(env.endpoint).setProject(env.projectId).setKey(env.apiKey)
  return {
    tables: new TablesDB(client) as unknown as TablesApi,
    storage: new Storage(client) as unknown as StorageApi,
  }
}
