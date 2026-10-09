import "server-only"

import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

/**
 * Server variables validated at boot. Appwrite credentials are optional here
 * so builds and tests run without them; `getRepositories()` throws a clear
 * AppwriteNotConfiguredError on first use when they are missing. Integrations
 * stay optional: an unset provider disables that feature.
 */
export const serverEnv = createEnv({
  server: {
    APPWRITE_ENDPOINT: z.url().optional(),
    APPWRITE_PROJECT_ID: z.string().min(1).optional(),
    APPWRITE_API_KEY: z.string().min(1).optional(),
    APPWRITE_DATABASE_ID: z.string().min(1).optional(),
    APPWRITE_BUCKET_MEDIA: z.string().min(1).optional(),
    APPWRITE_BUCKET_RENDERS: z.string().min(1).optional(),
    FILE_URL_SECRET: z.string().min(1).optional(),
    WORKER_WAKE_URL: z.url().optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .optional(),
  },
  runtimeEnv: {
    APPWRITE_ENDPOINT: process.env.APPWRITE_ENDPOINT,
    APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID,
    APPWRITE_API_KEY: process.env.APPWRITE_API_KEY,
    APPWRITE_DATABASE_ID: process.env.APPWRITE_DATABASE_ID,
    APPWRITE_BUCKET_MEDIA: process.env.APPWRITE_BUCKET_MEDIA,
    APPWRITE_BUCKET_RENDERS: process.env.APPWRITE_BUCKET_RENDERS,
    FILE_URL_SECRET: process.env.FILE_URL_SECRET,
    WORKER_WAKE_URL: process.env.WORKER_WAKE_URL,
    LOG_LEVEL: process.env.LOG_LEVEL,
  },
  emptyStringAsUndefined: true,
})
