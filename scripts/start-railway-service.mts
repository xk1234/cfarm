import { spawn } from "node:child_process"

const service = (process.env.RAILWAY_SERVICE_NAME ?? "web").toLowerCase()
const script = service.includes("scheduler")
  ? "railway:scheduler"
  : service.includes("worker")
    ? "railway:worker"
    : "start"

const child = spawn("pnpm", [script], {
  env: process.env,
  stdio: "inherit",
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal))
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
