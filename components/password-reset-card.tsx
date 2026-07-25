"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"

type State = "request" | "sent" | "set" | "done" | "error"

export function PasswordResetCard() {
  const params = useSearchParams()
  const userId = params.get("userId")
  const secret = params.get("secret")
  // Arriving with a link puts the card straight into "choose a new password".
  const [state, setState] = useState<State>(userId && secret ? "set" : "request")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)

  async function requestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage("")
    const form = new FormData(event.currentTarget)
    try {
      await fetch("/api/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      })
      // Always the same outcome, so this page cannot be used to discover
      // which email addresses have accounts.
      setState("sent")
    } catch {
      setState("error")
      setMessage("We couldn't send the email. Try again in a moment.")
    } finally {
      setPending(false)
    }
  }

  async function setPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage("")
    const form = new FormData(event.currentTarget)
    const password = String(form.get("password") ?? "")
    if (password !== String(form.get("confirm") ?? "")) {
      setMessage("Those passwords do not match.")
      setPending(false)
      return
    }
    try {
      const response = await fetch("/api/auth/recovery/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, secret, password }),
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      if (!response.ok) throw new Error(payload?.error || "Reset failed.")
      setState("done")
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setPending(false)
    }
  }

  const heading =
    state === "done"
      ? "Password updated"
      : state === "sent"
        ? "Check your inbox"
        : state === "set"
          ? "Choose a new password"
          : "Reset your password"

  return (
    <div className="brand-card p-7">
      <h1 className="text-xl font-semibold tracking-[-0.02em]">{heading}</h1>

      {state === "request" && (
        <>
          <p className="mt-2 text-sm text-brand-muted">
            Enter your email and we will send you a link to set a new password.
          </p>
          <form onSubmit={requestReset} className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              <span>Email</span>
              <input
                required
                name="email"
                type="email"
                autoComplete="email"
                className="brand-field h-12"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="brand-button h-12 w-full"
            >
              {pending ? "Please wait" : "Send reset link"}
            </button>
          </form>
        </>
      )}

      {state === "sent" && (
        <p className="mt-2 text-sm text-brand-muted">
          If an account exists for that address, a reset link is on its way.
          Check your inbox and spam folder.
        </p>
      )}

      {state === "set" && (
        <>
          <p className="mt-2 text-sm text-brand-muted">
            Use at least 8 characters, including a number.
          </p>
          <form onSubmit={setPassword} className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm font-medium">
              <span>New password</span>
              <input
                required
                name="password"
                type="password"
                autoComplete="new-password"
                className="brand-field h-12"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Confirm new password</span>
              <input
                required
                name="confirm"
                type="password"
                autoComplete="new-password"
                className="brand-field h-12"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="brand-button h-12 w-full"
            >
              {pending ? "Please wait" : "Update password"}
            </button>
          </form>
        </>
      )}

      {state === "done" && (
        <p className="mt-2 text-sm text-brand-muted">
          Your password has been updated. You can log in with it now.
        </p>
      )}

      {message && (
        <p className="mt-4 text-sm text-brand-danger" role="alert">
          {message}
        </p>
      )}

      <Link
        href="/login"
        className="mt-6 block w-full text-center text-sm font-medium text-brand-muted transition-colors hover:text-brand-ink"
      >
        Back to login
      </Link>
    </div>
  )
}
