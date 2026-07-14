import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
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
      "Turn saved creative research into repeatable workflows, reusable assets, and approved content runs.",
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
      <body>
        <ThemeProvider defaultTheme="light" enableSystem={false}>
          {children}
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
