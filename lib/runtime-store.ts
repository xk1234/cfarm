import "server-only"

import {
  RailwayRecordStore,
  RailwayObjectStore,
} from "@/lib/railway/appwrite-compat"

export const RUNTIME_DATABASE_ID = "cfarm"

export type RuntimeStore = {
  records: RailwayRecordStore
  objects: RailwayObjectStore
}

let cached: RuntimeStore | null = null

export function getRuntimeStore(): RuntimeStore {
  if (!cached) {
    cached = {
      records: new RailwayRecordStore(),
      objects: new RailwayObjectStore(),
    }
  }
  return cached
}
