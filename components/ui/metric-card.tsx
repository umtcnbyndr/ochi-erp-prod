/**
 * MetricCard — modern KPI gösterimi (21st.dev / Vercel Geist tarzı).
 *
 * Pattern:
 *   ┌──────────────────────────────────┐
 *   │ LABEL              [Icon]        │
 *   │                                  │
 *   │  VALUE                           │
 *   │  ↑ +12 delta · subtitle          │
 *   └──────────────────────────────────┘
 */
import Link from "next/link"
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

export interface MetricCardProps {
  label: string
  value: string | number
  /** "Bugün", "12 satır", vs alt metni */
  subtitle?: string
  /** İsteğe bağlı yön+sayı */
  delta?: {
    value: number
    label?: string
    direction?: "up" | "down" | "flat"
  }
  /** Sağ üst köşe ikonu */
  icon?: LucideIcon
  /** Kartın aksent rengi (sadece ikon ve subtle background için) */
  tone?: "default" | "info" | "success" | "warning" | "danger" | "campaign"
  /** Kart tıklanabilir olsun mu */
  href?: string
  /** Status dot (şekil gibi yan yana renk) */
  statusDot?: { color: "emerald" | "amber" | "red" | "muted"; label?: string }
  className?: string
}

const TONE_ICON_BG: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-destructive",
  campaign: "bg-campaign-soft text-campaign",
}

const STATUS_DOT_BG: Record<NonNullable<MetricCardProps["statusDot"]>["color"], string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  muted: "bg-muted-foreground/30",
}

const STATUS_DOT_TEXT: Record<NonNullable<MetricCardProps["statusDot"]>["color"], string> = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  muted: "text-muted-foreground",
}

export function MetricCard({
  label,
  value,
  subtitle,
  delta,
  icon: Icon,
  tone = "default",
  href,
  statusDot,
  className,
}: MetricCardProps) {
  const content = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors",
        href && "hover:border-foreground/20 hover:bg-accent/30 cursor-pointer",
        className,
      )}
    >
      {/* Header: label + icon */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {statusDot && (
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT_BG[statusDot.color])} />
          )}
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        </div>
        {Icon && (
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              TONE_ICON_BG[tone],
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      {/* Value */}
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums leading-none">
        {value}
      </p>

      {/* Footer: delta + subtitle */}
      {(delta || subtitle || statusDot?.label) && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] tabular-nums">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                delta.direction === "up"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : delta.direction === "down"
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground",
              )}
            >
              {delta.direction === "up" && <TrendingUp className="h-3 w-3" />}
              {delta.direction === "down" && <TrendingDown className="h-3 w-3" />}
              {delta.direction === "flat" && <Minus className="h-3 w-3" />}
              {delta.value > 0 && delta.direction === "up" && "+"}
              {delta.value}
              {delta.label && <span className="font-normal opacity-80"> · {delta.label}</span>}
            </span>
          )}
          {statusDot?.label && (
            <span className={cn("font-medium", STATUS_DOT_TEXT[statusDot.color])}>
              {statusDot.label}
            </span>
          )}
          {subtitle && (
            <span className="text-muted-foreground truncate">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  )

  return href ? <Link href={href}>{content}</Link> : content
}
