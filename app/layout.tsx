import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core"
import { Geist, Geist_Mono } from "next/font/google"

import "@mantine/core/styles.layer.css"
import "@mantine/notifications/styles.layer.css"

import "./globals.css"
import { AppProviders } from "@/components/app-providers"
import { E2eAuthProvider } from "@/components/auth/clerk-adapter"
import { e2eUser } from "@/lib/e2e-auth"
import { cn } from "@/lib/utils"

const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" })

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "LumenClip | Creative operations from source to signal",
    template: "%s | LumenClip",
  },
  description: "Creator operations from source to signal.",
  openGraph: {
    title: "LumenClip",
    description:
      "Turn reusable assets and templates into repeatable, approved content runs.",
    type: "website",
  },
  icons: {
    icon: "/brand/lumenclip-mark.png",
    apple: "/brand/lumenclip-mark.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const testUser = e2eUser()
  return (
    <html
      lang="en"
      {...mantineHtmlProps}
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontMono.variable,
        geistHeading.variable
      )}
    >
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body className="flex min-h-screen flex-col">
        {testUser ? (
          // Local e2e seam (lib/e2e-auth.ts): never active in production.
          <E2eAuthProvider user={testUser}>
            <AppProviders>{children}</AppProviders>
          </E2eAuthProvider>
        ) : (
          <ClerkProvider appearance={{ theme: shadcn }}>
            <AppProviders>{children}</AppProviders>
          </ClerkProvider>
        )}
      </body>
    </html>
  )
}
