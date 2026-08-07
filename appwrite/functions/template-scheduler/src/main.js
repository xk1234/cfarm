// Template generation is now manual. This service remains deployable while
// existing Railway/Appwrite scheduler configuration is removed, but it never
// reads templates or enqueues generation jobs.

async function templateScheduler({ log }) {
  log("template scheduler disabled: templates generate drafts on demand")
  return {
    ok: true,
    disabled: true,
    templates: 0,
    enqueued: 0,
    duplicates: 0,
  }
}

export default templateScheduler
