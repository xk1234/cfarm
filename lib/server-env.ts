import "server-only"

import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

/**
 * Variables used by the new server foundations. Integrations remain optional:
 * an unset provider must disable that feature, not prevent the app from booting.
 */
export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.url().optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .optional(),
    PG_BOSS_SCHEMA: z.string().min(1).optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    LOG_LEVEL: process.env.LOG_LEVEL,
    PG_BOSS_SCHEMA: process.env.PG_BOSS_SCHEMA,
  },
  emptyStringAsUndefined: true,
})
