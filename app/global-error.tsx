"use client"

import Link from "next/link"

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#f7f7f5",
          color: "#171717",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#6b6b70",
              }}
            >
              LumenClip
            </p>
            <h1 style={{ margin: "12px 0 0", fontSize: 32 }}>
              Something went wrong
            </h1>
            <p
              style={{ margin: "12px 0 0", lineHeight: 1.6, color: "#626268" }}
            >
              The workspace could not finish loading. Retry the request, or
              return to the home page if the problem continues.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 10,
                marginTop: 24,
              }}
            >
              <button
                type="button"
                onClick={reset}
                style={{
                  border: 0,
                  borderRadius: 10,
                  background: "#171717",
                  color: "white",
                  padding: "11px 16px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              <Link
                href="/"
                style={{
                  border: "1px solid #d8d8dc",
                  borderRadius: 10,
                  color: "#171717",
                  padding: "10px 16px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Go home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
