"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCurrency, formatDate, cn } from "@/lib/utils"

interface BuyboxHoverProps {
  children: React.ReactNode
  /** Rakip / BuyBox fiyatı */
  buyboxPrice: number
  /** Bizim Trendyol satış fiyatımız (yoksa null) */
  ourPrice?: number | null
  /** BuyBox bizde mi (sıra = 1) */
  isOurs: boolean
  /** Son gözlem tarihi */
  observedAt?: Date | string | null
  /**
   * Rakip (BuyBox) fiyatına satarsak net marjımız (%). Verilirse
   * "rakip fiyatına inersen bu kadar kâr/zarar" satırı gösterilir.
   * (komisyon + kargo + stopaj düşülmüş net)
   */
  marginAtMarket?: number | null
}

/**
 * BuyBox çipinin üstüne gelince çıkan tasarımlı karşılaştırma kutusu.
 * Rakip fiyatı vs bizim fiyat + fark + durum + son gözlem.
 * Ürünler ve Pazar Fiyat Takip'te ortak kullanılır.
 */
export function BuyboxHover({
  children,
  buyboxPrice,
  ourPrice,
  isOurs,
  observedAt,
  marginAtMarket,
}: BuyboxHoverProps) {
  // Rakibin bizim fiyatımıza göre yüzde farkı
  const pct =
    !isOurs && ourPrice != null && ourPrice > 0
      ? ((buyboxPrice - ourPrice) / ourPrice) * 100
      : null
  const cheaper = pct != null && pct < -0.5 // rakip ucuz → kaybediyoruz
  const higher = pct != null && pct > 0.5 // rakip pahalı → fırsat
  const pctLabel = pct != null ? Math.abs(pct).toFixed(1).replace(".", ",") : null

  // Rakip fiyatına satarsak birim başına net kâr/zarar (₺) — marj %'den türetilir
  const netAtMarket =
    marginAtMarket != null ? (buyboxPrice * marginAtMarket) / 100 : null
  const loss = netAtMarket != null && netAtMarket < 0

  const durum = isOurs
    ? { text: "BuyBox bizde — en iyi konumdasın", cls: "text-emerald-600 dark:text-emerald-400" }
    : cheaper
      ? { text: "Rakip bizden ucuz — BuyBox'ı kaybediyoruz", cls: "text-rose-600 dark:text-rose-400" }
      : higher
        ? { text: "Rakip bizden pahalı — fiyat yükseltme fırsatı", cls: "text-emerald-600 dark:text-emerald-400" }
        : { text: "Piyasadaki rakip fiyatı", cls: "text-muted-foreground" }

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="w-60 rounded-lg border bg-popover p-0 text-popover-foreground shadow-md"
        >
          <div className="space-y-2 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              BuyBox Karşılaştırma
            </p>
            <div className="space-y-1.5">
              <Row label="Rakip (BuyBox)" value={formatCurrency(buyboxPrice)} strong />
              {ourPrice != null ? (
                <Row
                  label="Bizim TY fiyatı"
                  value={formatCurrency(ourPrice)}
                  valueCls={isOurs ? "font-semibold text-emerald-600 dark:text-emerald-400" : undefined}
                />
              ) : (
                <Row label="Bizim TY fiyatı" value="—" valueCls="text-muted-foreground" />
              )}
              {pctLabel && (
                <Row
                  label="Fark"
                  value={`${higher ? "▲" : "▼"} %${pctLabel}`}
                  valueCls={
                    cheaper
                      ? "font-semibold text-rose-600 dark:text-rose-400"
                      : "font-semibold text-emerald-600 dark:text-emerald-400"
                  }
                />
              )}
            </div>
            {netAtMarket != null && !isOurs && (
              <div
                className={cn(
                  "rounded-md border px-2 py-1.5",
                  loss
                    ? "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30"
                    : "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
                )}
              >
                <p className="text-[10px] text-muted-foreground">
                  Rakip fiyatına satarsan (birim başına)
                </p>
                <p
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    loss ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {loss ? "−" : "+"}
                  {formatCurrency(Math.abs(netAtMarket))}
                  <span className="ml-1 text-[11px] font-medium">
                    {loss ? "zarar" : "kâr"} · %{Math.abs(marginAtMarket!).toFixed(1).replace(".", ",")} marj
                  </span>
                </p>
              </div>
            )}
            <p className={cn("border-t pt-2 text-[11px] font-medium leading-snug", durum.cls)}>
              {durum.text}
            </p>
            {observedAt && (
              <p className="text-[10px] text-muted-foreground">
                Son gözlem: {formatDate(observedAt)}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function Row({
  label,
  value,
  strong,
  valueCls,
}: {
  label: string
  value: string
  strong?: boolean
  valueCls?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", strong && "font-semibold", valueCls)}>
        {value}
      </span>
    </div>
  )
}
