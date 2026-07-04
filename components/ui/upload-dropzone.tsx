"use client"

import type { ReactNode, RefObject } from "react"
import { Upload } from "lucide-react"

import { cn } from "@/lib/utils"

export function UploadDropzone({
  inputRef,
  accept,
  multiple,
  onFiles,
  children,
  className,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  accept?: string
  multiple?: boolean
  onFiles: (files: FileList | null) => void
  children?: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid min-h-44 w-full place-items-center rounded-lg border border-dashed border-app-panel-border bg-app-control-bg p-5 text-center hover:bg-app-control-hover",
        className,
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        onFiles(event.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          onFiles(event.currentTarget.files)
          event.currentTarget.value = ""
        }}
      />
      {children ?? (
        <span>
          <Upload className="mx-auto mb-3 size-8 text-app-muted-text" />
          <span className="block text-[15px] font-bold text-[#333]">Choose file</span>
        </span>
      )}
    </button>
  )
}
