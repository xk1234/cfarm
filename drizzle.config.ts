import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/railway/schema.ts",
  out: "./infra/railway/drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/cfarm",
  },
  strict: true,
  verbose: true,
})
