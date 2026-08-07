import { SignUp } from "@clerk/nextjs"

import { ClerkAuthShell } from "@/components/clerk-auth-shell"

function safeNext(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate?.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/app"
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const next = safeNext((await searchParams).next)
  return (
    <ClerkAuthShell>
      <SignUp
        path="/sign-up"
        signInUrl="/login"
        fallbackRedirectUrl={next}
        signInFallbackRedirectUrl={next}
      />
    </ClerkAuthShell>
  )
}
