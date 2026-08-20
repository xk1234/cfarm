export type RailwayServiceContext = {
  log(message: unknown): void
  error(message: unknown): void
}

export default async function templateScheduler({
  log,
}: RailwayServiceContext) {
  log("template scheduler disabled: templates generate drafts on demand")
  return {
    ok: true,
    disabled: true,
    templates: 0,
    enqueued: 0,
    duplicates: 0,
  }
}
