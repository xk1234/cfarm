import { StandardGenerationLoadingScreen } from "@/components/realfarm/generation-loading"

export default function Loading() {
  return (
    <div className="grid min-h-svh place-items-center bg-[#f7f7fa] p-6">
      <StandardGenerationLoadingScreen
        title="Loading workspace"
        description="Preparing the latest workspace state."
        className="w-full max-w-[420px] bg-white"
      />
    </div>
  )
}
