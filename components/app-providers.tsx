"use client"

import { useState, type ReactNode } from "react"
import { MantineProvider, createTheme } from "@mantine/core"
import { Notifications } from "@mantine/notifications"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RootProvider } from "fumadocs-ui/provider/next"

import { ThemeProvider } from "@/components/theme-provider"
import { AppToaster } from "@/components/ui/app-toaster"

const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
  fontFamily: "var(--font-sans), sans-serif",
  headings: {
    fontFamily: "var(--font-heading), var(--font-sans), sans-serif",
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 15_000,
          },
        },
      })
  )

  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" enableSystem={false}>
          <RootProvider theme={{ enabled: false }}>{children}</RootProvider>
          <Notifications position="top-right" />
          <AppToaster />
        </ThemeProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
}
