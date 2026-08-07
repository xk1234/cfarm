import { SignIn } from "@clerk/nextjs"

import { ClerkAuthShell } from "@/components/clerk-auth-shell"

function safeNext(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate?.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/app"
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const next = safeNext((await searchParams).next)
  return (
    <ClerkAuthShell>
      <SignIn
        path="/login"
        signUpUrl="/sign-up"
        fallbackRedirectUrl={next}
        signUpFallbackRedirectUrl={next}
      />
    </ClerkAuthShell>
  )
}
