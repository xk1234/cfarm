import postgres from "postgres"

type RailwayUser = {
  id: string
  email: string
  name: string
  email_verified: boolean
  created_at: string
}

type ClerkUser = {
  id: string
  external_id: string | null
  private_metadata?: Record<string, unknown>
  email_addresses: Array<{ email_address: string }>
}

const apply = process.argv.includes("--apply")
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is required")

const sql = postgres(databaseUrl, { max: 1, prepare: false })

try {
  const users = await sql<RailwayUser[]>`
    SELECT id, email, name, email_verified, created_at
    FROM app_users
    ORDER BY created_at, id
  `

  console.log(`Clerk migration inventory: ${users.length} Railway users`)
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to create Clerk users.")
    process.exitCode = 0
  } else {
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) throw new Error("CLERK_SECRET_KEY is required with --apply")

    const clerkRequest = async <T,>(path: string, init?: RequestInit) => {
      const response = await fetch(`https://api.clerk.com/v1${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(`Clerk API ${response.status}: ${message}`)
      }
      return (await response.json()) as T
    }

    const existing = await clerkRequest<ClerkUser[]>("/users?limit=500")
    const byExternalId = new Map(
      existing
        .filter((user) => user.external_id)
        .map((user) => [user.external_id as string, user])
    )
    const byEmail = new Map(
      existing.flatMap((user) =>
        user.email_addresses.map(
          (email) => [email.email_address.toLowerCase(), user] as const
        )
      )
    )

    let created = 0
    let linked = 0
    let skipped = 0
    let ignoredTestIdentities = 0
    for (const source of users) {
      const email = source.email.toLowerCase()
      if (/\.(?:test|invalid)$/.test(email.split("@")[1] ?? "")) {
        console.log(`Skipping non-deliverable test identity ${source.id}`)
        ignoredTestIdentities += 1
        continue
      }
      const matched = byExternalId.get(source.id) ?? byEmail.get(email)
      if (matched) {
        if (!matched.external_id) {
          await clerkRequest(`/users/${encodeURIComponent(matched.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              external_id: source.id,
              private_metadata: {
                ...matched.private_metadata,
                lumenclipOwnerId: source.id,
                migratedFromRailway: true,
              },
            }),
          })
          linked += 1
        } else {
          skipped += 1
        }
        continue
      }

      const [firstName, ...lastNameParts] = source.name.trim().split(/\s+/)
      await clerkRequest("/users", {
        method: "POST",
        body: JSON.stringify({
          external_id: source.id,
          email_address: [email],
          email_address_identification_status: [
            source.email_verified ? "verified" : "reserved",
          ],
          first_name: firstName || undefined,
          last_name: lastNameParts.join(" ") || undefined,
          skip_password_requirement: true,
          skip_legal_checks: true,
          created_at: source.created_at,
          private_metadata: {
            lumenclipOwnerId: source.id,
            migratedFromRailway: true,
            passwordResetRequired: true,
          },
        }),
      })
      created += 1
    }

    console.log(
      `Clerk migration complete: ${created} created, ${linked} linked, ${skipped} unchanged, ${ignoredTestIdentities} test identities ignored`
    )
  }
} finally {
  await sql.end({ timeout: 5 })
}
