import Image from "next/image"
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

export function docsLayoutOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2 font-semibold">
          <Image
            src="/brand/lumenclip-mark.png"
            alt=""
            width={24}
            height={24}
            className="rounded-md"
          />
          LumenClip Docs
        </span>
      ),
      url: "/docs",
    },
    links: [
      { text: "Workspace", url: "/app" },
      { text: "Product", url: "/product" },
    ],
  }
}
