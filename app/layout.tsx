import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { RootProvider } from "fumadocs-ui/provider/next"
import "react-loading-skeleton/dist/skeleton.css"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppToaster } from "@/components/ui/app-toaster"
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
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontMono.variable,
        geistHeading.variable
      )}
    >
      <body className="flex min-h-screen flex-col">
        <ThemeProvider defaultTheme="light" enableSystem={false}>
          <RootProvider theme={{ enabled: false }}>{children}</RootProvider>
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
