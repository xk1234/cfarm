"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export function TeamInviteCard({ authenticated }: { authenticated: boolean }) {
  const params = useSearchParams()
  const started = useRef(false)
  const [state, setState] = useState<
    "ready" | "accepting" | "accepted" | "error"
  >("ready")
  const [message, setMessage] = useState("")
  const query = params.toString()
  const next = `/team-invite?${query}`

  useEffect(() => {
    if (!authenticated || started.current) return
    const fields = {
      teamId: params.get("teamId"),
      membershipId: params.get("membershipId"),
      userId: params.get("userId"),
      secret: params.get("secret"),
    }
    if (Object.values(fields).some((value) => !value)) {
      setState("error")
      setMessage("This invitation link is incomplete.")
      return
    }
    started.current = true
    setState("accepting")
    void fetch("/api/settings/team/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).then(async (response) => {
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setState("error")
        setMessage(payload?.error || "Invitation could not be accepted.")
        return
      }
      setState("accepted")
    })
  }, [authenticated, params])

  return (
    <div className="rounded-[18px] border border-[#e7e7ee] bg-white p-8 text-center shadow-[0_18px_60px_rgba(35,24,67,0.1)]">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-[#f1eafe] text-xl text-[#6d28d9]">
        {state === "accepted" ? "✓" : "＋"}
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">
        {state === "accepted"
          ? "You’re on the team"
          : "Join a LumenClip workspace"}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#686875]">
        {message ||
          (state === "accepting"
            ? "Accepting your invitation…"
            : state === "accepted"
              ? "Shared generations and swipes are now available in your account."
              : "Log in or create an account with the invited email to continue.")}
      </p>
      {state === "accepted" ? (
        <a
          href="/app"
          className="mt-6 flex h-11 items-center justify-center rounded-[10px] bg-[#6d28d9] text-sm font-semibold text-white"
        >
          Open LumenClip
        </a>
      ) : !authenticated ? (
        <div className="mt-6 grid gap-2">
          <a
            href={`/login?next=${encodeURIComponent(next)}`}
            className="flex h-11 items-center justify-center rounded-[10px] bg-[#6d28d9] text-sm font-semibold text-white"
          >
            Log in
          </a>
          <a
            href={`/login?mode=register&next=${encodeURIComponent(next)}`}
            className="flex h-11 items-center justify-center rounded-[10px] border border-[#d8d8e2] text-sm font-semibold"
          >
            Create account
          </a>
        </div>
      ) : null}
    </div>
  )
}
