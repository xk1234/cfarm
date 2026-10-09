import "server-only"

import pino from "pino"

import { serverEnv } from "@/lib/server-env"

export const logger = pino({
  level:
    serverEnv.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "lumenclip-web" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "*.apiKey",
      "*.token",
      "*.secret",
    ],
    censor: "[REDACTED]",
  },
})
