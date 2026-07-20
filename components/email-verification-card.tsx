"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

type State = "checking" | "waiting" | "verified" | "error"

export function EmailVerificationCard() {
  const params = useSearchParams()
  const started = useRef(false)
  const userId = params.get("userId")
  const secret = params.get("secret")
  const [state, setState] = useState<State>(
    userId && secret ? "checking" : "waiting"
  )
  const [message, setMessage] = useState(
    params.get("sent") === "0"
      ? "Your account is ready, but the first email could not be sent. Try resending it below."
      : "We sent a verification link to your email address."
  )
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!userId || !secret || started.current) return
    started.current = true
    void fetch("/api/auth/verification/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, secret }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        if (!response.ok)
          throw new Error(payload?.error || "Verification failed.")
        setState("verified")
        setMessage("Your email is verified. Your LumenClip workspace is ready.")
      })
      .catch((error: Error) => {
        setState("error")
        setMessage(error.message)
      })
  }, [secret, userId])

  async function resend() {
    setPending(true)
    try {
      const response = await fetch("/api/auth/verification/resend", {
        method: "POST",
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
        alreadyVerified?: boolean
      } | null
      if (payload?.alreadyVerified) {
        setState("verified")
        setMessage("Your email is already verified.")
      } else if (response.ok) {
        setState("waiting")
        setMessage(
          "A new verification email is on its way. Check your inbox and spam folder."
        )
      } else {
        setState("error")
        setMessage(payload?.error || "We couldn't resend the email.")
      }
    } catch (resendError) {
      setState("error")
      setMessage(
        resendError instanceof Error
          ? resendError.message
          : "We couldn't resend the email."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="brand-card w-full p-7 text-center sm:p-9">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-accent-surface text-2xl">
        {state === "verified" ? "✓" : "✉"}
      </div>
      <h1 className="mt-5 text-3xl font-semibold tracking-[-0.045em]">
        {state === "verified"
          ? "Email verified"
          : state === "checking"
            ? "Verifying your email"
            : "Check your inbox"}
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-brand-muted">
        {message}
      </p>

      {state === "verified" ? (
        <a
          href="/app"
          className="brand-button brand-button-primary mt-7 w-full"
        >
          Open LumenClip
        </a>
      ) : state !== "checking" ? (
        <button
          onClick={resend}
          disabled={pending}
          className="brand-button brand-button-primary mt-7 w-full disabled:opacity-60"
        >
          {pending ? "Sending…" : "Resend verification email"}
        </button>
      ) : null}

      {state !== "verified" ? (
        <a
          href="/login"
          className="mt-5 block text-sm font-medium text-brand-muted hover:text-brand-ink"
        >
          Back to login
        </a>
      ) : null}
    </div>
  )
}
