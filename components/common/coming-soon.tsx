import { Construction } from "lucide-react"
import { EmptyState } from "./empty-state"

export function ComingSoon({ phase, description }: { phase: string; description: string }) {
  return (
    <EmptyState
      icon={Construction}
      title={`${phase} — Yakında`}
      description={description}
    />
  )
}
