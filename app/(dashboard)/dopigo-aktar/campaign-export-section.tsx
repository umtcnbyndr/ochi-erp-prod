"use client"

import { useState, useEffect, useTransition } from "react"
import { toast } from "sonner"
import {
  Download,
  Eye,
  Megaphone,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type CampaignAktarSummary,
  type CampaignProductPreview,
  previewCampaignProductsAction,
  exportCampaignAction,
  listCampaignsForAktarAction,
} from "./actions"

export function CampaignExportSection() {
  const [campaigns, setCampaigns] = useState<CampaignAktarSummary[] | null>(null)
  const [loading, startLoad] = useTransition()

  useEffect(() => {
    startLoad(async () => {
      const data = await listCampaignsForAktarAction()
      setCampaigns(data)
    })
  }, [])

  if (loading && campaigns === null) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Kampanyalar yükleniyor…
        </CardContent>
      </Card>
    )
  }

  if (campaigns !== null && campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aktif veya yakın zamanda bitmiş kampanya yok.
        </CardContent>
      </Card>
    )
  }

  const active = campaigns?.filter((c) => c.status === "ACTIVE") ?? []
  const ended = campaigns?.filter((c) => c.status === "ENDED") ?? []

  return (
    <div className="space-y-4 pb-24">
      {active.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-pink-600" />
            <h3 className="text-sm font-semibold">
              Aktif Kampanyalar ({active.length})
            </h3>
          </div>
          {active.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">
              Bitmiş Kampanyalar ({ended.length})
            </h3>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Kampanya bitti — bu ürünlerin fiyatlarını normale döndürmek için
            &quot;Eski Fiyatlara Döndür&quot; Excel&apos;ini indirip Dopigo&apos;ya yükle.
          </p>
          {ended.map((c) => (
            <CampaignCard key={c.id} campaign={c} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tek Kampanya Kartı ─────────────────────────────────────

function CampaignCard({ campaign }: { campaign: CampaignAktarSummary }) {
  const [expanded, setExpanded] = useState(false)
  const [products, setProducts] = useState<CampaignProductPreview[] | null>(null)
  const [previewLoading, startPreview] = useTransition()
  const [exporting, startExport] = useTransition()

  const isActive = campaign.status === "ACTIVE"

  function handleToggle() {
    if (!expanded && products === null) {
      // İlk açılışta ürünleri çek
      startPreview(async () => {
        const result = await previewCampaignProductsAction(campaign.id)
        if (!result.success) {
          toast.error(result.error)
          return
        }
        setProducts(result.data)
        setExpanded(true)
      })
    } else {
      setExpanded((v) => !v)
    }
  }

  function handleExport(revertToNormal: boolean) {
    startExport(async () => {
      const label = revertToNormal ? "Normal fiyat" : "Kampanyalı"
      toast.info(`${label} Excel hazırlanıyor…`)
      const result = await exportCampaignAction({
        campaignId: campaign.id,
        revertToNormal,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      downloadExcel(
        result.data.base64,
        result.data.filename,
        result.data.rowCount,
      )
    })
  }

  const borderColor = isActive
    ? "border-pink-200 dark:border-pink-900"
    : "border-amber-200 dark:border-amber-900"

  return (
    <Card className={borderColor}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="text-sm font-medium truncate">
              {campaign.name}
            </CardTitle>
            <Badge
              variant="secondary"
              className={
                isActive
                  ? "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              }
            >
              {isActive ? "Aktif" : "Bitti"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <span>%{campaign.discountRate.toFixed(0)} iskonto</span>
            <span>·</span>
            <span>{campaign.productCount} ürün</span>
            {campaign.brandName && (
              <>
                <span>·</span>
                <span>{campaign.brandName}</span>
              </>
            )}
          </div>
        </div>

        {/* Tarihler */}
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatDate(campaign.startDate)} — {formatDate(campaign.endDate)}
          {campaign.endedAt && (
            <span className="ml-2 text-amber-600">
              (sonlandırıldı: {formatDate(campaign.endedAt)})
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Butonlar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleToggle}
            disabled={previewLoading}
          >
            {previewLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {previewLoading
              ? "Yükleniyor…"
              : expanded
                ? "Gizle"
                : "Ürünleri Göster"}
          </Button>

          {isActive && (
            <Button
              size="sm"
              variant="campaign"
              className="gap-1.5"
              onClick={() => handleExport(false)}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {exporting ? "Hazırlanıyor…" : "Kampanyalı Excel İndir"}
            </Button>
          )}

          {!isActive && (
            <Button
              size="sm"
              variant="warning"
              className="gap-1.5"
              onClick={() => handleExport(true)}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {exporting ? "Hazırlanıyor…" : "Eski Fiyatlara Döndür Excel'i"}
            </Button>
          )}

          {/* Bitmiş kampanyanın kampanyalı Excel'i de indirilebilir (referans) */}
          {!isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => handleExport(false)}
              disabled={exporting}
            >
              <Download className="h-3.5 w-3.5" />
              Kampanyalı (referans)
            </Button>
          )}
        </div>

        {/* Ürün preview tablosu */}
        {expanded && products != null && (
          <ProductPreviewTable products={products} campaignStatus={campaign.status} />
        )}
      </CardContent>
    </Card>
  )
}

// ─── Ürün Önizleme Tablosu ─────────────────────────────────

function ProductPreviewTable({
  products,
  campaignStatus,
}: {
  products: CampaignProductPreview[]
  campaignStatus: "ACTIVE" | "ENDED"
}) {
  if (products.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Bu kampanyada ürün yok.
      </p>
    )
  }

  return (
    <div className="rounded-md border max-h-[500px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-muted z-10">
          <TableRow>
            <TableHead className="min-w-[220px]">Ürün</TableHead>
            <TableHead className="text-right tabular-nums">PSF</TableHead>
            <TableHead className="text-right tabular-nums">Mevcut Alış</TableHead>
            <TableHead className="text-right tabular-nums">Kampanyalı Alış</TableHead>
            <TableHead className="text-right tabular-nums">Normal Satış</TableHead>
            <TableHead className="text-right tabular-nums">Kampanyalı Satış</TableHead>
            <TableHead className="text-right tabular-nums">Fark</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => {
            const diff =
              p.normalWebsiteSale != null && p.websiteSale != null
                ? p.normalWebsiteSale - p.websiteSale
                : null
            return (
              <TableRow key={p.productId}>
                <TableCell className="text-sm">
                  <div className="truncate max-w-[260px]" title={p.name}>
                    {p.name}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {p.primaryBarcode}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {p.psf != null ? `₺${p.psf.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {p.mainPurchasePrice != null
                    ? `₺${p.mainPurchasePrice.toFixed(2)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {p.campaignPurchase != null ? (
                    <span className="text-pink-600 font-medium">
                      ₺{p.campaignPurchase.toFixed(2)}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {p.normalWebsiteSale != null
                    ? `₺${p.normalWebsiteSale.toFixed(2)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {p.websiteSale != null ? (
                    <span className="text-pink-600 font-medium">
                      ₺{p.websiteSale.toFixed(2)}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {diff != null ? (
                    <span className="text-emerald-600 font-medium">
                      -₺{diff.toFixed(2)}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <div className="px-3 py-2 border-t bg-muted/50 text-[11px] text-muted-foreground">
        {campaignStatus === "ACTIVE"
          ? "Kampanyalı satış = indirimli alış ile formül sonucu. BuyBox baskısı bu ürünlere uygulanmaz."
          : "Kampanya bitmiş — \"Eski Fiyatlara Döndür\" Excel'i normal alış fiyatlarıyla hesaplanır."}
      </div>
    </div>
  )
}

// ─── Yardımcılar ─────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function downloadExcel(base64: string, filename: string, rowCount: number) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(`${rowCount} ürünlü Excel indirildi: ${filename}`)
}
