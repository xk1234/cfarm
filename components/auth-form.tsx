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
      setPending(false)
      return
    }
    if (payload?.requiresVerification) {
      const sent = payload.verificationSent === false ? "0" : "1"
      window.location.assign(`/verify-email?sent=${sent}`)
      return
    }
    window.location.assign(params.get("next") || "/app")
  }

  return (
    <div className="w-full max-w-[430px] rounded-[18px] border border-[#e7e7ee] bg-white p-7 shadow-[0_18px_60px_rgba(35,24,67,0.1)] sm:p-9">
      <h1 className="text-3xl font-semibold tracking-[-0.045em]">
        {mode === "login" ? "Welcome back" : "Create your workspace"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#686875]">
        {mode === "login"
          ? "Log in to continue to LumenClip."
          : "Your content and workflows stay attached to your account."}
      </p>
      <form onSubmit={submit} className="mt-7 space-y-4">
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
          <p className="text-sm font-medium text-[#c53b4a]">{error}</p>
        ) : null}
        <button
          disabled={pending}
          className="h-11 w-full rounded-[10px] bg-[#6d28d9] px-4 text-sm font-semibold text-white hover:bg-[#5b21b6] disabled:opacity-60"
        >
          {pending
            ? "Please wait"
            : mode === "login"
              ? "Log in"
              : "Create account"}
        </button>
      </form>
      <button
        onClick={() => {
          setError("")
          setMode(mode === "login" ? "register" : "login")
        }}
        className="mt-5 w-full text-sm font-medium text-[#686875] hover:text-[#111117]"
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
      <input
        required
        {...props}
        className="h-11 w-full rounded-[10px] border border-[#d8d8e2] bg-white px-3 outline-none focus:border-[#6d28d9] focus:ring-3 focus:ring-[#6d28d9]/20"
      />
    </label>
  )
}
