"use client"

import { ExternalLink } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCurrency, formatDate, cn } from "@/lib/utils"

/** Trendyol turuncu "t" işareti — marka logosu değil, sade bir işaret. */
function TrendyolMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center rounded-[3px] bg-orange-500 font-bold leading-none text-white",
        className,
      )}
      style={{ fontSize: "8px" }}
    >
      t
    </span>
  )
}

interface BuyboxHoverProps {
  children: React.ReactNode
  /**
   * Vitrindeki (BuyBox) fiyat. DİKKAT: vitrin BİZDEYSE bu bizim CANLI fiyatımızdır,
   * rakibin değil — kart etiketi buna göre değişir (2026-08-06 düzeltmesi: eskiden
   * her durumda "Rakip (BuyBox)" yazıyordu, vitrin bizdeyken yanlış bilgi veriyordu).
   */
  buyboxPrice: number
  /**
   * Sistemin bizim için hesapladığı Trendyol fiyatı (elle sabit veya formül).
   * Canlı fiyat DEĞİL — vitrin bizdeyse canlı fiyat `buyboxPrice`'tır.
   */
  ourPrice?: number | null
  /** BuyBox bizde mi (sıra = 1) */
  isOurs: boolean
  /** BİZ HARİÇ en ucuz rakip — vitrin bizdeyken tek anlamlı rakip sinyali */
  nextCompetitorPrice?: number | null
  /** Birim alış maliyeti (ana alış, yoksa cadde alışından çevrim) */
  cost?: number | null
  /** Maliyet hangi kaynaktan: ana depo mu cadde mi (etikette gösterilir) */
  costSource?: "MAIN" | "STREET" | null
  /** Zarar sınırı: kâr 0 fiyatı — altına inersen para kaybediyorsun */
  breakEven?: number | null
  /** Trendyol ürün sayfası — verilirse "Trendyol'da aç" bağlantısı çıkar */
  tyProductUrl?: string | null
  /** Son gözlem tarihi */
  observedAt?: Date | string | null
  /**
   * Vitrin fiyatına satarsak net marjımız (%). Verilirse
   * "o fiyata inersen bu kadar kâr/zarar" satırı gösterilir.
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
  nextCompetitorPrice,
  cost,
  costSource,
  breakEven,
  tyProductUrl,
  observedAt,
  marginAtMarket,
}: BuyboxHoverProps) {
  // Rakibin bizim fiyatımıza göre yüzde farkı (vitrin RAKİPTEyken anlamlı)
  const pct =
    !isOurs && ourPrice != null && ourPrice > 0
      ? ((buyboxPrice - ourPrice) / ourPrice) * 100
      : null
  const cheaper = pct != null && pct < -0.5 // rakip ucuz → kaybediyoruz
  const higher = pct != null && pct > 0.5 // rakip pahalı → fırsat
  const pctLabel = pct != null ? Math.abs(pct).toFixed(1).replace(".", ",") : null

  // Vitrin fiyatına satarsak birim başına net kâr/zarar (₺) — marj %'den türetilir
  const netAtMarket =
    marginAtMarket != null ? (buyboxPrice * marginAtMarket) / 100 : null
  const loss = netAtMarket != null && netAtMarket < 0

  // Vitrin bizdeyken: arkamızdaki en ucuz rakibe olan mesafe.
  // Rakip bizden ucuzsa vitrini fiyatla değil puan/teslimatla tutuyoruz → uyar.
  const gapToNext =
    isOurs && nextCompetitorPrice != null ? nextCompetitorPrice - buyboxPrice : null
  const undercutByRival = gapToNext != null && gapToNext < 0

  const durum = isOurs
    ? undercutByRival
      ? {
          text: "Vitrin bizde ama rakip bizden ucuz — konum kırılgan",
          cls: "text-amber-600 dark:text-amber-400",
        }
      : gapToNext != null && gapToNext > 0
        ? {
            text: `Vitrin bizde · rakip ${formatCurrency(nextCompetitorPrice!)} — fiyat yükseltme payı var`,
            cls: "text-emerald-600 dark:text-emerald-400",
          }
        : { text: "Vitrin bizde — tek satıcıyız", cls: "text-emerald-600 dark:text-emerald-400" }
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
            {/* Fiyat merdiveni: alış → zarar sınırı → piyasa → bizim fiyat.
                Bir bakışta "bu fiyata satabilir miyim" görünür. */}
            <div className="space-y-1.5">
              {cost != null && (
                <Row
                  label={costSource === "STREET" ? "Alış (cadde)" : "Alış"}
                  value={formatCurrency(cost)}
                  valueCls="text-muted-foreground"
                />
              )}
              {breakEven != null && (
                <Row
                  label="Zarar sınırı"
                  value={formatCurrency(breakEven)}
                  valueCls="text-muted-foreground"
                />
              )}
              {/* Vitrin bizdeyse bu fiyat BİZİM canlı fiyatımız — "rakip" demek yanlış */}
              <Row
                label={isOurs ? "Vitrin fiyatı (bizim)" : "Rakip (BuyBox)"}
                value={formatCurrency(buyboxPrice)}
                strong
                valueCls={
                  isOurs ? "text-emerald-600 dark:text-emerald-400" : undefined
                }
              />
              {isOurs && nextCompetitorPrice != null && (
                <Row
                  label="En yakın rakip"
                  value={formatCurrency(nextCompetitorPrice)}
                  valueCls={
                    undercutByRival
                      ? "font-semibold text-amber-600 dark:text-amber-400"
                      : undefined
                  }
                />
              )}
              {ourPrice != null ? (
                <Row
                  label={isOurs ? "Sistem hedefi" : "Bizim TY fiyatı"}
                  value={formatCurrency(ourPrice)}
                  valueCls={!isOurs ? undefined : "text-muted-foreground"}
                />
              ) : (
                !isOurs && (
                  <Row label="Bizim TY fiyatı" value="—" valueCls="text-muted-foreground" />
                )
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
            {/* Vitrin fiyatına satarsak kâr/zarar — vitrin bizde olsa da gösterilir
                (kullanıcı isteği 2026-08-17: "kaç kâra/zarara satıyoruz" tek bakışta) */}
            {netAtMarket != null && (
              <div
                className={cn(
                  "rounded-md border px-2 py-1.5",
                  loss
                    ? "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30"
                    : "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
                )}
              >
                <p className="text-[10px] text-muted-foreground">
                  {isOurs
                    ? "Bu fiyattan satıyorsun (birim başına)"
                    : "Rakip fiyatına satarsan (birim başına)"}
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
            {tyProductUrl && (
              <a
                href={tyProductUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2 py-1.5 text-[11px] font-medium text-orange-700 transition-colors hover:bg-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:bg-orange-950/60"
              >
                <TrendyolMark className="h-3 w-3 shrink-0" />
                Trendyol&apos;da aç
                <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-60" />
              </a>
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
