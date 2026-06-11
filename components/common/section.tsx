import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface SectionProps {
  title: string
  /** Sağda gösterilen kısa metin (örn. "Bugün yüklenen") */
  hint?: string
  /** Sağda "Tümünü gör" gibi action link */
  action?: { label: string; href: string }
  /** Custom sağda render */
  rightSlot?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * PageSection — tüm sayfalarda tutarlı bölüm başlığı.
 *
 * Pattern (Panel'den genelleştirildi):
 *   ┌─────────────────────────────────────────┐
 *   │ BÖLÜM ADI            hint / action →    │
 *   │                                          │
 *   │ [children: grid / kartlar / tablo]      │
 *   └─────────────────────────────────────────┘
 */
export function Section({ title, hint, action, rightSlot, className, children }: SectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {rightSlot ? (
          rightSlot
        ) : action ? (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {action.label}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : hint ? (
          <p className="text-xs text-muted-foreground shrink-0">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}
