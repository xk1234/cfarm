import { NextResponse } from "next/server"

import { postizRequest } from "@/lib/postiz-client"
import { postizRouteError } from "@/lib/postiz-route"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? ""

  try {
    if (contentType.includes("application/json")) {
      const payload = await request.json().catch(() => null)
      const url = typeof payload?.url === "string" ? payload.url.trim() : ""
      if (!url) {
        return NextResponse.json({ error: "A url is required" }, { status: 400 })
      }
      const upload = await postizRequest("/upload-from-url", {
        body: { url },
      })
      return NextResponse.json({ upload })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file is required" }, { status: 400 })
    }

    const postizForm = new FormData()
    postizForm.set("file", file)
    const upload = await postizRequest("/upload", {
      body: postizForm,
    })

    return NextResponse.json({ upload })
  } catch (error) {
    return postizRouteError(error)
  }
}
