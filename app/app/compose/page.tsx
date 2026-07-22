import { ComposeDemo } from "./compose-demo"

export default function ComposePage() {
  return (
    <main className="min-h-screen bg-brand-canvas px-4 py-8 text-app-text md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-caption font-semibold tracking-wide text-brand-accent uppercase">
            LumenClip composer
          </p>
          <h1 className="mt-2 text-metric font-semibold">
            One message, made native everywhere.
          </h1>
          <p className="mt-2 max-w-2xl text-label text-app-muted-text">
            Draft once, customize only where a network needs it, and review the
            real post before publishing.
          </p>
        </div>
        <ComposeDemo />
      </div>
    </main>
  )
}
