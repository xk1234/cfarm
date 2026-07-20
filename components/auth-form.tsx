"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"

export function AuthForm() {
  const params = useSearchParams()
  const [mode, setMode] = useState<"login" | "register">(
    params.get("mode") === "register" ? "register" : "login"
  )
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPending(true)
    try {
      const form = new FormData(event.currentTarget)
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
        requiresVerification?: boolean
        verificationSent?: boolean
      } | null
      if (!response.ok) {
        setError(payload?.error ?? "Authentication failed.")
        return
      }
      if (payload?.requiresVerification) {
        const sent = payload.verificationSent === false ? "0" : "1"
        window.location.assign(`/verify-email?sent=${sent}`)
        return
      }
      window.location.assign(params.get("next") || "/app")
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Authentication failed."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="w-full">
      <h1 className="text-4xl leading-tight font-semibold tracking-[-0.05em]">
        {mode === "login" ? "Welcome back" : "Create your workspace"}
      </h1>
      <p className="mt-3 text-[15px] leading-6 text-brand-muted">
        {mode === "login"
          ? "Log in to continue to LumenClip."
          : "Your content and workflows stay attached to your account."}
      </p>
      <form onSubmit={submit} className="mt-9 space-y-5" aria-busy={pending}>
        {mode === "register" ? (
          <Field label="Name" name="name" type="text" autoComplete="name" />
        ) : null}
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {error ? (
          <p role="alert" className="text-sm font-medium text-brand-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="brand-button brand-button-primary min-h-12 w-full disabled:cursor-wait disabled:opacity-60"
        >
          {pending
            ? "Please wait"
            : mode === "login"
              ? "Log in"
              : "Create account"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setError("")
          setMode(mode === "login" ? "register" : "login")
        }}
        className="mt-6 w-full text-sm font-medium text-brand-muted transition-colors hover:text-brand-ink"
      >
        {mode === "login"
          ? "New to LumenClip? Create an account"
          : "Already have an account? Log in"}
      </button>
    </div>
  )
}

function Field(props: {
  label: string
  name: string
  type: string
  autoComplete: string
}) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>{props.label}</span>
      <input required {...props} className="brand-field h-12" />
    </label>
  )
}
