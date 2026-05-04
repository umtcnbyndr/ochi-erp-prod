/**
 * Lifetime Demand Score görsel rozeti.
 *
 * 0-100 arası skoru renk + etiketle gösterir:
 *   80-100 → koyu yeşil  (Best-seller)
 *   60-80  → yeşil       (İyi satıcı)
 *   40-60  → sarı        (Normal)
 *   20-40  → turuncu     (Düşük talep)
 *   0-20   → kırmızı     (Çok düşük)
 *   null   → muted       (Veri yok)
 *
 * Boy seçenekleri:
 *   - "compact" : sadece sayı + renk (ürün listesinde)
 *   - "default" : sayı + emoji (ürün detayında)
 *   - "full"    : sayı + label + emoji (kart başlığında)
 */
import { cn } from "@/lib/utils"

export type LifetimeBracket =
  | "BEST_SELLER"
  | "GOOD"
  | "NORMAL"
  | "LOW"
  | "VERY_LOW"
  | "NONE"

export const BRACKETS: Array<{
  key: LifetimeBracket
  min: number
  max: number
  label: string
  emoji: string
  className: string
}> = [
  {
    key: "BEST_SELLER",
    min: 80,
    max: 100,
    label: "Best-seller",
    emoji: "🔥",
    className:
      "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-700 dark:text-white",
  },
  {
    key: "GOOD",
    min: 60,
    max: 80,
    label: "İyi satıcı",
    emoji: "⭐",
    className:
      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  {
    key: "NORMAL",
    min: 40,
    max: 60,
    label: "Normal",
    emoji: "🟡",
    className:
      "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300",
  },
  {
    key: "LOW",
    min: 20,
    max: 40,
    label: "Düşük talep",
    emoji: "🟠",
    className:
      "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300",
  },
  {
    key: "VERY_LOW",
    min: 0,
    max: 20,
    label: "Çok düşük",
    emoji: "🔴",
    className:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
  },
]

const NONE_CLASSNAME =
  "bg-muted text-muted-foreground border-border"

/** Skor → bracket key */
export function scoreToBracket(score: number | null | undefined): LifetimeBracket {
  if (score == null) return "NONE"
  for (const b of BRACKETS) {
    if (score >= b.min && score < b.max) return b.key
    if (score >= 100 && b.key === "BEST_SELLER") return b.key
  }
  return "NONE"
}

interface Props {
  score: number | null | undefined
  size?: "compact" | "default" | "full"
  className?: string
}

export function LifetimeBadge({ score, size = "default", className }: Props) {
  const bracket = scoreToBracket(score)
  const info = BRACKETS.find((b) => b.key === bracket)
  const colorClass = info?.className ?? NONE_CLASSNAME
  const display = score != null ? Math.round(score) : "—"

  const baseClass = cn(
    "inline-flex items-center gap-1 rounded-md border font-semibold tabular-nums",
    colorClass,
    className,
  )

  if (size === "compact") {
    return (
      <span
        className={cn(baseClass, "px-1.5 py-0.5 text-[10px]")}
        title={info ? `Lifetime: ${info.label}` : "Lifetime verisi yok"}
      >
        {info?.emoji && <span>{info.emoji}</span>}
        {display}
      </span>
    )
  }

  if (size === "full") {
    return (
      <span
        className={cn(baseClass, "px-2.5 py-1 text-xs")}
        title={`Lifetime skoru ${score != null ? "/100" : "yok"}`}
      >
        {info?.emoji && <span>{info.emoji}</span>}
        <span>{display}</span>
        {info && info.key !== "NONE" && (
          <span className="font-normal opacity-80">· {info.label}</span>
        )}
      </span>
    )
  }

  // default
  return (
    <span
      className={cn(baseClass, "px-2 py-0.5 text-xs")}
      title={info ? `Lifetime: ${info.label}` : "Lifetime verisi yok"}
    >
      {info?.emoji && <span>{info.emoji}</span>}
      {display}
    </span>
  )
}
