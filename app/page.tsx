import { RealFarmWorkspace } from "@/components/realfarm-workspace"
import { loadRealFarmData } from "@/lib/realfarm-data"

export default function Page() {
  const data = loadRealFarmData()

  return <RealFarmWorkspace data={data} />
}
