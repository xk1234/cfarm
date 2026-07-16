"use client"

import { useEffect, type ReactNode, type RefObject } from "react"
import { Upload } from "lucide-react"
import { useDropzone, type Accept } from "react-dropzone"

import { cn } from "@/lib/utils"

export function UploadDropzone({
  inputRef,
  accept,
  multiple,
  disabled,
  onFiles,
  children,
  className,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  accept?: string
  multiple?: boolean
  disabled?: boolean
  onFiles: (files: FileList | null) => void
  children?: ReactNode
  className?: string
}) {
  const {
    getRootProps,
    getInputProps,
    inputRef: dropzoneInputRef,
    isDragActive,
    open,
  } = useDropzone({
    accept: dropzoneAccept(accept),
    multiple,
    disabled,
    noClick: true,
    onDropAccepted: (files) => onFiles(asFileList(files)),
  })

  useEffect(() => {
    inputRef.current = dropzoneInputRef.current
    return () => {
      inputRef.current = null
    }
  }, [dropzoneInputRef, inputRef])

  const rootProps = getRootProps({ onClick: open })
  const inputProps = getInputProps()

  return (
    <div
      {...rootProps}
      className={cn(
        "grid min-h-44 w-full cursor-pointer place-items-center rounded-lg border border-dashed border-app-panel-border bg-app-control-bg p-5 text-center transition outline-none hover:bg-app-control-hover focus-visible:border-app-action focus-visible:ring-3 focus-visible:ring-app-action/20",
        disabled && "cursor-not-allowed opacity-60",
        isDragActive && "border-app-action bg-app-action/5",
        className
      )}
    >
      <input {...inputProps} />
      {children ?? (
        <span>
          <Upload className="mx-auto mb-3 size-8 text-app-muted-text" />
          <span className="block text-[15px] font-bold text-app-text">
            Choose file
          </span>
        </span>
      )}
    </div>
  )
}

function dropzoneAccept(value?: string): Accept | undefined {
  const tokens = value
    ?.split(",")
    .map((token) => token.trim())
    .filter(Boolean)
  if (!tokens?.length) return undefined

  const mimeTypes = tokens.filter((token) => token.includes("/"))
  const extensions = tokens.filter((token) => token.startsWith("."))
  const result: Accept = Object.fromEntries(
    mimeTypes.map((mimeType, index) => [
      mimeType,
      index === 0 ? extensions : [],
    ])
  )
  if (mimeTypes.length === 0 && extensions.length > 0) {
    result["application/octet-stream"] = extensions
  }
  return result
}

function asFileList(files: File[]) {
  const transfer = new DataTransfer()
  files.forEach((file) => transfer.items.add(file))
  return transfer.files
}
